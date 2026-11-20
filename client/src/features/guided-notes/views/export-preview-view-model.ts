import type { GuidedNotesExportPreviewItem } from '@quiz-buzzer/shared';

export interface ExportPreviewViewModel {
  questionNumber: number;
  label: string;
  winningGroupName?: string;
  answerParts: string[];
  targetLabels: string[];
}

export type ExportPreviewAction = 'confirm' | 'cancel';

export function toExportPreviewViewModels(items: GuidedNotesExportPreviewItem[]): ExportPreviewViewModel[] {
  return items.map((item) => ({
    questionNumber: item.questionNumber,
    label: item.status === 'ready' ? '可寫回'
      : item.status === 'no_winner' ? '沒有成功作答，維持原狀'
        : '答案片段數量不符，略過此題',
    winningGroupName: item.winningGroupName,
    answerParts: item.answerParts ?? [],
    targetLabels: item.targetLabels
  }));
}

export function buildExportPreviewActionRequest(action: ExportPreviewAction, previewId: string): { previewId: string } | null {
  return action === 'confirm' ? { previewId } : null;
}
