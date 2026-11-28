import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeacherActivityView } from '../../../client/src/features/user-stage-sync/views/TeacherActivityView.js';
import { StudentJoinView } from '../../../client/src/features/user-stage-sync/views/StudentJoinView.js';

describe('explicit team joining acceptance', () => {
  it('shows the teacher open-joining action only while preparing and not yet opened', () => {
    const session = { sessionId: 'teacher-1', role: 'teacher' as const, activityId: null, groupId: null };
    const preparing = renderToStaticMarkup(createElement(TeacherActivityView, {
      session, initialActivity: { activityId: 'activity-1', phase: '準備中', revision: 0, joiningOpenedAt: null }
    }));
    const opened = renderToStaticMarkup(createElement(TeacherActivityView, {
      session, initialActivity: { activityId: 'activity-1', phase: '準備中', revision: 0, joiningOpenedAt: '2026-01-01T00:00:00Z' }
    }));

    expect(preparing).toContain('開放加入');
    expect(opened).not.toContain('開放加入</button>');
  });

  it('keeps the student team-formation screen free of a new question-count or question-preview panel', () => {
    const markup = renderToStaticMarkup(createElement(StudentJoinView, {
      session: { sessionId: 'student-1', role: 'student', activityId: null, groupId: null }
    }));
    expect(markup).toContain('加入課堂活動');
    expect(markup).not.toContain('總題數');
    expect(markup).not.toContain('題目預覽');
  });

  it('offers a returning student a same-activity group choice when the original team is full', () => {
    const markup = renderToStaticMarkup(createElement(StudentJoinView, {
      session: { sessionId: 'student-1', role: 'student', activityId: 'activity-1', groupId: 'group-1', recoveryRequired: true },
      initialActivity: { activityId: 'activity-1', phase: '準備中', revision: 0, joiningOpenedAt: '2026-01-01T00:00:00Z' }
    }));
    expect(markup).toContain('原小組已額滿');
    expect(markup).toContain('六位數小組邀請碼');
  });
});
