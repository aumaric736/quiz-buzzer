import { describe, expect, it } from 'vitest';
import { applyTeacherQuestionProgress } from '../../../client/src/features/user-stage-sync/services/live-activity-state.js';
import type { TeacherQuestionProgress } from '../../../shared/src/buzzer-flow/contracts.js';

function progress(questionNumber: number, displayOrder: number, answeredGroupCount: number): TeacherQuestionProgress {
  return { questionNumber, displayOrder, answeredGroupCount, totalGroupCount: 1,
    answeredGroups: answeredGroupCount ? [{ groupId: 'g1', groupName: 'Blue', answerParts: ['answer'], submissionRank: 1 }] : [],
    unansweredGroups: answeredGroupCount ? [] : [{ groupId: 'g1', groupName: 'Blue' }] };
}

describe('teacher question progress state', () => {
  it('replaces the updated question and retains saved worksheet order', () => {
    const current = [progress(2, 1, 0), progress(5, 0, 0)];
    expect(applyTeacherQuestionProgress(current, progress(2, 1, 1))).toEqual([progress(5, 0, 0), progress(2, 1, 1)]);
  });
});
