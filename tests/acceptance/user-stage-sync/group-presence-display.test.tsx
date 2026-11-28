import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GroupPresenceStatus } from '../../../client/src/features/user-stage-sync/components/GroupPresenceStatus.js';
import { TeacherActivityView } from '../../../client/src/features/user-stage-sync/views/TeacherActivityView.js';
import { TeacherGroupRoster } from '../../../client/src/features/user-stage-sync/components/TeacherGroupRoster.js';
import type { LiveGroupRosterRecord } from '../../../shared/src/user-stage-sync/contracts.js';

describe('group presence display acceptance', () => {
  it("shows each student's online count and own role, including the full-team label", () => {
    const leader = renderToStaticMarkup(createElement(GroupPresenceStatus, { snapshot: {
      type: 'team.presence.updated', activityId: 'activity-1', groupId: 'group-1', groupLiveRevision: 1,
      displayName: 'Blue', groupRole: 'leader', onlineCount: 1, occupiedCount: 1, capacity: 2,
      acceptsMembers: true, answers: []
    } }));
    const member = renderToStaticMarkup(createElement(GroupPresenceStatus, { snapshot: {
      type: 'team.presence.updated', activityId: 'activity-1', groupId: 'group-1', groupLiveRevision: 2,
      displayName: 'Blue', groupRole: 'member', onlineCount: 2, occupiedCount: 2, capacity: 2,
      acceptsMembers: true, answers: []
    } }));

    expect(leader).toContain('1/2');
    expect(leader).toContain('組長');
    expect(member).toContain('2/2（已滿額）');
    expect(member).toContain('組員');
  });

  it('does not show a version sublabel in the teacher activity phase panel', () => {
    const markup = renderToStaticMarkup(createElement(TeacherActivityView, {
      session: { sessionId: 'teacher-1', role: 'teacher', activityId: null, groupId: null },
      initialActivity: { activityId: 'activity-1', phase: '搶答進行中', revision: 2 }
    }));
    expect(markup).not.toContain('版本');
  });

  it('renders authoritative join states and only online counts in stable columns for long and short group names', () => {
    const states: LiveGroupRosterRecord[] = [
      { groupId: 'g1', displayName: 'A very long group name that should not shift the counts', inviteCode: '123456', onlineCount: 1,
        joinStatus: '開放加入', answers: [] },
      { groupId: 'g2', displayName: 'B', inviteCode: '654321', onlineCount: 2, joinStatus: '額滿', answers: [] },
      { groupId: 'g3', displayName: 'C', inviteCode: '555555', onlineCount: 1, joinStatus: '停止加入', answers: [] },
      { groupId: 'g4', displayName: 'D', inviteCode: '444444', onlineCount: 0, joinStatus: '不可用', answers: [] }
    ];
    const markup = renderToStaticMarkup(createElement(TeacherGroupRoster, { sessionId: 'teacher-1', activityId: 'activity-1', liveGroups: states }));
    expect(markup).toContain('1 人在線');
    expect(markup).toContain('2 人在線');
    expect(markup).toContain('開放加入');
    expect(markup).toContain('額滿');
    expect(markup).toContain('停止加入');
    expect(markup).toContain('不可用');
    expect(markup).not.toMatch(/席位|使用中|容量|\b1\/2\b|\b2\/2\b/);
    expect(markup.indexOf('grid-template-columns')).toBe(-1);
    expect(markup.match(/grid-cols-/g)?.length).toBeGreaterThan(0);
  });

  it('locks worksheet editing once joining opens', () => {
    const markup = renderToStaticMarkup(createElement(TeacherActivityView, {
      session: { sessionId: 'teacher-1', role: 'teacher', activityId: 'activity-1', groupId: null },
      initialActivity: { activityId: 'activity-1', phase: '準備中', revision: 2, joiningOpenedAt: '2026-11-28T00:00:00.000Z' }
    }));
    expect(markup).toContain('開放加入後，學習單與題目清單已鎖定');
    expect(markup).not.toContain('讀取工作表');
  });
});
