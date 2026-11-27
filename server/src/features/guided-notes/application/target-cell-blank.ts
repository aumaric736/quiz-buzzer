import type { SheetsCell } from '../google-sheets/sheets-gateway.js';

export function isSheetsCellBlank(cell: Pick<SheetsCell, 'enteredValue' | 'formula'> | undefined): boolean {
  if (!cell) return true;
  if (typeof cell.formula === 'string' && cell.formula.length > 0) return false;
  const value = cell.enteredValue;
  if (value === null || value === undefined) return true;
  return typeof value === 'string' ? value.trim().length === 0 : false;
}
