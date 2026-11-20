import { afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';

describe('guided-notes SQLite migration', () => {
  let db: Database.Database | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  it('creates Guided Notes entities while preserving the existing activity schema', () => {
    db = openDatabase(':memory:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => (row as { name: string }).name);
    expect(tables).toEqual(expect.arrayContaining([
      'user_sessions', 'activities', 'groups', 'activity_questions', 'guided_notes_sources',
      'guided_notes_blank_mappings', 'guided_notes_export_attempts'
    ]));
  });

  it('enforces positive unique question numbers', () => {
    db = openDatabase(':memory:');
    db.prepare("INSERT INTO user_sessions (id, role, updated_at) VALUES (?, 'teacher', 'now')").run('teacher-1');
    db.prepare("INSERT INTO activities (id, phase, revision, created_by_session_id, created_at, updated_at) VALUES (?, '準備中', 0, ?, 'now', 'now')").run('activity-1', 'teacher-1');
    db.prepare('INSERT INTO activity_questions (activity_id, question_number, created_at) VALUES (?, ?, ?)').run('activity-1', 1, 'now');
    expect(() => db!.prepare('INSERT INTO activity_questions (activity_id, question_number, created_at) VALUES (?, ?, ?)').run('activity-1', 1, 'now')).toThrow();
    expect(() => db!.prepare('INSERT INTO activity_questions (activity_id, question_number, created_at) VALUES (?, ?, ?)').run('activity-1', 0, 'now')).toThrow();
  });
});
