import { afterEach, describe, expect, it } from 'vitest';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createGroupWithInviteCode } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('live team revision migration', () => {
  let db: SqliteDatabase | undefined;

  afterEach(() => { db?.close(); db = undefined; });

  it('defaults both audience revisions to zero, rejects negative values, and keeps phase revision separate', () => {
    db = createTestDatabase();
    const teacherId = createSession(db, 'teacher').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    const studentId = createSession(db, 'student').sessionId;
    const group = createGroupWithInviteCode(db, activityId, 'Blue', studentId, () => 42);

    expect(db.prepare('SELECT live_revision AS liveRevision, revision FROM activities WHERE id = ?').get(activityId))
      .toEqual({ liveRevision: 0, revision: 0 });
    expect(db.prepare('SELECT live_revision AS liveRevision FROM groups WHERE id = ?').get(group.groupId))
      .toEqual({ liveRevision: 0 });

    db.prepare('UPDATE activities SET revision = 7, live_revision = 1 WHERE id = ?').run(activityId);
    expect(() => db.prepare('UPDATE activities SET live_revision = -1 WHERE id = ?').run(activityId)).toThrow();
    expect(() => db.prepare('UPDATE groups SET live_revision = -1 WHERE id = ?').run(group.groupId)).toThrow();
    expect(db.prepare('SELECT live_revision AS liveRevision, revision FROM activities WHERE id = ?').get(activityId))
      .toEqual({ liveRevision: 1, revision: 7 });
  });
});
