import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeacherGroupRoster } from '../../../client/src/features/user-stage-sync/components/TeacherGroupRoster.js';
import { AnswerQuestionForm } from '../../../client/src/features/buzzer-flow/components/AnswerQuestionForm.js';

describe('live activity update acceptance', () => {
  it('renders committed teacher roster membership and answers without a reload', () => {
    const startedAt = performance.now();
    const markup = renderToStaticMarkup(createElement(TeacherGroupRoster, {
      sessionId: 'teacher', activityId: 'activity', liveGroups: [{ groupId: 'g1', displayName: '蘋果', inviteCode: '123456',
        onlineCount: 2, joinStatus: '額滿',
        answers: [{ questionNumber: 1, displayOrder: 0, status: 'submitted', answerParts: ['中央處理器'] }] }]
    }));
    expect(markup).toContain('蘋果');
    expect(markup).toContain('2 人在線');
    expect(markup).toContain('額滿');
    expect(markup).not.toContain('使用中席位');
    expect(markup).toContain('第 1 題：中央處理器');
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });

  it('renders a same-team submitted answer as locked and displays its original answer parts', () => {
    const startedAt = performance.now();
    const markup = renderToStaticMarkup(createElement(AnswerQuestionForm, {
      sessionId: 'student', activityId: 'activity', groupId: 'g1', phase: '搶答進行中',
      question: { questionNumber: 1, blankCount: 1 }, alreadySubmitted: true, submittedAnswerParts: ['答案零']
    }));
    expect(markup).toContain('本組已提交：答案零');
    expect(markup).toContain('已提交');
    expect(markup).toContain('disabled=""');
    expect(performance.now() - startedAt).toBeLessThan(2000);
  });
});
