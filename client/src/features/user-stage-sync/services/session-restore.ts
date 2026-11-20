import type { ActivitySnapshot, UserSession } from '@quiz-buzzer/shared';
import { getActivity } from './activity-api.js';
import { restoreLocalSession } from './session-api.js';

export interface RestoredApplicationSession {
  session: UserSession;
  activity: ActivitySnapshot | null;
}

export async function restoreApplicationSession(sessionId: string, apiBase?: string): Promise<RestoredApplicationSession> {
  const session = await restoreLocalSession(sessionId, apiBase);
  const activity = session.activityId ? await getActivity(session.sessionId, session.activityId, apiBase) : null;
  return { session, activity };
}
