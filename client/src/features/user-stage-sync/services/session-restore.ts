import type { ActivitySnapshot, UserSession } from '@quiz-buzzer/shared';
import { getActivity } from './activity-api.js';
import { ApiError, clearLocalSessionId, restoreLocalSession } from './session-api.js';

export function isRetiredSessionError(reason: unknown): reason is ApiError {
  return reason instanceof ApiError && reason.code === 'SESSION_NOT_FOUND';
}

export interface RestoredApplicationSession {
  session: UserSession;
  activity: ActivitySnapshot | null;
}

export async function restoreApplicationSession(sessionId: string, apiBase?: string): Promise<RestoredApplicationSession> {
  try {
    const session = await restoreLocalSession(sessionId, apiBase);
    const activity = session.activityId ? await getActivity(session.sessionId, session.activityId, apiBase) : null;
    return { session, activity };
  } catch (reason) {
    if (isRetiredSessionError(reason)) clearLocalSessionId();
    throw reason;
  }
}
