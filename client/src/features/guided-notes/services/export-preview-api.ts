import type { GuidedNotesExportPreview, GuidedNotesExportResult } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

export class GuidedNotesExportApiError extends Error {
  constructor(message: string, readonly code: string, readonly exportId: string | null = null) {
    super(message);
    this.name = 'GuidedNotesExportApiError';
  }
}

async function request<T>(sessionId: string, activityId: string, endpoint: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DEFAULT_API_BASE}/api/activities/${encodeURIComponent(activityId)}/guided-notes/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId },
      body: JSON.stringify(body)
    });
  } catch { throw new Error('無法連線到本機服務，請確認服務正在執行後重試。'); }
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('本機服務回傳無效資料，請稍後重試。'); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : 'Guided Notes 操作失敗，請稍後重試。';
    const code = typeof result === 'object' && result !== null && 'code' in result && typeof result.code === 'string' ? result.code : 'REQUEST_FAILED';
    const exportId = typeof result === 'object' && result !== null && 'exportId' in result && typeof result.exportId === 'string' ? result.exportId : null;
    throw new GuidedNotesExportApiError(message, code, exportId);
  }
  return result as T;
}

export function createExportPreview(sessionId: string, activityId: string): Promise<GuidedNotesExportPreview> {
  return request(sessionId, activityId, 'export-previews', {});
}

export function confirmExport(sessionId: string, activityId: string, previewId: string): Promise<GuidedNotesExportResult> {
  return request(sessionId, activityId, 'exports', { previewId });
}

export function retryExport(sessionId: string, activityId: string, exportId: string): Promise<GuidedNotesExportResult> {
  return request(sessionId, activityId, `exports/${encodeURIComponent(exportId)}/retry`, {});
}

export async function getExportResult(sessionId: string, activityId: string, exportId: string): Promise<GuidedNotesExportResult> {
  let response: Response;
  try {
    response = await fetch(`${DEFAULT_API_BASE}/api/activities/${encodeURIComponent(activityId)}/guided-notes/exports/${encodeURIComponent(exportId)}`, {
      headers: { 'X-Local-Session-Id': sessionId }
    });
  } catch { throw new Error('無法查詢寫回狀態，請確認本機服務正在執行。'); }
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('本機服務回傳無效資料，請稍後重試。'); }
  if (!response.ok) throw new Error(typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string' ? result.message : '查詢寫回狀態失敗。');
  return result as GuidedNotesExportResult;
}
