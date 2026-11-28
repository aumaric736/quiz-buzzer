import { ACTIVITY_PHASES, type ActivityPhaseUpdatedEvent, type ActivityRosterUpdatedEvent, type ActivitySubscribedEvent,
  type ActivityTeamAnswerUpdatedEvent, type BuzzerQuestionUpdatedEvent, type TeamAnswerUpdatedEvent, type TeamPresenceUpdatedEvent } from '@quiz-buzzer/shared';
import type { ActivitySnapshot } from '@quiz-buzzer/shared';

export type ActivitySocketEvent = ActivityPhaseUpdatedEvent | ActivityRosterUpdatedEvent | ActivitySubscribedEvent
  | ActivityTeamAnswerUpdatedEvent | BuzzerQuestionUpdatedEvent | TeamAnswerUpdatedEvent | TeamPresenceUpdatedEvent;

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validAnswerParts(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((part) => typeof part === 'string' && part.trim().length > 0);
}

function validCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 2;
}

function validAnswerSnapshots(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const answer = item as Record<string, unknown>;
    return Number.isSafeInteger(answer.questionNumber) && (answer.questionNumber as number) > 0
      && Number.isSafeInteger(answer.displayOrder) && (answer.displayOrder as number) >= 0
      && (answer.status === 'unanswered' || answer.status === 'submitted')
      && (answer.status === 'unanswered' ? answer.answerParts === undefined : validAnswerParts(answer.answerParts));
  });
}

function validTeacherQuestionProgress(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const progress = value as Record<string, unknown>;
  const validGroups = (groups: unknown, answered: boolean) => Array.isArray(groups) && groups.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const group = item as Record<string, unknown>;
    return typeof group.groupId === 'string' && !!group.groupId && typeof group.groupName === 'string'
      && !!group.groupName && (!answered || (Array.isArray(group.answerParts) && group.answerParts.length > 0
        && group.answerParts.every((part) => typeof part === 'string') && Number.isSafeInteger(group.submissionRank)
        && (group.submissionRank as number) > 0));
  });
  return typeof progress.questionNumber === 'number' && Number.isSafeInteger(progress.questionNumber) && progress.questionNumber > 0
    && typeof progress.displayOrder === 'number' && Number.isSafeInteger(progress.displayOrder) && progress.displayOrder >= 0
    && typeof progress.answeredGroupCount === 'number' && Number.isSafeInteger(progress.answeredGroupCount)
    && typeof progress.totalGroupCount === 'number' && Number.isSafeInteger(progress.totalGroupCount)
    && Array.isArray(progress.answeredGroups) && progress.answeredGroupCount === progress.answeredGroups.length
    && progress.totalGroupCount >= progress.answeredGroupCount
    && validGroups(progress.answeredGroups, true) && validGroups(progress.unansweredGroups, false)
    && progress.answeredGroupCount + (progress.unansweredGroups as unknown[]).length === progress.totalGroupCount;
}

export function parseActivitySocketEvent(raw: string, expectedActivityId: string, expectedGroupId?: string): ActivitySocketEvent | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (event.type === 'activity.roster.updated') {
    if (event.activityId !== expectedActivityId || !validRevision(event.activityLiveRevision) || !Array.isArray(event.groups)) return null;
    const validGroups = event.groups.every((item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
      const group = item as Record<string, unknown>;
      return typeof group.groupId === 'string' && group.groupId.length > 0
        && typeof group.displayName === 'string' && group.displayName.length > 0
        && (group.inviteCode === undefined || typeof group.inviteCode === 'string')
        && validCount(group.onlineCount)
        && typeof group.leaderOnline === 'boolean'
        && ['不可用', '開放加入', '額滿', '停止加入'].includes(String(group.joinStatus))
        && validAnswerSnapshots(group.answers);
    });
    return validGroups ? event as unknown as ActivityRosterUpdatedEvent : null;
  }
  if (event.type === 'team.presence.updated') {
    if (event.activityId !== expectedActivityId || typeof event.groupId !== 'string' || !event.groupId
      || (expectedGroupId !== undefined && event.groupId !== expectedGroupId) || !validRevision(event.groupLiveRevision)
      || typeof event.displayName !== 'string' || !event.displayName
      || (event.groupRole !== 'leader' && event.groupRole !== 'member')
      || !validCount(event.onlineCount) || !validCount(event.occupiedCount) || event.onlineCount > event.occupiedCount
      || event.capacity !== 2 || typeof event.acceptsMembers !== 'boolean' || !validAnswerSnapshots(event.answers)) return null;
    return event as unknown as TeamPresenceUpdatedEvent;
  }
  if (event.type === 'team.answer.updated') {
    if (event.activityId !== expectedActivityId || typeof event.groupId !== 'string' || !event.groupId
      || (expectedGroupId !== undefined && event.groupId !== expectedGroupId) || !validRevision(event.groupLiveRevision)
      || !Number.isSafeInteger(event.questionNumber) || (event.questionNumber as number) < 1
      || !Number.isSafeInteger(event.displayOrder) || (event.displayOrder as number) < 0
      || event.status !== 'submitted' || !validAnswerParts(event.answerParts)) return null;
    return event as unknown as TeamAnswerUpdatedEvent;
  }
  if (event.type === 'activity.team-answer.updated') {
    if (event.activityId !== expectedActivityId || !validRevision(event.activityLiveRevision)
      || typeof event.groupId !== 'string' || !event.groupId || typeof event.groupName !== 'string' || !event.groupName
      || !Number.isSafeInteger(event.questionNumber) || (event.questionNumber as number) < 1
      || event.status !== 'submitted' || !validAnswerParts(event.answerParts) || !validTeacherQuestionProgress(event.questionProgress)) return null;
    return event as unknown as ActivityTeamAnswerUpdatedEvent;
  }
  if (event.type === 'buzzer.question.updated') {
    if (event.activityId !== expectedActivityId || !Number.isSafeInteger(event.questionNumber) || (event.questionNumber as number) < 1
      || !Number.isSafeInteger(event.displayOrder) || (event.displayOrder as number) < 0
      || event.status !== 'won' || typeof event.groupId !== 'string' || !event.groupId
      || typeof event.groupName !== 'string' || !event.groupName || !Array.isArray(event.answerParts)
      || event.answerParts.length < 1 || event.answerParts.some((part) => typeof part !== 'string' || !part.trim())) return null;
    return event as unknown as BuzzerQuestionUpdatedEvent;
  }
  if ((event.type !== 'activity.phase.updated' && event.type !== 'activity.subscribed')
    || event.activityId !== expectedActivityId
    || typeof event.phase !== 'string' || !ACTIVITY_PHASES.includes(event.phase as (typeof ACTIVITY_PHASES)[number])
    || !Number.isInteger(event.revision) || (event.revision as number) < 0) return null;
  return event as unknown as ActivitySocketEvent;
}

