import { randomInt, randomUUID } from 'node:crypto';
import type { GroupRecord } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from './database.js';

export function formatInviteCode(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 1_000_000) throw new RangeError('Invite code value must be between 0 and 999999.');
  return value.toString().padStart(6, '0');
}

export function createGroupWithInviteCode(db: SqliteDatabase, activityId: string, displayName: string, leaderSessionId: string, nextValue = () => randomInt(0, 1_000_000)): GroupRecord {
  const groupId = randomUUID();
  const now = new Date().toISOString();
  const create = db.transaction(() => {
    const groupCount = (db.prepare('SELECT count(*) AS total FROM groups WHERE activity_id = ?').get(activityId) as { total: number }).total;
    if (groupCount >= 100) throw new Error('GROUP_LIMIT_REACHED');
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const inviteCode = formatInviteCode(nextValue());
      try {
        db.prepare('INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at, invite_code, leader_session_id, accepts_members) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
          .run(groupId, activityId, displayName, displayName.toLowerCase(), now, inviteCode, leaderSessionId);
        return { groupId, activityId, displayName, inviteCode };
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('groups.activity_id, groups.normalized_name')) throw new Error('GROUP_NAME_TAKEN');
        if (!message.includes('groups.activity_id, groups.invite_code')) throw error;
      }
    }
    throw new Error('INVITE_CODE_GENERATION_FAILED');
  });
  return create.immediate();
}

export function findGroupByInviteCode(db: SqliteDatabase, activityId: string, inviteCode: string) {
  return db.prepare('SELECT id, display_name, invite_code, leader_session_id, accepts_members FROM groups WHERE activity_id = ? AND invite_code = ?')
    .get(activityId, inviteCode) as { id: string; display_name: string; invite_code: string; leader_session_id: string | null; accepts_members: number } | undefined;
}

export function listGroupRoster(db: SqliteDatabase, activityId: string) {
  const rows = db.prepare(`SELECT g.id AS groupId, g.invite_code AS inviteCode, g.accepts_members AS acceptsMembers,
      (SELECT count(*) FROM user_sessions s WHERE s.group_id = g.id AND s.role = 'student' AND s.retired_at IS NULL) AS occupiedCount,
      (SELECT count(*) FROM user_sessions s WHERE s.group_id = g.id AND s.role = 'student'
        AND s.retired_at IS NULL AND s.disconnected_until IS NULL) AS onlineCount
    FROM groups g WHERE g.activity_id = ? ORDER BY g.joined_at, g.id`).all(activityId) as Array<{
      groupId: string; inviteCode: string; acceptsMembers: number; occupiedCount: number; onlineCount: number
    }>;
  return rows.map((row) => ({ groupId: row.groupId, inviteCode: row.inviteCode, activeSessionCount: row.occupiedCount,
    onlineCount: row.onlineCount, occupiedCount: row.occupiedCount, capacity: 2 as const, acceptsMembers: row.acceptsMembers === 1 }));
}
