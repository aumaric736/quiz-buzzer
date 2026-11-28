import { createHash } from 'node:crypto';
import type { SheetsCell, SheetsGridRange, SheetsWorksheetGrid } from '../google-sheets/sheets-gateway.js';

export type LayoutRecognitionErrorCode = 'QUESTION_LAYOUT_UNRECOGNIZED' | 'MISSING_QUESTION_NUMBER' | 'DUPLICATE_QUESTION_NUMBER' | 'BLANK_NOT_FOUND' | 'AMBIGUOUS_LAYOUT';

export class LayoutRecognitionError extends Error {
  constructor(readonly code: LayoutRecognitionErrorCode, message: string) {
    super(message);
    this.name = 'LayoutRecognitionError';
  }
}

export interface DetectedQuestionBlank {
  questionNumber: number;
  slotOrder: number;
  rowIndex: number;
  columnIndex: number;
  blankKind: string;
}

export interface DetectedGuidedNotesQuestion {
  questionNumber: number;
  blanks: DetectedQuestionBlank[];
}

export interface DetectedGuidedNotesLayout {
  questions: DetectedGuidedNotesQuestion[];
  structureFingerprint: string;
}

function cellValue(cell: SheetsCell | undefined): string {
  if (!cell) return '';
  if (cell.enteredValue !== null && cell.enteredValue !== undefined) return String(cell.enteredValue).trim();
  return (cell.formattedValue ?? '').trim();
}

function findCell(cells: Map<string, SheetsCell>, rowIndex: number, columnIndex: number): SheetsCell | undefined {
  return cells.get(`${rowIndex}:${columnIndex}`);
}

function mergeStartingAt(merges: SheetsGridRange[], rowIndex: number, columnIndex: number): SheetsGridRange | undefined {
  return merges.find((merge) => merge.startRowIndex === rowIndex && merge.startColumnIndex === columnIndex);
}

