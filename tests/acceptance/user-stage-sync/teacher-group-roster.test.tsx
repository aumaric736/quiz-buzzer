import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeacherGroupRoster } from '../../../client/src/features/user-stage-sync/components/TeacherGroupRoster.js';

describe('teacher group roster layout', () => {
  it('omits leader presence and uses the requested roster column widths', () => {
    const markup = renderToStaticMarkup(createElement(TeacherGroupRoster, {
      sessionId: 'teacher-1',
      activityId: 'activity-1',
      liveGroups: [
        { groupId: 'group-online', displayName: 'Blue', inviteCode: '123456', onlineCount: 1, leaderOnline: true, joinStatus: '開放加入', answers: [
          { questionNumber: 1, status: 'submitted', answerParts: ['Blue answer'] }
        ] },
        { groupId: 'group-empty', displayName: 'Red', inviteCode: '654321', onlineCount: 0, leaderOnline: false, joinStatus: '開放加入', answers: [] }
      ]
    }));

    expect(markup).toContain('Blue');
    expect(markup).toContain('123456');
    expect(markup).toContain('1 人在線');
    expect(markup).toContain('Red');
    expect(markup).toContain('0 人在線');
    expect(markup).not.toContain('組長在線');
    expect(markup).not.toContain('組長離線');
    expect(markup).toContain('grid-cols-[2fr_1fr_1fr]');
    expect(markup).toContain('開放加入');
    expect(markup).toContain('第 1 題：Blue answer');
    expect(markup.indexOf('開放加入')).toBeLessThan(markup.indexOf('第 1 題：Blue answer'));
  });
});
