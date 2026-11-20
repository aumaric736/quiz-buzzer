import type { ActivityPhase } from '../user-stage-sync/contracts.js';

export interface GuidedNotesWorksheet {
  sheetId: number;
  title: string;
}

export interface GuidedNotesBlankSlot {
  questionNumber: number;
  slotOrder: number;
  rowIndex: number;
  columnIndex: number;
  blankKind: string;
  targetLabel: string;
}

export interface GuidedNotesImportRequest {
  spreadsheetId: string;
  sheetId: number;
}

export interface GuidedNotesImportQuestion {
  questionNumber: number;
  blankCount: number;
}

export interface GuidedNotesImportResponse {
  source: { spreadsheetId: string; sheetId: number; sheetTitle: string };
  questions: GuidedNotesImportQuestion[];
  structureFingerprint: string;
}

export type WinningAnswerResult =
  | { questionNumber: number; winner: false }
  | {
      questionNumber: number;
      winner: true;
      winningGroupId: string;
      winningGroupName: string;
      answerParts: string[];
    };

export interface WinningAnswerProvider {
  getResults(activityId: string): Promise<WinningAnswerResult[]>;
}

export type ExportPreviewItemStatus = 'ready' | 'no_winner' | 'part_count_mismatch';

export interface GuidedNotesExportPreviewItem {
  questionNumber: number;
  status: ExportPreviewItemStatus;
  winningGroupName?: string;
  answerParts?: string[];
  blankCount: number;
  targetLabels: string[];
}

export interface GuidedNotesExportPreview {
  previewId: string;
  activityId: string;
  phase: ActivityPhase;
  items: GuidedNotesExportPreviewItem[];
  expiresAt: string;
}

export interface GuidedNotesExportConfirmationRequest {
  previewId: string;
}

export type GuidedNotesExportStatus = 'previewed' | 'pending' | 'completed' | 'failed' | 'unknown';

export interface GuidedNotesExportResult {
  exportId: string;
  status: GuidedNotesExportStatus;
  writtenQuestionNumbers: number[];
  unchangedQuestionNumbers: number[];
  failedQuestionNumbers: number[];
}

export interface GuidedNotesExportAttemptResponse extends GuidedNotesExportResult {}
