import type { ActivityPhase, ActivitySnapshot, TeacherActivityProgressResponse } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

async function request<T>(sessionId: string, path: string, init?: RequestInit, apiBase = DEFAULT_API_BASE): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { 'X-Local-Session-Id': sessionId, ...(init?.headers ?? {}) }
    });
  } catch { throw new Error('無法連線到本機服務，請確認服務正在執行後重試。'); }
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('本機服務回傳無效資料，請稍後重試。'); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '要求失敗，請稍後再試。';
    throw new Error(message);
  }
  return result as T;
}

export function createActivity(sessionId: string): Promise<ActivitySnapshot> {
  return request(sessionId, '/api/activities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
}

export function getActivity(sessionId: string, activityId: string, apiBase = DEFAULT_API_BASE): Promise<ActivitySnapshot> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}`, undefined, apiBase);
}

export function changeActivityPhase(sessionId: string, activityId: string, phase: ActivityPhase): Promise<ActivitySnapshot> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}/phase`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phase })
  });
}

export function openActivityJoining(sessionId: string, activityId: string): Promise<ActivitySnapshot> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}/open-joining`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
}

export function getTeacherActivityProgress(sessionId: string, activityId: string): Promise<TeacherActivityProgressResponse> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}/teacher-progress`);
}
