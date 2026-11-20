import { ACTIVITY_PHASES, type ActivityPhaseUpdatedEvent, type ActivitySubscribedEvent, type BuzzerQuestionUpdatedEvent } from '@quiz-buzzer/shared';
import type { ActivitySnapshot } from '@quiz-buzzer/shared';

export type ActivitySocketEvent = ActivityPhaseUpdatedEvent | ActivitySubscribedEvent | BuzzerQuestionUpdatedEvent;

export function parseActivitySocketEvent(raw: string, expectedActivityId: string): ActivitySocketEvent | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (event.type === 'buzzer.question.updated') {
    if (event.activityId !== expectedActivityId || !Number.isSafeInteger(event.questionNumber) || (event.questionNumber as number) < 1
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
  return event.type === 'buzzer.question.updated' || event.revision > currentRevision;
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
  onRecoveryError?: (error: Error) => void
): ActivitySocketConnection {
  const protocol = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultUrl = `${protocol}//127.0.0.1:3000/ws`;
  const url = endpoint ?? import.meta.env.VITE_WS_URL ?? defaultUrl;
  let currentRevision = initialRevision;
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
      const event = parseActivitySocketEvent(message.data, activityId);
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
        onEvent(event);
        return;
      }
      if (!shouldApplyActivityRevision(event, currentRevision)) return;
      if (event.type !== 'buzzer.question.updated') currentRevision = event.revision;
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
