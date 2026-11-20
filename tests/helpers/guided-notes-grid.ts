import type { SheetsWorksheetGrid } from '../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';

export function guidedNotesGridFixture(): SheetsWorksheetGrid {
  return {
    sheetId: 7, title: '學習單', rowCount: 6, columnCount: 4,
    cells: [
      { rowIndex: 0, columnIndex: 0, enteredValue: '題號' },
      { rowIndex: 0, columnIndex: 1, enteredValue: '題目' },
      { rowIndex: 0, columnIndex: 2, enteredValue: '作答' },
      { rowIndex: 1, columnIndex: 0, enteredValue: 1 },
      { rowIndex: 1, columnIndex: 2, enteredValue: '(1)' },
      { rowIndex: 2, columnIndex: 2, enteredValue: '(2)' },
      { rowIndex: 4, columnIndex: 0, enteredValue: 2 }
    ],
    merges: [
      { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 },
      { startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
      { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 4, endRowIndex: 5, startColumnIndex: 2, endColumnIndex: 4 }
    ]
  };
}
