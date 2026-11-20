import { describe, expect, it } from 'vitest';
import { detectGuidedNotesLayout, LayoutRecognitionError } from '../../../server/src/features/guided-notes/domain/layout-recognizer.js';
import type { SheetsCell, SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';

function sampleGrid(rowShift = 0, columnShift = 0): SheetsWorksheetGrid {
  const cells: SheetsCell[] = [];
  const put = (rowIndex: number, columnIndex: number, enteredValue: string | number) => {
    cells.push({ rowIndex: rowIndex + rowShift, columnIndex: columnIndex + columnShift, enteredValue });
  };
  put(3, 1, '題號'); put(3, 2, '題目'); put(3, 6, '作答');
  put(4, 1, 1); put(4, 6, '(1)'); put(5, 6, '(2)');
  put(7, 1, 2); put(7, 6, '(1)'); put(8, 6, '(2)');
  put(10, 1, 3); put(12, 1, 4);

  const ranges = [
    [3, 4, 6, 8],
    [4, 6, 1, 2], [4, 5, 2, 6], [5, 6, 2, 6],
    [7, 9, 1, 2], [7, 8, 2, 6], [8, 9, 2, 6],
    [10, 11, 1, 2], [10, 11, 2, 6], [10, 11, 6, 8],
    [12, 13, 1, 2], [12, 13, 2, 6], [12, 13, 6, 8]
  ].map(([startRowIndex, endRowIndex, startColumnIndex, endColumnIndex]) => ({
    startRowIndex: startRowIndex + rowShift,
    endRowIndex: endRowIndex + rowShift,
    startColumnIndex: startColumnIndex + columnShift,
    endColumnIndex: endColumnIndex + columnShift
  }));
  return { sheetId: 7, title: '學習單', rowCount: 16 + rowShift, columnCount: 10 + columnShift, merges: ranges, cells };
}

describe('detectGuidedNotesLayout', () => {
  it('recognizes four numbered questions and six ordered answer slots from the supplied sample pattern', () => {
    const layout = detectGuidedNotesLayout(sampleGrid());
    expect(layout.questions.map(({ questionNumber, blanks }) => [questionNumber, blanks.length])).toEqual([
      [1, 2], [2, 2], [3, 1], [4, 1]
    ]);
    expect(layout.questions[0].blanks.map(({ rowIndex, columnIndex }) => [rowIndex, columnIndex])).toEqual([[4, 7], [5, 7]]);
  });

  it('detects the same structure when question and answer cells move to different positions', () => {
    const shift = { rows: 5, columns: 3 };
    const layout = detectGuidedNotesLayout(sampleGrid(shift.rows, shift.columns));
    expect(layout.questions.map(({ questionNumber, blanks }) => [questionNumber, blanks.length])).toEqual([
      [1, 2], [2, 2], [3, 1], [4, 1]
    ]);
    expect(layout.questions[0].blanks[0]).toMatchObject({ rowIndex: 4 + shift.rows, columnIndex: 7 + shift.columns });
  });

  it('rejects duplicate question numbers instead of merging their mappings', () => {
    const grid = sampleGrid();
    grid.cells.find((cell) => cell.rowIndex === 7 && cell.columnIndex === 1)!.enteredValue = 1;
    expect(() => detectGuidedNotesLayout(grid)).toThrowError(LayoutRecognitionError);
  });

  it('rejects a missing first slot marker rather than guessing the missing blank', () => {
    const grid = sampleGrid();
    grid.cells = grid.cells.filter((cell) => !(cell.rowIndex === 4 && cell.columnIndex === 6));
    expect(() => detectGuidedNotesLayout(grid)).toThrowError(LayoutRecognitionError);
  });

  it('rejects an unknown header layout rather than treating arbitrary empty cells as blanks', () => {
    const grid = sampleGrid();
    grid.cells.find((cell) => cell.rowIndex === 3 && cell.columnIndex === 6)!.enteredValue = '答案欄';
    expect(() => detectGuidedNotesLayout(grid)).toThrowError(LayoutRecognitionError);
  });
});
