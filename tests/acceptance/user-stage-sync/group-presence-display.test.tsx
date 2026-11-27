import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GroupPresenceStatus } from '../../../client/src/features/user-stage-sync/components/GroupPresenceStatus.js';
import { TeacherActivityView } from '../../../client/src/features/user-stage-sync/views/TeacherActivityView.js';

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
});
