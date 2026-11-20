import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('createSession', () => {
  const db = createTestDatabase();
  afterEach(() => { db.exec('DELETE FROM user_sessions'); });

  it.each(['teacher', 'student'] as const)('creates a simulated %s session', (role) => {
    const session = createSession(db, role);
    expect(session).toMatchObject({ role, activityId: null, groupId: null });
    expect(db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(session.sessionId)).toEqual({ role });
  });

  it('rejects missing and unknown roles with a clear validation error', () => {
    for (const role of [undefined, '', 'admin', 42]) {
      expect(() => createSession(db, role)).toThrow(/老師或學生/);
    }
    expect(db.prepare('SELECT count(*) AS total FROM user_sessions').get()).toEqual({ total: 0 });
  });
});