export function shouldApplyActivityRevision(event: ActivitySocketEvent, currentRevision: number): boolean {
  if (event.type === 'buzzer.question.updated') return true;
  if (event.type === 'activity.roster.updated' || event.type === 'activity.team-answer.updated') return event.activityLiveRevision > currentRevision;
  if (event.type === 'team.presence.updated' || event.type === 'team.answer.updated') return event.groupLiveRevision > currentRevision;
  return event.revision > currentRevision;
}

export interface ActivitySocketConnection { close(): void }

export function connectActivitySocket(
  sessionId: string,
  activityId: string,
  initialRevision: number,
  onEvent: (event: ActivitySocketEvent) => void,
  onConnectionChange: (connected: boolean) => void,
  recoverSnapshot?: () => Promise<ActivitySnapshot>,
  endpoint?: string,
  onRecoveryError?: (error: Error) => void,
  expectedGroupId?: string
): ActivitySocketConnection {
  const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultUrl = `${protocol}//127.0.0.1:3000/ws`;
  const url = endpoint ?? import.meta.env.VITE_WS_URL ?? defaultUrl;
  let currentRevision = initialRevision;
  let currentActivityLiveRevision = -1;
  let currentGroupLiveRevision = -1;
  let currentSocket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = 250;
  let stopped = false;
  let hasConnectedOnce = false;

  const connect = () => {
    if (stopped) return;
    const socket = new WebSocket(url);
    currentSocket = socket;
    socket.addEventListener('open', () => {
      onConnectionChange(true);
      void (async () => {
        try {
          if (recoverSnapshot && hasConnectedOnce) {
            const snapshot = await recoverSnapshot();
            if (stopped || currentSocket !== socket || socket.readyState !== WebSocket.OPEN) return;
            if (snapshot.revision > currentRevision) {
              currentRevision = snapshot.revision;
              onEvent({ type: 'activity.subscribed', ...snapshot });
            }
          }
          if (!stopped && currentSocket === socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
            hasConnectedOnce = true;
          }
        } catch (error) {
          onRecoveryError?.(error instanceof Error ? error : new Error('無法恢復活動狀態。'));
          socket.close();
        }
      })();
    });
    socket.addEventListener('close', () => {
      if (currentSocket === socket) currentSocket = null;
      onConnectionChange(false);
      if (!stopped && reconnectTimer === undefined) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined;
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 3000);
      }
    });
    socket.addEventListener('error', () => onConnectionChange(false));
    socket.addEventListener('message', (message) => {
      if (typeof message.data !== 'string') return;
      const event = parseActivitySocketEvent(message.data, activityId, expectedGroupId);
      if (!event) {
        try {
          const payload: unknown = JSON.parse(message.data);
          if (typeof payload === 'object' && payload !== null && 'type' in payload && payload.type === 'error'
            && 'message' in payload && typeof payload.message === 'string') {
            onRecoveryError?.(new Error(payload.message));
            socket.close();
          }
        } catch { /* Invalid protocol data is ignored without echoing it. */ }
        return;
      }
      if (event.type === 'activity.subscribed') {
        reconnectDelay = 250;
        onRecoveryError?.(new Error(''));
        if (event.revision >= currentRevision) {
          currentRevision = event.revision;
          onEvent(event);
        }
        return;
      }
      if (event.type === 'activity.roster.updated' || event.type === 'activity.team-answer.updated') {
        if (!shouldApplyActivityRevision(event, currentActivityLiveRevision)) return;
        currentActivityLiveRevision = event.activityLiveRevision;
      } else if (event.type === 'team.presence.updated' || event.type === 'team.answer.updated') {
        if (!shouldApplyActivityRevision(event, currentGroupLiveRevision)) return;
        currentGroupLiveRevision = event.groupLiveRevision;
      } else {
        if (!shouldApplyActivityRevision(event, currentRevision)) return;
        if (event.type !== 'buzzer.question.updated') currentRevision = event.revision;
      }
      onEvent(event);
    });
  };

  connect();
  return {
    close() {
      stopped = true;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      currentSocket?.close();
      currentSocket = null;
    }
  };
}
