import type { GuidedNotesImportRequest, GuidedNotesImportResponse, GuidedNotesWorksheet } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

async function request<T>(sessionId: string, activityId: string, operation: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DEFAULT_API_BASE}/api/activities/${encodeURIComponent(activityId)}/guided-notes/${operation}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error('無法連線到本機服務，請確認服務正在執行後重試。');
  }
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('本機服務回傳無效資料，請稍後重試。'); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : 'Guided Notes 操作失敗，請稍後重試。';
    throw new Error(message);
  }
  return result as T;
}

export async function discoverWorksheets(sessionId: string, activityId: string, spreadsheetUrl: string): Promise<{ spreadsheetId: string; worksheets: GuidedNotesWorksheet[] }> {
  return request(sessionId, activityId, 'worksheets', { spreadsheetUrl });
}

export async function importWorksheet(sessionId: string, activityId: string, input: GuidedNotesImportRequest): Promise<GuidedNotesImportResponse> {
  return request(sessionId, activityId, 'import', input);
}
