import type { GroupRecord } from '@quiz-buzzer/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

export async function joinActivity(sessionId: string, activityId: string, enrollment: { mode: 'leader'; groupName: string } | { mode: 'member'; inviteCode: string }): Promise<GroupRecord> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/activities/${encodeURIComponent(activityId)}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(enrollment)
    });
  } catch { throw new Error('無法連線到本機服務，請確認服務正在執行後重試。'); }
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('本機服務回傳無效資料，請稍後重試。'); }
  if (!response.ok) {
    const message = typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
      ? result.message : '加入活動失敗，請稍後重試。';
    throw new Error(message);
  }
  return result as GroupRecord;
}
