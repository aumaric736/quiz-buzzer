import { useEffect, useState } from 'react';
import type { TeacherGroupRosterItem } from '@quiz-buzzer/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';
export function TeacherGroupRoster({ sessionId, activityId }: { sessionId: string; activityId: string }) {
  const [items, setItems] = useState<TeacherGroupRosterItem[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    void fetch(`${API_BASE}/api/activities/${encodeURIComponent(activityId)}/groups`, { headers: { 'X-Local-Session-Id': sessionId } })
      .then(async (response) => {
        const result = await response.json() as { items?: TeacherGroupRosterItem[]; message?: string };
        if (!response.ok) throw new Error(result.message ?? '無法讀取小組名冊。');
        if (current) setItems(result.items ?? []);
      }).catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : '無法讀取小組名冊。'); });
    return () => { current = false; };
  }, [activityId, sessionId]);
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="font-semibold">小組名冊（{items.length}/100 組）</h3>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {items.length === 0 ? <p className="mt-2 text-sm text-slate-500">目前尚無小組。</p> : <ul className="mt-3 divide-y divide-slate-100">{items.map((item) => <li key={item.groupId} className="flex items-center justify-between py-3 text-sm"><span className="font-mono tracking-wider">{item.inviteCode}</span><span>{item.activeSessionCount}/2 個使用中席位</span></li>)}</ul>}
  </section>;
}
