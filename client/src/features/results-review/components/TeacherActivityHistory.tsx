import { useEffect, useState } from 'react';
import type { TeacherActivitySummary } from '@quiz-buzzer/shared';
import { getTeacherActivities } from '../services/results-review-api.js';

interface TeacherActivityHistoryProps {
  sessionId: string;
  selectedActivityId: string | null;
  refreshToken: number;
  onOpen: (activityId: string) => void;
}

export function TeacherActivityHistory({ sessionId, selectedActivityId, refreshToken, onOpen }: TeacherActivityHistoryProps) {
  const [activities, setActivities] = useState<TeacherActivitySummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getTeacherActivities(sessionId).then((response) => {
      if (active) { setActivities(response.activities); setError(''); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '讀取活動歷史失敗，請重試。');
    });
    return () => { active = false; };
  }, [sessionId, refreshToken]);

  return <section className="mt-7 rounded-2xl border border-slate-200 p-5" aria-label="活動歷史">
    <h3 className="text-lg font-bold">活動歷史與檢討</h3>
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {!error && activities.length === 0 && <p className="mt-3 text-sm text-slate-600">目前沒有活動紀錄。</p>}
    {activities.length > 0 && <ul className="mt-3 space-y-2">
      {activities.map((activity) => <li key={activity.activityId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
        <div><p className="font-mono text-xs text-slate-600">{activity.activityId}</p><p className="mt-1 text-sm">{activity.phase}</p></div>
        <button type="button" disabled={activity.phase !== '已結束'} aria-current={selectedActivityId === activity.activityId ? 'true' : undefined}
          onClick={() => onOpen(activity.activityId)}
          className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">
          {selectedActivityId === activity.activityId ? '正在檢視' : '查看檢討紀錄'}
        </button>
      </li>)}
    </ul>}
  </section>;
}
