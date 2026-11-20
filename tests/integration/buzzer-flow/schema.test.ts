import { afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';

describe('buzzer-flow SQLite migration', () => {
  let db: Database.Database | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  function seedBaseRows(database: Database.Database): void {
    database.prepare("INSERT INTO user_sessions (id, role, updated_at) VALUES (?, 'teacher', 'now')").run('teacher-1');
    database.prepare("INSERT INTO user_sessions (id, role, updated_at) VALUES (?, 'student', 'now')").run('student-1');
    const insertActivity = database.prepare("INSERT INTO activities (id, phase, revision, created_by_session_id, created_at, updated_at) VALUES (?, '準備中', 0, ?, 'now', 'now')");
    insertActivity.run('activity-1', 'teacher-1');
    insertActivity.run('activity-2', 'teacher-1');
    const insertQuestion = database.prepare('INSERT INTO activity_questions (id, activity_id, question_number, created_at) VALUES (?, ?, ?, ?)');
    insertQuestion.run('question-1', 'activity-1', 1, 'now');
    insertQuestion.run('question-2', 'activity-1', 2, 'now');
    insertQuestion.run('question-3', 'activity-2', 1, 'now');
    const insertGroup = database.prepare('INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at) VALUES (?, ?, ?, ?, ?)');
    insertGroup.run('group-1', 'activity-1', 'Blue', 'blue', 'now');
    insertGroup.run('group-2', 'activity-2', 'Green', 'green', 'now');
    insertGroup.run('group-3', 'activity-1', 'Red', 'red', 'now');
  }

  it('creates the winner table with its generated order and activity-question/group foreign keys', () => {
    db = openDatabase(':memory:');
    seedBaseRows(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => (row as { name: string }).name);
    expect(tables).toContain('buzzer_submissions');

    const insert = db.prepare(`INSERT INTO buzzer_submissions
      (activity_id, question_number, group_id, answer_parts_json, accepted_at, submission_rank, is_winner)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run('activity-1', 1, 'group-1', '["answer"]', 'now', 1, 1);
    insert.run('activity-1', 2, 'group-1', '["answer"]', 'now', 1, 1);
    const generated = db.prepare('SELECT accepted_order FROM buzzer_submissions ORDER BY accepted_order').all() as Array<{ accepted_order: number }>;
    expect(generated[0].accepted_order).toBeGreaterThan(0);
    expect(generated[1].accepted_order).toBeGreaterThan(generated[0].accepted_order);

    insert.run('activity-1', 1, 'group-3', '["other"]', 'now', 2, 0);
    expect(() => insert.run('activity-2', 1, 'group-1', '["other"]', 'now', 1, 1)).toThrow();
    expect(() => insert.run('activity-2', 1, 'missing-group', '["other"]', 'now', 1, 1)).toThrow();
  });

  it('accepts a JSON array but rejects malformed JSON and non-array payloads', () => {
    db = openDatabase(':memory:');
    seedBaseRows(db);
    const insert = db.prepare(`INSERT INTO buzzer_submissions
      (activity_id, question_number, group_id, answer_parts_json, accepted_at, submission_rank, is_winner)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run('activity-1', 1, 'group-1', '["first","second"]', 'now', 1, 1);
    expect(() => insert.run('activity-1', 2, 'group-1', 'not-json', 'now', 1, 1)).toThrow();
    expect(() => insert.run('activity-1', 2, 'group-1', '{"answer":"value"}', 'now', 1, 1)).toThrow();
  });
});
