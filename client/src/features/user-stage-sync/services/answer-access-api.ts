export async function checkAnswerAccess(sessionId: string, activityId: string): Promise<{ allowed: true }> {
  return request<{ allowed: true }>(sessionId, activityId, '/answer-attempt-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
}

export async function getAnswerStatus(sessionId: string, activityId: string): Promise<import('@quiz-buzzer/shared').AnswerStatusResponse> {
  return request<import('@quiz-buzzer/shared').AnswerStatusResponse>(sessionId, activityId, '/answer-status');
}

async function request<T>(sessionId: string, activityId: string, path: string, init?: RequestInit): Promise<T> {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/activities/${encodeURIComponent(activityId)}${path}`, {
      ...init, headers: { 'X-Local-Session-Id': sessionId, ...(init?.headers ?? {}) }
    });
  } catch { throw new Error('無法連線到本機服務，請稍後重試。'); }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '操作失敗，請稍後重試。';
    throw new Error(message);
  }
  return result as T;
}
