import { describe, expect, it } from 'vitest';
import { parseActivitySocketEvent, shouldApplyActivityRevision } from '../../../client/src/features/user-stage-sync/services/activity-socket.js';

describe('activity socket event validation', () => {
  it('accepts a valid phase event and ignores stale or duplicate revisions', () => {
    const event = parseActivitySocketEvent(JSON.stringify({ type: 'activity.phase.updated', activityId: 'a1', phase: '搶答進行中', revision: 2 }), 'a1');
    expect(event?.revision).toBe(2);
    expect(shouldApplyActivityRevision(event!, 1)).toBe(true);
    expect(shouldApplyActivityRevision(event!, 2)).toBe(false);
    expect(shouldApplyActivityRevision(event!, 3)).toBe(false);
  });

  it.each(['not-json', JSON.stringify({ type: 'activity.phase.updated', activityId: 'a1', phase: 'bad', revision: 1 }), JSON.stringify({ type: 'activity.phase.updated', activityId: 'other', phase: '已結束', revision: 1 })])('rejects malformed or unrelated event payloads', (value) => {
    expect(parseActivitySocketEvent(value, 'a1')).toBeNull();
  });
});
