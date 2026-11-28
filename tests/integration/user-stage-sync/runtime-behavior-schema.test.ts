import Database from 'better-sqlite3';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations, DEFAULT_MIGRATION_PATH, openDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';

const migrationDirectory = dirname(DEFAULT_MIGRATION_PATH);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d{3}-.+\.sql$/.test(name))
  .sort();

function applyThrough008(db: SqliteDatabase): void {
  for (const name of migrationFiles.filter((file) => file < '009-runtime-behavior-alignment.sql')) {
    applyMigrations(db, resolve(migrationDirectory, name));
  }
}

function seedLegacyActivity(
  db: SqliteDatabase,
  id: string,
  questionMappings: Array<{ number: number; slots: number[] }> | null,
  options: { assignedStudent?: boolean; disconnected?: boolean } = {},
): void {
  const now = '2026-01-02T03:04:05.000Z';
  db.prepare(`INSERT INTO activities (id, phase, created_by_session_id, created_at, updated_at)
    VALUES (?, '準備中', 'teacher', ?, ?)`).run(id, now, now);
  db.prepare(`INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at, invite_code)
    VALUES (?, ?, ?, ?, ?, '000001')`).run(`${id}-group`, id, `${id} Group`, `${id.toLowerCase()} group`, now);

  if (options.assignedStudent !== false) {
    db.prepare(`INSERT INTO user_sessions
      (id, role, activity_id, group_id, group_role, updated_at, disconnected_until)
      VALUES (?, 'student', ?, ?, 'leader', ?, ?)`)
      .run(`${id}-student`, id, `${id}-group`, now, options.disconnected ? '2026-01-02T03:06:05.000Z' : null);
  }

  if (!questionMappings) return;

  db.prepare(`INSERT INTO guided_notes_sources
    (id, activity_id, spreadsheet_id, sheet_id, sheet_title, structure_fingerprint, imported_at, updated_at)
    VALUES (?, ?, ?, 1, 'Legacy worksheet', 'legacy-fingerprint', ?, ?)`)
    .run(`${id}-source`, id, `${id}-spreadsheet`, now, now);

  const insertQuestion = db.prepare(`INSERT INTO activity_questions
    (id, activity_id, question_number, created_at) VALUES (?, ?, ?, ?)`);
  const insertMapping = db.prepare(`INSERT INTO guided_notes_blank_mappings
    (source_id, activity_id, question_number, slot_order, row_index, column_index, blank_kind)
    VALUES (?, ?, ?, ?, ?, ?, 'text')`);
  for (const question of questionMappings) {
    insertQuestion.run(`${id}-question-${question.number}`, id, question.number, now);
    question.slots.forEach((slot, index) => {
      insertMapping.run(`${id}-source`, id, question.number, slot, question.number * 10 + index, 1);
    });
  }
}

describe('runtime behavior schema migration', () => {
  let db: SqliteDatabase | undefined;

  afterEach(() => { db?.close(); db = undefined; });

  it('is automatically discovered after migration 008 and adds all new columns', () => {
    db = openDatabase(':memory:');
    const applied = db.prepare('SELECT name FROM schema_migrations ORDER BY name').all()
      .map((row) => (row as { name: string }).name);

    expect(applied).toEqual(migrationFiles);
    expect(applied).toContain('005-user-stage-recovery.sql');
    expect(applied.at(-1)).toBe('009-runtime-behavior-alignment.sql');

    const activityColumns = db.pragma('table_info(activities)') as Array<{ name: string }>;
    const sessionColumns = db.pragma('table_info(user_sessions)') as Array<{ name: string }>;
    const questionColumns = db.pragma('table_info(activity_questions)') as Array<{ name: string }>;
    expect(activityColumns.map(({ name }) => name)).toContain('joining_opened_at');
    expect(sessionColumns.map(({ name }) => name)).toContain('disconnected_at');
    expect(questionColumns.map(({ name }) => name)).toContain('display_order');
  });

  it('backfills question order, opens only ready assigned activities, and retains offline recovery associations', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    applyThrough008(db);
    db.prepare(`INSERT INTO user_sessions (id, role, updated_at) VALUES ('teacher', 'teacher', '2026-01-01T00:00:00.000Z')`).run();

    seedLegacyActivity(db, 'ready', [
      { number: 5, slots: [0] },
      { number: 1, slots: [0, 1] },
      { number: 3, slots: [0] },
    ], { disconnected: true });
    seedLegacyActivity(db, 'starts-at-one', [{ number: 1, slots: [1] }]);
    seedLegacyActivity(db, 'has-gap', [{ number: 1, slots: [0, 2] }]);
    seedLegacyActivity(db, 'has-no-mapping', [{ number: 1, slots: [] }]);
    seedLegacyActivity(db, 'no-questions', []);
    seedLegacyActivity(db, 'no-assigned-student', [{ number: 1, slots: [0] }], { assignedStudent: false });

    applyMigrations(db);

    expect(db.prepare('SELECT joining_opened_at AS openedAt FROM activities WHERE id = ?').get('ready'))
      .toEqual({ openedAt: '2026-01-02T03:04:05.000Z' });
    for (const id of ['starts-at-one', 'has-gap', 'has-no-mapping', 'no-questions', 'no-assigned-student']) {
      expect(db.prepare('SELECT joining_opened_at AS openedAt FROM activities WHERE id = ?').get(id))
        .toEqual({ openedAt: null });
    }

    expect(db.prepare(`SELECT question_number AS number, display_order AS displayOrder
      FROM activity_questions WHERE activity_id = 'ready' ORDER BY display_order`).all())
      .toEqual([
        { number: 1, displayOrder: 0 },
        { number: 3, displayOrder: 1 },
        { number: 5, displayOrder: 2 },
      ]);
    expect(db.prepare(`SELECT role, activity_id AS activityId, group_id AS groupId, group_role AS groupRole,
      disconnected_at AS disconnectedAt FROM user_sessions WHERE id = 'ready-student'`).get())
      .toEqual({
        role: 'student',
        activityId: 'ready',
        groupId: 'ready-group',
        groupRole: 'leader',
        disconnectedAt: '2026-01-02T03:04:05.000Z',
      });
    expect(db.prepare(`SELECT COUNT(*) AS count FROM user_sessions
      WHERE id IN ('starts-at-one-student', 'has-gap-student', 'has-no-mapping-student', 'no-questions-student')
        AND group_id IS NOT NULL`).get()).toEqual({ count: 4 });
  });
});
