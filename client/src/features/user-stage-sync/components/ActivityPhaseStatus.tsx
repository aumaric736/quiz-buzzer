import { useEffect, useRef, useState } from 'react';
import type { ActivitySnapshot, BuzzerQuestionUpdatedEvent, StudentTeamLiveSnapshot } from '@quiz-buzzer/shared';
import { connectActivitySocket } from '../services/activity-socket.js';
import type { ActivitySocketEvent } from '../services/activity-socket.js';
import { getActivity } from '../services/activity-api.js';

interface ActivityPhaseStatusProps {
  sessionId: string;
  activity: ActivitySnapshot;
  onUpdate: (snapshot: ActivitySnapshot) => void;
  onReconnect?: () => void;
  onBuzzerUpdate?: (event: BuzzerQuestionUpdatedEvent) => void;
  groupId?: string;
  onLiveEvent?: (event: Exclude<ActivitySocketEvent, ActivitySnapshot | BuzzerQuestionUpdatedEvent>) => void;
}

export function ActivityPhaseStatus({ sessionId, activity, onUpdate, onReconnect, onBuzzerUpdate, groupId, onLiveEvent }: ActivityPhaseStatusProps) {
  const [connected, setConnected] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);
  const onBuzzerUpdateRef = useRef(onBuzzerUpdate);
  useEffect(() => { onBuzzerUpdateRef.current = onBuzzerUpdate; }, [onBuzzerUpdate]);
  const onLiveEventRef = useRef(onLiveEvent);
  useEffect(() => { onLiveEventRef.current = onLiveEvent; }, [onLiveEvent]);
  useEffect(() => {
    const socket = connectActivitySocket(sessionId, activity.activityId, activity.revision,
      (event) => {
        if (event.type === 'buzzer.question.updated') { onBuzzerUpdateRef.current?.(event); return; }
        if (event.type === 'activity.subscribed' || event.type === 'activity.phase.updated') {
          onUpdateRef.current({ activityId: event.activityId, phase: event.phase, revision: event.revision });
          if (event.type === 'activity.subscribed') onReconnectRef.current?.();
        } else onLiveEventRef.current?.(event as Exclude<ActivitySocketEvent, ActivitySnapshot | BuzzerQuestionUpdatedEvent>);
      }, setConnected,
      () => getActivity(sessionId, activity.activityId), undefined,
      (reason) => setRecoveryError(reason.message ? `無法恢復活動狀態：${reason.message} 請返回活動選擇畫面後重新加入。` : ''), groupId);
    return () => socket.close();
  }, [sessionId, activity.activityId, groupId]);

  return <>{recoveryError ? <p role="alert" className="mt-4 text-sm text-red-800">{recoveryError}</p> : <p role="status" className="mt-4 text-sm text-slate-500">{connected ? '即時同步已連線' : '正在連線同步…'}</p>}</>;
}