function questionNumberFrom(value: string): number | null {
  if (!/^\d+(?:\.0+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function isBlank(value: string): boolean {
  return value.length === 0;
}

function getQuestionRows(merges: SheetsGridRange[], rowIndex: number, questionColumn: number): { start: number; end: number } {
  const merge = mergeStartingAt(merges, rowIndex, questionColumn);
  return { start: rowIndex, end: merge ? merge.endRowIndex : rowIndex + 1 };
}

export function detectGuidedNotesLayout(grid: SheetsWorksheetGrid): DetectedGuidedNotesLayout {
  const cells = new Map(grid.cells.map((cell) => [`${cell.rowIndex}:${cell.columnIndex}`, cell]));
  const headers = grid.cells
    .map((cell) => ({ cell, value: cellValue(cell) }))
    .filter(({ value }) => value === '題號' || value === '題目' || value === '作答');
  const headerRows = new Set(headers.map(({ cell }) => cell.rowIndex));
  if (headerRows.size !== 1 || headers.length !== 3 || new Set(headers.map(({ value }) => value)).size !== 3) {
    throw new LayoutRecognitionError('QUESTION_LAYOUT_UNRECOGNIZED', '找不到唯一且完整的「題號、題目、作答」表頭，無法辨識講義版面。');
  }

  const questionColumn = headers.find(({ value }) => value === '題號')!.cell.columnIndex;
  const promptColumn = headers.find(({ value }) => value === '題目')!.cell.columnIndex;
  const answerColumn = headers.find(({ value }) => value === '作答')!.cell.columnIndex;
  const answerHeaderMerge = mergeStartingAt(grid.merges, headers.find(({ value }) => value === '作答')!.cell.rowIndex, answerColumn);
  const answerEndColumn = answerHeaderMerge?.endColumnIndex ?? answerColumn + 1;
  const headerRow = [...headerRows][0];
  const questionLabels = grid.cells
    .filter((cell) => cell.rowIndex > headerRow && cell.columnIndex === questionColumn)
    .map((cell) => ({ cell, questionNumber: questionNumberFrom(cellValue(cell)) }))
    .filter((entry): entry is { cell: SheetsCell; questionNumber: number } => entry.questionNumber !== null)
    .sort((a, b) => a.cell.rowIndex - b.cell.rowIndex);

  const structuredRowStarts = new Set(grid.merges
    .filter((merge) => merge.startRowIndex > headerRow
      && merge.startColumnIndex === questionColumn && merge.endColumnIndex === questionColumn + 1)
    .map(({ startRowIndex }) => startRowIndex));
  const promptRows = grid.merges.filter((merge) => merge.startRowIndex > headerRow
    && merge.startColumnIndex === promptColumn && merge.endColumnIndex <= answerColumn
    && merge.endRowIndex === merge.startRowIndex + 1);
  for (const promptMerge of promptRows) {
    const hasAnswerStructure = grid.merges.some((merge) => merge.startRowIndex === promptMerge.startRowIndex
      && merge.endRowIndex === promptMerge.endRowIndex
      && merge.startColumnIndex === answerColumn && merge.endColumnIndex <= answerEndColumn);
    if (hasAnswerStructure) structuredRowStarts.add(promptMerge.startRowIndex);
  }
  for (const rowIndex of structuredRowStarts) {
    const rawNumber = cellValue(findCell(cells, rowIndex, questionColumn));
    if (questionNumberFrom(rawNumber) === null) {
      throw new LayoutRecognitionError('MISSING_QUESTION_NUMBER', `工作表「${grid.title}」第 ${rowIndex + 1} 列有題目結構，但題號空白或無效，請補上題號後重新匯入。`);
    }
  }

  if (questionLabels.length === 0) {
    throw new LayoutRecognitionError('QUESTION_LAYOUT_UNRECOGNIZED', '講義中找不到可辨識的正整數題號。');
  }

  const seenQuestionNumbers = new Set<number>();
  const questions = questionLabels.map(({ cell, questionNumber }) => {
    if (seenQuestionNumbers.has(questionNumber)) {
      throw new LayoutRecognitionError('DUPLICATE_QUESTION_NUMBER', `工作表「${grid.title}」第 ${cell.rowIndex + 1} 列的題號 ${questionNumber} 重複，請修正後重新匯入。`);
    }
    seenQuestionNumbers.add(questionNumber);
    const rows = getQuestionRows(grid.merges, cell.rowIndex, questionColumn);
    const markers = grid.cells
      .filter((candidate) => candidate.rowIndex >= rows.start && candidate.rowIndex < rows.end
        && candidate.columnIndex >= answerColumn && candidate.columnIndex < answerEndColumn)
      .map((candidate) => ({ cell: candidate, value: cellValue(candidate), match: /^[（(](\d+)[）)]$/.exec(cellValue(candidate)) }))
      .filter((candidate): candidate is { cell: SheetsCell; value: string; match: RegExpExecArray } => candidate.match !== null)
      .sort((a, b) => a.cell.rowIndex - b.cell.rowIndex || a.cell.columnIndex - b.cell.columnIndex);

    let blanks: DetectedQuestionBlank[];
    if (markers.length > 0) {
      const markerNumbers = markers.map(({ match }) => Number(match[1]));
      if (new Set(markerNumbers).size !== markerNumbers.length || markerNumbers.some((number, index) => number !== index + 1)) {
        throw new LayoutRecognitionError('AMBIGUOUS_LAYOUT', `題號 ${questionNumber} 的填答格標記重複或順序不連續，無法安全對應。`);
      }
      blanks = markers.map(({ cell: marker }, slotOrder) => {
        const targetColumn = marker.columnIndex + 1;
        if (targetColumn >= answerEndColumn || !isBlank(cellValue(findCell(cells, marker.rowIndex, targetColumn)))) {
          throw new LayoutRecognitionError('BLANK_NOT_FOUND', `題號 ${questionNumber} 的第 ${slotOrder + 1} 個填答格不存在或已填入內容。`);
        }
        return { questionNumber, slotOrder, rowIndex: marker.rowIndex, columnIndex: targetColumn, blankKind: 'numbered-slot-adjacent-blank' };
      });
    } else {
      const mergedAnswerSlots = grid.merges.filter((merge) => merge.startRowIndex >= rows.start && merge.endRowIndex <= rows.end
        && merge.startColumnIndex >= answerColumn && merge.endColumnIndex <= answerEndColumn
        && merge.endRowIndex === merge.startRowIndex + 1 && isBlank(cellValue(findCell(cells, merge.startRowIndex, merge.startColumnIndex))));
      if (mergedAnswerSlots.length === 0) {
        throw new LayoutRecognitionError('BLANK_NOT_FOUND', `題號 ${questionNumber} 找不到可安全辨識的填答格。`);
      }
      if (mergedAnswerSlots.length > 1) {
        throw new LayoutRecognitionError('AMBIGUOUS_LAYOUT', `題號 ${questionNumber} 有多個未標記的填答格，無法確定答案對應順序。`);
      }
      const target = mergedAnswerSlots[0];
      blanks = [{ questionNumber, slotOrder: 0, rowIndex: target.startRowIndex, columnIndex: target.startColumnIndex, blankKind: 'empty-merged-answer-slot' }];
    }
    return { questionNumber, blanks };
  });

  const fingerprintInput = questions.map(({ questionNumber, blanks: slots }) => ({
    questionNumber,
    blanks: slots.map(({ slotOrder, rowIndex, columnIndex, blankKind }) => ({ slotOrder, rowIndex, columnIndex, blankKind }))
  }));
  const structureFingerprint = createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex');
  return { questions, structureFingerprint };
}
