export interface SheetsGridRange {
  startRowIndex: number;
  endRowIndex: number;
  startColumnIndex: number;
  endColumnIndex: number;
}

export interface SheetsCell {
  rowIndex: number;
  columnIndex: number;
  enteredValue: string | number | boolean | null;
  formula?: string | null;
  formattedValue?: string | null;
  note?: string | null;
}

export interface SheetsWorksheetGrid {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  merges: SheetsGridRange[];
  cells: SheetsCell[];
}

export interface SheetsWorksheetMetadata {
  sheetId: number;
  title: string;
}

export interface SheetsCellUpdate {
  sheetId: number;
  rowIndex: number;
  columnIndex: number;
  value: string;
}

export type SheetsGatewayErrorCode = 'ACCESS_DENIED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'NOT_CONFIGURED' | 'WRITE_DENIED';

export class SheetsGatewayError extends Error {
  constructor(readonly code: SheetsGatewayErrorCode, message: string) {
    super(message);
    this.name = 'SheetsGatewayError';
  }
}

/** Google API boundary; no Google types or credentials cross into domain code. */
export interface SheetsGateway {
  listWorksheets(spreadsheetId: string): Promise<SheetsWorksheetMetadata[]>;
  readWorksheet(spreadsheetId: string, sheetId: number): Promise<SheetsWorksheetGrid>;
  writeCellUpdates(spreadsheetId: string, updates: SheetsCellUpdate[]): Promise<void>;
}
