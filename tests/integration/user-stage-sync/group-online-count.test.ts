import { describe, expect, it } from 'vitest';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { listGroupRoster } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('teacher group online count and join state', () => {
  it('reports online count and authoritative open/full state while incrementing live revisions once per enrollment', () => {
    const db = createTestDatabase();
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      seedGuidedNotesQuestions(db, activityId, [1]);
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leaderId, activityId, { mode: 'leader', groupName: 'Blue' });
      let roster = listGroupRoster(db, activityId)[0] as Record<string, unknown>;

      expect(roster).toMatchObject({ onlineCount: 1, joinStatus: '開放加入' });
      expect(roster).not.toHaveProperty('occupiedCount');
      expect(roster).not.toHaveProperty('capacity');
      expect(db.prepare('SELECT live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId)).toEqual({ liveRevision: 1 });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM groups WHERE id = ?').get(group.groupId)).toEqual({ liveRevision: 1 });

      const memberId = createSession(db, 'student').sessionId;
      enrollGroup(db, memberId, activityId, { mode: 'member', inviteCode: group.inviteCode });
      roster = listGroupRoster(db, activityId)[0] as Record<string, unknown>;
      expect(roster).toMatchObject({ onlineCount: 2, joinStatus: '額滿' });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId)).toEqual({ liveRevision: 2 });
      expect(db.prepare('SELECT live_revision AS liveRevision FROM groups WHERE id = ?').get(group.groupId)).toEqual({ liveRevision: 2 });

      db.prepare('UPDATE user_sessions SET disconnected_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', memberId);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, joinStatus: '開放加入' });
    } finally { db.close(); }
  });
});
