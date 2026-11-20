import { useEffect, useRef, useState } from 'react';
import type { ActivitySnapshot, BuzzerQuestionUpdatedEvent } from '@quiz-buzzer/shared';
import { connectActivitySocket } from '../services/activity-socket.js';
import { getActivity } from '../services/activity-api.js';

interface ActivityPhaseStatusProps {
  sessionId: string;
  activity: ActivitySnapshot;
  onUpdate: (snapshot: ActivitySnapshot) => void;
  onReconnect?: () => void;
  onBuzzerUpdate?: (event: BuzzerQuestionUpdatedEvent) => void;
}

export function ActivityPhaseStatus({ sessionId, activity, onUpdate, onReconnect, onBuzzerUpdate }: ActivityPhaseStatusProps) {
  const [connected, setConnected] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  const onReconnectRef = useRef(onReconnect);
  useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);
  const onBuzzerUpdateRef = useRef(onBuzzerUpdate);
  useEffect(() => { onBuzzerUpdateRef.current = onBuzzerUpdate; }, [onBuzzerUpdate]);
  useEffect(() => {
    const socket = connectActivitySocket(sessionId, activity.activityId, activity.revision,
      (event) => {
        if (event.type === 'buzzer.question.updated') { onBuzzerUpdateRef.current?.(event); return; }
        onUpdateRef.current({ activityId: event.activityId, phase: event.phase, revision: event.revision });
        if (event.type === 'activity.subscribed') onReconnectRef.current?.();
      }, setConnected,
      () => getActivity(sessionId, activity.activityId), undefined,
      (reason) => setRecoveryError(reason.message ? `無法恢復活動狀態：${reason.message} 請返回活動選擇畫面後重新加入。` : ''));
    return () => socket.close();
  }, [sessionId, activity.activityId]);

  return <>{recoveryError ? <p role="alert" className="mt-4 text-sm text-red-800">{recoveryError}</p> : <p role="status" className="mt-4 text-sm text-slate-500">{connected ? '即時同步已連線' : '正在連線同步…'}</p>}</>;
}
