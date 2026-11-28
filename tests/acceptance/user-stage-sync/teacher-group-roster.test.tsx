import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeacherGroupRoster } from '../../../client/src/features/user-stage-sync/components/TeacherGroupRoster.js';

describe('teacher group roster leader presence', () => {
  it('renders the leader online state from a live roster snapshot', () => {
    const markup = renderToStaticMarkup(createElement(TeacherGroupRoster, {
      sessionId: 'teacher-1',
      activityId: 'activity-1',
      liveGroups: [
        { groupId: 'group-online', displayName: 'Blue', inviteCode: '123456', onlineCount: 1, leaderOnline: true, joinStatus: '開放加入', answers: [] },
        { groupId: 'group-empty', displayName: 'Red', inviteCode: '654321', onlineCount: 0, leaderOnline: false, joinStatus: '開放加入', answers: [] }
      ]
    }));

    expect(markup).toContain('Blue');
    expect(markup).toContain('組長在線');
    expect(markup).toContain('Red');
    expect(markup).toContain('組長離線');
  });
});
