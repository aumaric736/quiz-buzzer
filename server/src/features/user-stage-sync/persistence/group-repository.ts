import { randomUUID } from 'node:crypto';
import type { GroupRecord } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from './database.js';

export function insertGroup(db: SqliteDatabase, activityId: string, displayName: string, normalizedName: string): GroupRecord {
  const groupId = randomUUID();
  db.prepare('INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at) VALUES (?, ?, ?, ?, ?)')
    .run(groupId, activityId, displayName, normalizedName, new Date().toISOString());
  return { groupId, activityId, displayName };
}

export function findGroupByName(db: SqliteDatabase, activityId: string, normalizedName: string): GroupRecord | undefined {
  const row = db.prepare('SELECT id, activity_id, display_name FROM groups WHERE activity_id = ? AND normalized_name = ?')
    .get(activityId, normalizedName) as { id: string; activity_id: string; display_name: string } | undefined;
  return row ? { groupId: row.id, activityId: row.activity_id, displayName: row.display_name } : undefined;
}
