import type { SheetsCell, SheetsGridRange, SheetsWorksheetGrid } from '../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';

function gridFrom(cells: SheetsCell[], merges: SheetsGridRange[], rowCount: number, columnCount: number): SheetsWorksheetGrid {
  return { sheetId: 7, title: '學習單', cells, merges, rowCount, columnCount };
}

/** Minimized structure from 軟工期末專案_題組_範例.xlsx; prompt text is intentionally omitted. */
export function groupSampleGrid(): SheetsWorksheetGrid {
  const cells: SheetsCell[] = [
    { rowIndex: 3, columnIndex: 1, enteredValue: '題號' },
    { rowIndex: 3, columnIndex: 2, enteredValue: '題目' },
    { rowIndex: 3, columnIndex: 6, enteredValue: '作答' },
    { rowIndex: 4, columnIndex: 1, enteredValue: 1 },
    { rowIndex: 4, columnIndex: 6, enteredValue: '(1)' },
    { rowIndex: 5, columnIndex: 6, enteredValue: '(2)' },
    { rowIndex: 7, columnIndex: 1, enteredValue: 2 },
    { rowIndex: 7, columnIndex: 6, enteredValue: '(1)' },
    { rowIndex: 8, columnIndex: 6, enteredValue: '(2)' },
    { rowIndex: 10, columnIndex: 1, enteredValue: 3 },
    { rowIndex: 12, columnIndex: 1, enteredValue: 4 }
  ];
  const mergeTuples: number[][] = [
    [3, 4, 6, 8],
    [4, 6, 1, 2], [4, 5, 2, 6], [5, 6, 2, 6],
    [7, 9, 1, 2], [7, 8, 2, 6], [8, 9, 2, 6],
    [10, 11, 1, 2], [10, 11, 2, 6], [10, 11, 6, 8],
    [12, 13, 1, 2], [12, 13, 2, 6], [12, 13, 6, 8]
  ];
  const merges = mergeTuples.map(([startRowIndex, endRowIndex, startColumnIndex, endColumnIndex]) => ({
    startRowIndex, endRowIndex, startColumnIndex, endColumnIndex
  }));
  return gridFrom(cells, merges, 16, 10);
}

/** Minimized structure from 軟工期末專案_單題_範例.xlsx; prompt text is intentionally omitted. */
export function singleSlotSampleGrid(): SheetsWorksheetGrid {
  const questionRows = [4, 6, 8, 10, 12, 14];
  const cells: SheetsCell[] = [
    { rowIndex: 3, columnIndex: 1, enteredValue: '題號' },
    { rowIndex: 3, columnIndex: 2, enteredValue: '題目' },
    { rowIndex: 3, columnIndex: 6, enteredValue: '作答' },
    ...questionRows.map((rowIndex, index) => ({ rowIndex, columnIndex: 1, enteredValue: index + 1 }))
  ];
  const merges: SheetsGridRange[] = [
    { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 8 },
    { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 8 },
    { startRowIndex: 3, endRowIndex: 4, startColumnIndex: 2, endColumnIndex: 6 },
    { startRowIndex: 3, endRowIndex: 4, startColumnIndex: 6, endColumnIndex: 8 },
    ...questionRows.flatMap((rowIndex) => [
      { startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 2, endColumnIndex: 6 },
      { startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 6, endColumnIndex: 8 }
    ]),
    ...[5, 7, 9, 11, 13].map((rowIndex) => ({
      startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 1, endColumnIndex: 8
    }))
  ];
  return gridFrom(cells, merges, 16, 8);
}

export function shiftSampleGrid(grid: SheetsWorksheetGrid, rowShift: number, columnShift: number): SheetsWorksheetGrid {
  return {
    ...grid,
    cells: grid.cells.map((cell) => ({ ...cell, rowIndex: cell.rowIndex + rowShift, columnIndex: cell.columnIndex + columnShift })),
    merges: grid.merges.map((merge) => ({
      ...merge,
      startRowIndex: merge.startRowIndex + rowShift,
      endRowIndex: merge.endRowIndex + rowShift,
      startColumnIndex: merge.startColumnIndex + columnShift,
      endColumnIndex: merge.endColumnIndex + columnShift
    })),
    rowCount: grid.rowCount + rowShift,
    columnCount: grid.columnCount + columnShift
  };
}
