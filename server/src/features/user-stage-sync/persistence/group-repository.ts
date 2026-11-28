import { randomInt, randomUUID } from 'node:crypto';
import type { GroupRecord } from '@quiz-buzzer/shared';
import type { GroupJoinStatus } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from './database.js';

export interface ActivityJoinContext {
  phase: string;
  joiningOpened: boolean;
  worksheetReady: boolean;
}

export function getActivityJoinContext(db: SqliteDatabase, activityId: string): ActivityJoinContext | null {
  const activity = db.prepare('SELECT phase, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(activityId) as
    { phase: string; joiningOpenedAt: string | null } | undefined;
  if (!activity) return null;
  const readiness = db.prepare(`SELECT COUNT(*) AS questionCount,
      SUM(CASE WHEN mappingCount = 0 OR firstSlot != 0 OR lastSlot != mappingCount - 1 THEN 1 ELSE 0 END) AS invalidCount
    FROM (SELECT q.question_number, COUNT(m.slot_order) AS mappingCount, MIN(m.slot_order) AS firstSlot, MAX(m.slot_order) AS lastSlot
      FROM activity_questions q LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
      LEFT JOIN guided_notes_blank_mappings m ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
      WHERE q.activity_id = ? GROUP BY q.question_number)`).get(activityId) as { questionCount: number; invalidCount: number | null };
  return { phase: activity.phase, joiningOpened: activity.joiningOpenedAt !== null,
    worksheetReady: readiness.questionCount > 0 && (readiness.invalidCount ?? 0) === 0 };
}

export function resolveGroupJoinStatus(context: ActivityJoinContext | null, onlineCount: number, acceptsMembers: boolean): GroupJoinStatus {
  if (!context || context.phase === '已結束') return '不可用';
  if (context.phase === '搶答進行中') return '停止加入';
  if (!context.joiningOpened || !context.worksheetReady) return '不可用';
  if (!acceptsMembers) return '停止加入';
  return onlineCount >= 2 ? '額滿' : '開放加入';
}

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
  const context = getActivityJoinContext(db, activityId);
  const rows = db.prepare(`SELECT g.id AS groupId, g.display_name AS displayName, g.invite_code AS inviteCode, g.accepts_members AS acceptsMembers,
      (SELECT count(*) FROM user_sessions s WHERE s.group_id = g.id AND s.role = 'student'
        AND s.retired_at IS NULL AND s.disconnected_at IS NULL) AS onlineCount
    FROM groups g WHERE g.activity_id = ? ORDER BY g.joined_at, g.id`).all(activityId) as Array<{
      groupId: string; displayName: string; inviteCode: string; acceptsMembers: number; onlineCount: number
    }>;
  return rows.map((row) => ({ groupId: row.groupId, displayName: row.displayName, inviteCode: row.inviteCode,
    onlineCount: row.onlineCount, joinStatus: resolveGroupJoinStatus(context, row.onlineCount, row.acceptsMembers === 1) }));
}
