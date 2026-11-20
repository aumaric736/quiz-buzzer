import { google, type sheets_v4 } from 'googleapis';
import { loadGoogleSheetsCredentials } from '../../../config/env.js';
import {
  SheetsGatewayError,
  type SheetsCell,
  type SheetsCellUpdate,
  type SheetsGridRange,
  type SheetsGateway,
  type SheetsWorksheetGrid,
  type SheetsWorksheetMetadata
} from './sheets-gateway.js';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

function safeStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const item = error as { code?: unknown; response?: { status?: unknown } };
  const status = item.response?.status ?? item.code;
  return typeof status === 'number' ? status : typeof status === 'string' && /^\d+$/.test(status) ? Number(status) : undefined;
}

function convertProviderError(error: unknown, operation: 'read' | 'write'): SheetsGatewayError {
  if (error instanceof SheetsGatewayError) return error;
  const status = safeStatus(error);
  if (status === 403) return new SheetsGatewayError(operation === 'write' ? 'WRITE_DENIED' : 'ACCESS_DENIED', operation === 'write'
    ? '服務帳戶沒有此講義的編輯權限，請將講義分享給服務帳戶並授予編輯者權限。'
    : '無法讀取此講義，請確認已分享給設定的服務帳戶。');
  if (status === 404) return new SheetsGatewayError('NOT_FOUND', '找不到指定的 Google Sheets 文件或工作表。');
  return new SheetsGatewayError('UNAVAILABLE', 'Google Sheets 暫時無法存取，請稍後再試。');
}

function enteredValue(cell: sheets_v4.Schema$CellData): string | number | boolean | null {
  const value = cell.userEnteredValue ?? cell.effectiveValue;
  if (!value) return null;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.numberValue === 'number') return value.numberValue;
  if (typeof value.boolValue === 'boolean') return value.boolValue;
  if (typeof value.formulaValue === 'string') return value.formulaValue;
  return null;
}

function columnName(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export class GoogleSheetsGateway implements SheetsGateway {
  private client: sheets_v4.Sheets | null = null;
  private configurationError: SheetsGatewayError | null = null;

  constructor() {
    try {
      const credentials = loadGoogleSheetsCredentials();
      if (!credentials) {
        this.configurationError = new SheetsGatewayError('NOT_CONFIGURED', '請在伺服器環境變數中設定 Google Sheets 服務帳戶憑證。');
        return;
      }
      const auth = new google.auth.JWT({
        email: credentials.serviceAccountEmail,
        key: credentials.privateKey,
        scopes: [SHEETS_SCOPE]
      });
      this.client = google.sheets({ version: 'v4', auth });
    } catch {
      this.configurationError = new SheetsGatewayError('NOT_CONFIGURED', 'Google Sheets 服務帳戶設定不完整或格式錯誤。');
    }
  }

  async listWorksheets(spreadsheetId: string): Promise<SheetsWorksheetMetadata[]> {
    const client = this.requireClient();
    try {
      const response = await client.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
      return (response.data.sheets ?? []).flatMap((sheet) => {
        const properties = sheet.properties;
        return typeof properties?.sheetId === 'number' && typeof properties.title === 'string'
          ? [{ sheetId: properties.sheetId, title: properties.title }]
          : [];
      });
    } catch (error) { throw convertProviderError(error, 'read'); }
  }

  async readWorksheet(spreadsheetId: string, sheetId: number): Promise<SheetsWorksheetGrid> {
    const client = this.requireClient();
    try {
      const metadata = await client.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))'
      });
      const selectedProperties = (metadata.data.sheets ?? []).find((item) => item.properties?.sheetId === sheetId)?.properties;
      if (!selectedProperties || typeof selectedProperties.title !== 'string') {
        throw new SheetsGatewayError('NOT_FOUND', '找不到指定的工作表，請重新選擇工作表。');
      }
      const rowCount = selectedProperties.gridProperties?.rowCount ?? 0;
      const columnCount = selectedProperties.gridProperties?.columnCount ?? 0;
      const endRow = Math.max(rowCount, 1);
      const endColumn = columnName(Math.max(columnCount, 1) - 1);
      const quotedTitle = `'${selectedProperties.title.replace(/'/g, "''")}'`;
      const response = await client.spreadsheets.get({
        spreadsheetId,
        ranges: [`${quotedTitle}!A1:${endColumn}${endRow}`],
        includeGridData: true,
        fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),merges,data(startRow,startColumn,rowData.values(userEnteredValue,effectiveValue,formattedValue,note)))'
      });
      const sheet = (response.data.sheets ?? []).find((item) => item.properties?.sheetId === sheetId);
      if (!sheet?.properties || typeof sheet.properties.title !== 'string') {
        throw new SheetsGatewayError('NOT_FOUND', '找不到指定的工作表，請重新選擇工作表。');
      }

      const cells: SheetsCell[] = [];
      for (const data of sheet.data ?? []) {
        const startRow = data.startRow ?? 0;
        const startColumn = data.startColumn ?? 0;
        for (const [rowOffset, row] of (data.rowData ?? []).entries()) {
          for (const [columnOffset, cell] of (row.values ?? []).entries()) {
            const value = enteredValue(cell);
            const formattedValue = cell.formattedValue ?? null;
            const note = cell.note ?? null;
            if (value !== null || formattedValue !== null || note !== null) {
              cells.push({ rowIndex: startRow + rowOffset, columnIndex: startColumn + columnOffset, enteredValue: value, formattedValue, note });
            }
          }
        }
      }

      const merges: SheetsGridRange[] = (sheet.merges ?? []).flatMap((range) => {
        const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } = range;
        return [startRowIndex, endRowIndex, startColumnIndex, endColumnIndex].every((value) => typeof value === 'number')
          ? [{ startRowIndex: startRowIndex!, endRowIndex: endRowIndex!, startColumnIndex: startColumnIndex!, endColumnIndex: endColumnIndex! }]
          : [];
      });

      return {
        sheetId,
        title: sheet.properties.title,
        rowCount: sheet.properties.gridProperties?.rowCount ?? rowCount,
        columnCount: sheet.properties.gridProperties?.columnCount ?? columnCount,
        merges,
        cells
      };
    } catch (error) { throw convertProviderError(error, 'read'); }
  }

  async writeCellUpdates(spreadsheetId: string, updates: SheetsCellUpdate[]): Promise<void> {
    if (updates.length === 0) return;
    const client = this.requireClient();
    try {
      await client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: updates.map((update) => ({
            updateCells: {
              range: {
                sheetId: update.sheetId,
                startRowIndex: update.rowIndex,
                endRowIndex: update.rowIndex + 1,
                startColumnIndex: update.columnIndex,
                endColumnIndex: update.columnIndex + 1
              },
              rows: [{ values: [{ userEnteredValue: { stringValue: update.value } }] }],
              fields: 'userEnteredValue'
            }
          }))
        }
      });
    } catch (error) { throw convertProviderError(error, 'write'); }
  }

  private requireClient(): sheets_v4.Sheets {
    if (this.configurationError) throw this.configurationError;
    if (!this.client) throw new SheetsGatewayError('NOT_CONFIGURED', 'Google Sheets 服務尚未完成設定。');
    return this.client;
  }
}
