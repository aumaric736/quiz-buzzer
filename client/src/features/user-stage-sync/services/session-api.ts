import type { Role, UserSession } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) { super(message); }
}

async function request<T>(url: string, init?: RequestInit, apiBase = DEFAULT_API_BASE): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBase}${url}`, init); }
  catch { throw new Error('無法連線到本機服務，請確認服務正在執行後重試。'); }
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '要求失敗，請稍後再試。';
    const code = typeof result === 'object' && result !== null && 'code' in result && typeof result.code === 'string' ? result.code : 'REQUEST_FAILED';
    throw new ApiError(message, code, response.status);
  }
  return result as T;
}

export function createLocalSession(role: Role): Promise<UserSession> {
  return request('/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role })
  });
}

export function loginTeacher(username: string, password: string): Promise<UserSession> {
  return request('/api/teacher/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
}

export function restoreLocalSession(sessionId: string, apiBase = DEFAULT_API_BASE): Promise<UserSession> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, undefined, apiBase);
}

export function resetLocalSession(sessionId: string): Promise<{ sessionId: string; status: 'retired'; activityId: null; groupId: null }> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/reset-context`, { method: 'POST' });
}

export async function retireBeforeClearingSession(
  sessionId: string | null,
  retire: (id: string) => Promise<unknown>,
  clear: () => void
): Promise<void> {
  if (sessionId) {
    try { await retire(sessionId); }
    catch (reason) {
      if (!(reason instanceof ApiError) || reason.code !== 'SESSION_NOT_FOUND') throw reason;
    }
  }
  clear();
}

export function saveLocalSessionId(sessionId: string): void {
  localStorage.setItem('quiz-buzzer.session-id', sessionId);
}

export function loadLocalSessionId(): string | null {
  return localStorage.getItem('quiz-buzzer.session-id');
}

export function clearLocalSessionId(): void {
  localStorage.removeItem('quiz-buzzer.session-id');
}
