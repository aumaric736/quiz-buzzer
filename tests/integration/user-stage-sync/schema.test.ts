import { describe, expect, it } from 'vitest';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('user-stage-sync SQLite schema', () => {
  it('creates the three persistent entities and enforces the allowed role/phase/revision values', () => {
    const db = createTestDatabase();
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => (row as { name: string }).name);
      expect(tables).toEqual(expect.arrayContaining(['user_sessions', 'activities', 'groups']));
      expect(() => db.prepare('INSERT INTO user_sessions (id, role, updated_at) VALUES (?, ?, ?)').run('bad', 'admin', 'now')).toThrow();
      db.prepare('INSERT INTO user_sessions (id, role, updated_at) VALUES (?, ?, ?)').run('teacher-1', 'teacher', 'now');
      expect(() => db.prepare('INSERT INTO activities (id, phase, revision, created_by_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('bad', 'unknown', 0, 'teacher-1', 'now', 'now')).toThrow();
      expect(() => db.prepare('INSERT INTO activities (id, phase, revision, created_by_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('bad', '準備中', -1, 'teacher-1', 'now', 'now')).toThrow();
    } finally { db.close(); }
  });

  it('rejects duplicate normalized group names and blank display names', () => {
    const db = createTestDatabase();
    try {
      db.prepare('INSERT INTO user_sessions (id, role, updated_at) VALUES (?, ?, ?)').run('teacher-1', 'teacher', 'now');
      db.prepare('INSERT INTO activities (id, phase, revision, created_by_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('activity-1', '準備中', 0, 'teacher-1', 'now', 'now');
      const insert = db.prepare('INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at) VALUES (?, ?, ?, ?, ?)');
      insert.run('group-1', 'activity-1', 'Blue Team', 'blue team', 'now');
      expect(() => insert.run('group-2', 'activity-1', 'blue team', 'blue team', 'now')).toThrow();
      expect(() => insert.run('group-3', 'activity-1', ' ', '', 'now')).toThrow();
    } finally { db.close(); }
  });
});
