import type { TeacherActivityListResponse, TeacherReviewRecordsResponse } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

async function request<T>(sessionId: string, path: string, apiBase = DEFAULT_API_BASE): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, { headers: { 'X-Local-Session-Id': sessionId } });
  } catch { throw new Error('無法連線到本機服務，請確認服務正在執行後重試。'); }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '要求失敗，請稍後再試。';
    throw new Error(message);
  }
  return result as T;
}

export function getTeacherActivities(sessionId: string, apiBase?: string): Promise<TeacherActivityListResponse> {
  return request(sessionId, '/api/teacher/activities', apiBase);
}

export function getTeacherReviewRecords(
  sessionId: string,
  activityId: string,
  apiBase?: string
): Promise<TeacherReviewRecordsResponse> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}/review-records`, apiBase);
}
