import type { AnswerSubmissionAck, AnswerSubmissionRequest, BuzzerQuestionsResponse } from '@quiz-buzzer/shared';

const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

async function request<T>(sessionId: string, path: string, init?: RequestInit, apiBase = DEFAULT_API_BASE): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: { 'X-Local-Session-Id': sessionId, ...(init?.headers ?? {}) }
    });
  } catch {
    throw new Error('無法連線到本機服務，請確認服務正在執行後重試。');
  }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error('本機服務回傳無效資料，請稍後重試。'); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '要求失敗，請稍後再試。';
    throw new Error(message);
  }
  return result as T;
}

export function getBuzzerQuestions(sessionId: string, activityId: string, apiBase?: string): Promise<BuzzerQuestionsResponse> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}/questions`, undefined, apiBase);
}

export function getPublishedFinalResults(activityCode: string, apiBase = DEFAULT_API_BASE): Promise<import('@quiz-buzzer/shared').EndedAnswerStatusResponse> {
  return fetch(`${apiBase}/api/activities/${encodeURIComponent(activityCode)}/final-results`)
    .then(async (response) => {
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string' ? result.message : '無法載入最終結果。';
        throw new Error(message);
      }
      return result as import('@quiz-buzzer/shared').EndedAnswerStatusResponse;
    });
}

export function submitBuzzerAnswer(
  sessionId: string,
  activityId: string,
  answer: AnswerSubmissionRequest,
  apiBase?: string
): Promise<AnswerSubmissionAck> {
  return request(sessionId, `/api/activities/${encodeURIComponent(activityId)}/answers`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answer)
  }, apiBase);
}
