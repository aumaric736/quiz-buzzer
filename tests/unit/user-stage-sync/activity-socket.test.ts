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

  it('accepts teacher roster revisions and ignores stale live revisions', () => {
    const event = parseActivitySocketEvent(JSON.stringify({
      type: 'activity.roster.updated', activityId: 'a1', activityLiveRevision: 3,
      groups: [{ groupId: 'g1', displayName: 'Blue', onlineCount: 1, leaderOnline: true, joinStatus: '開放加入', answers: [] }]
    }), 'a1');
    expect(event?.type).toBe('activity.roster.updated');
    expect(shouldApplyActivityRevision(event!, 2)).toBe(true);
    expect(shouldApplyActivityRevision(event!, 3)).toBe(false);
    expect(shouldApplyActivityRevision(event!, 4)).toBe(false);
    expect(parseActivitySocketEvent(JSON.stringify({ ...event, groups: [{ ...event.groups[0], leaderOnline: 'yes' }] }), 'a1')).toBeNull();
    expect(parseActivitySocketEvent(JSON.stringify({ ...event, groups: [{ groupId: 'g1', displayName: 'Blue', onlineCount: 1, joinStatus: '開放加入', answers: [] }] }), 'a1')).toBeNull();
  });

  it('rejects live events for a different activity or team and invalid roster counts', () => {
    const teamPresence = { type: 'team.presence.updated', activityId: 'a1', groupId: 'g1', groupLiveRevision: 1,
      displayName: 'Blue', groupRole: 'member', onlineCount: 2, occupiedCount: 2, capacity: 2, acceptsMembers: true, answers: [] };
    expect(parseActivitySocketEvent(JSON.stringify({ ...teamPresence, activityId: 'other' }), 'a1', 'g1')).toBeNull();
    expect(parseActivitySocketEvent(JSON.stringify(teamPresence), 'a1', 'g2')).toBeNull();
    expect(parseActivitySocketEvent(JSON.stringify({ ...teamPresence, onlineCount: 3 }), 'a1', 'g1')).toBeNull();
  });

  it('validates answer events and applies group-scoped live revisions', () => {
    const event = parseActivitySocketEvent(JSON.stringify({ type: 'team.answer.updated', activityId: 'a1', groupId: 'g1',
      groupLiveRevision: 5, questionNumber: 1, displayOrder: 0, status: 'submitted', answerParts: ['CPU'] }), 'a1', 'g1');
    expect(event?.type).toBe('team.answer.updated');
    expect(shouldApplyActivityRevision(event!, 4)).toBe(true);
    expect(shouldApplyActivityRevision(event!, 5)).toBe(false);
    expect(parseActivitySocketEvent(JSON.stringify({ ...event, answerParts: [] }), 'a1', 'g1')).toBeNull();
  });

  it('validates and revision-orders teacher question progress events', () => {
    const progress = { questionNumber: 5, displayOrder: 0, answeredGroupCount: 1, totalGroupCount: 2,
      answeredGroups: [{ groupId: 'g1', groupName: 'Blue', answerParts: ['answer'], submissionRank: 1 }],
      unansweredGroups: [{ groupId: 'g2', groupName: 'Green' }] };
    const teacherEvent = { type: 'activity.team-answer.updated', activityId: 'a1', activityLiveRevision: 7,
      groupId: 'g1', groupName: 'Blue', questionNumber: 5, status: 'submitted', answerParts: ['answer'], questionProgress: progress };
    const event = parseActivitySocketEvent(JSON.stringify(teacherEvent), 'a1');
    expect(event?.type).toBe('activity.team-answer.updated');
    expect(shouldApplyActivityRevision(event!, 6)).toBe(true);
    expect(shouldApplyActivityRevision(event!, 7)).toBe(false);
    expect(parseActivitySocketEvent(JSON.stringify({ ...teacherEvent, questionProgress: { ...progress, answeredGroupCount: 2 } }), 'a1')).toBeNull();
  });
});
