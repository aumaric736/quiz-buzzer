import type { Role, UserSession } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

async function request<T>(url: string, init?: RequestInit, apiBase = DEFAULT_API_BASE): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBase}${url}`, init); }
  catch { throw new Error('無法連線到本機服務，請確認服務正在執行後重試。'); }
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '要求失敗，請稍後再試。';
    throw new Error(message);
  }
  return result as T;
}

export function createLocalSession(role: Role): Promise<UserSession> {
  return request('/api/sessions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role })
  });
}

export function restoreLocalSession(sessionId: string, apiBase = DEFAULT_API_BASE): Promise<UserSession> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, undefined, apiBase);
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
