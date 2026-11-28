import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeacherActivityView } from '../../../client/src/features/user-stage-sync/views/TeacherActivityView.js';
import { StudentJoinView } from '../../../client/src/features/user-stage-sync/views/StudentJoinView.js';

describe('explicit team joining acceptance', () => {
  it('keeps both teacher stage actions visible and enables only the action for the current stage', () => {
    const session = { sessionId: 'teacher-1', role: 'teacher' as const, activityId: null, groupId: null };
    const renderActivity = (phase: '準備中' | '搶答進行中' | '已結束', joiningOpenedAt: string | null) => renderToStaticMarkup(createElement(TeacherActivityView, {
      session, initialActivity: { activityId: 'activity-1', phase, revision: 0, joiningOpenedAt }
    }));

    const created = renderActivity('準備中', null);
    const joining = renderActivity('準備中', '2026-01-01T00:00:00Z');
    const answering = renderActivity('搶答進行中', '2026-01-01T00:00:00Z');
    const ended = renderActivity('已結束', '2026-01-01T00:00:00Z');

    for (const markup of [created, joining, answering, ended]) {
      expect(markup).toContain('開始加入');
      expect(markup).toContain('開始答題');
    }
    expect(created).toMatch(/<button[^>]*>開始加入<\/button>/);
    expect(created).toMatch(/<button[^>]*disabled=""[^>]*>開始答題<\/button>/);
    expect(joining).toMatch(/<button[^>]*disabled=""[^>]*>開始加入<\/button>/);
    expect(joining).toMatch(/<button[^>]*>開始答題<\/button>/);
    expect(answering).toMatch(/<button[^>]*disabled=""[^>]*>開始加入<\/button>/);
    expect(answering).toMatch(/<button[^>]*disabled=""[^>]*>開始答題<\/button>/);
    expect(ended).toMatch(/<button[^>]*disabled=""[^>]*>開始加入<\/button>/);
    expect(ended).toMatch(/<button[^>]*disabled=""[^>]*>開始答題<\/button>/);
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
