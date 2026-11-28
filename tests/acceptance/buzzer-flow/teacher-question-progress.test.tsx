import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QuestionAnswerProgress } from '../../../client/src/features/buzzer-flow/components/QuestionAnswerProgress.js';
import type { TeacherQuestionProgress } from '../../../shared/src/buzzer-flow/contracts.js';

describe('teacher live question progress acceptance', () => {
  it('shows saved worksheet order, counts, and selected question answer and unanswered groups', () => {
    const questions: TeacherQuestionProgress[] = [
      { questionNumber: 5, displayOrder: 0, answeredGroupCount: 1, totalGroupCount: 2,
        answeredGroups: [{ groupId: 'g1', groupName: 'Alpha', answerParts: ['first', 'second'], submissionRank: 2 }],
        unansweredGroups: [{ groupId: 'g2', groupName: 'Offline Team' }] },
      { questionNumber: 2, displayOrder: 1, answeredGroupCount: 0, totalGroupCount: 2, answeredGroups: [],
        unansweredGroups: [{ groupId: 'g1', groupName: 'Alpha' }, { groupId: 'g2', groupName: 'Offline Team' }] }
    ];
    const html = renderToStaticMarkup(<QuestionAnswerProgress questions={questions} />);
    expect(html.indexOf('第 5 題')).toBeLessThan(html.indexOf('第 2 題'));
    expect(html).toContain('1 / 2 組已作答');
    expect(html).toContain('Alpha');
    expect(html).toContain('first');
    expect(html).toContain('second');
    expect(html).toContain('第 2 順位');
    expect(html).toContain('Offline Team');
  });

  it('keeps each question in one of four fixed-width slots per row', () => {
    for (const questionCount of [1, 4, 5, 8]) {
      const questions: TeacherQuestionProgress[] = Array.from({ length: questionCount }, (_, index) => ({
        questionNumber: index + 1,
        displayOrder: index,
        answeredGroupCount: 0,
        totalGroupCount: 1,
        answeredGroups: [],
        unansweredGroups: []
      }));
      const html = renderToStaticMarkup(<QuestionAnswerProgress questions={questions} />);
      const picker = html.match(/<div class="mt-3 grid grid-cols-4" aria-label="選擇題目">([\s\S]*?)<\/div>/);
      const buttons = picker?.[1].match(/<button\b[^>]*>/g) ?? [];

      expect(picker).not.toBeNull();
      expect(buttons).toHaveLength(questionCount);
      expect(buttons.every((button) => button.includes('w-full'))).toBe(true);
      expect(Math.ceil(buttons.length / 4)).toBe(Math.ceil(questionCount / 4));
    }

    const empty = renderToStaticMarkup(<QuestionAnswerProgress questions={[]} />);
    expect(empty).toContain('尚無可檢視的題目。');
  });
});
