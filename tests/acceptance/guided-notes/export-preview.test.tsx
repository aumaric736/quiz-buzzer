import { describe, expect, it } from 'vitest';
import type { GuidedNotesExportPreviewItem } from '@quiz-buzzer/shared';
import { buildExportPreviewActionRequest, canRegenerateExportPreview, toExportPreviewViewModels } from '../../../client/src/features/guided-notes/views/export-preview-view-model.js';

const items: GuidedNotesExportPreviewItem[] = [
  { questionNumber: 1, status: 'ready', winningGroupName: '藍隊', answerParts: ['甲', '乙'], blankCount: 2, targetLabels: ['第 1 題空格 1', '第 1 題空格 2'], occupiedTargetLabels: ['第 1 題空格 2'] },
  { questionNumber: 2, status: 'no_winner', blankCount: 1, targetLabels: ['第 2 題空格 1'] },
  { questionNumber: 3, status: 'part_count_mismatch', winningGroupName: '紅隊', answerParts: ['只有一段'], blankCount: 2, targetLabels: ['第 3 題空格 1', '第 3 題空格 2'] }
];

describe('Guided Notes export preview view model', () => {
  it('maps ready, no-winner, and count-mismatch outcomes to clear teacher-facing states', () => {
    expect(toExportPreviewViewModels(items)).toMatchObject([
      { questionNumber: 1, label: '可寫回', targetLabels: ['第 1 題空格 1', '第 1 題空格 2'] },
      { questionNumber: 2, label: '沒有成功作答，維持原狀', answerParts: [] },
      { questionNumber: 3, label: '答案片段數量不符，略過此題' }
    ]);
  });

  it('surfaces occupied cells so the teacher can clear them and regenerate a preview', () => {
    expect(toExportPreviewViewModels(items)[0].occupiedTargetLabels).toEqual(['第 1 題空格 2']);
    expect(canRegenerateExportPreview('TARGET_CELLS_OCCUPIED')).toBe(true);
    expect(canRegenerateExportPreview('PREVIEW_EXPIRED')).toBe(true);
    expect(canRegenerateExportPreview('SOURCE_CHANGED')).toBe(false);
  });

  it('does not create a write request for cancel and creates one only for explicit confirmation', () => {
    expect(buildExportPreviewActionRequest('cancel', 'preview-1')).toBeNull();
    expect(buildExportPreviewActionRequest('confirm', 'preview-1')).toEqual({ previewId: 'preview-1' });
  });
});
