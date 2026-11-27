import { describe, expect, it } from 'vitest';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { listGroupRoster } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('group online and occupied counts', () => {
  it('separates connected members from reserved seats and increments both live revisions once per enrollment', () => {
    const db = createTestDatabase();
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leaderId, activityId, { mode: 'leader', groupName: 'Blue' });
      let roster = listGroupRoster(db, activityId)[0] as Record<string, unknown>;

      expect(roster).toMatchObject({ onlineCount: 1, occupiedCount: 1, capacity: 2, acceptsMembers: true });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId)).toEqual({ liveRevision: 1 });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM groups WHERE id = ?').get(group.groupId)).toEqual({ liveRevision: 1 });

      const memberId = createSession(db, 'student').sessionId;
      enrollGroup(db, memberId, activityId, { mode: 'member', inviteCode: group.inviteCode });
      roster = listGroupRoster(db, activityId)[0] as Record<string, unknown>;
      expect(roster).toMatchObject({ onlineCount: 2, occupiedCount: 2, capacity: 2 });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId)).toEqual({ liveRevision: 2 });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM groups WHERE id = ?').get(group.groupId)).toEqual({ liveRevision: 2 });

      db.prepare('UPDATE user_sessions SET disconnected_until = ? WHERE id = ?').run('2026-01-01T00:02:00.000Z', memberId);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, occupiedCount: 2, capacity: 2 });
    } finally { db.close(); }
  });
});
