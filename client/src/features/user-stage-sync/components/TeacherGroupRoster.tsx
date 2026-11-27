import { useEffect, useState } from 'react';
import type { LiveGroupRosterRecord, TeacherGroupRosterItem } from '@quiz-buzzer/shared';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';
export function TeacherGroupRoster({ sessionId, activityId, liveGroups }: { sessionId: string; activityId: string; liveGroups?: LiveGroupRosterRecord[] | null }) {
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
  const roster = liveGroups ?? items.map((item) => ({ groupId: item.groupId, displayName: item.inviteCode, inviteCode: item.inviteCode,
    onlineCount: item.onlineCount, occupiedCount: item.occupiedCount, capacity: item.capacity, acceptsMembers: item.acceptsMembers, answers: [] }));
  return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="font-semibold">小組名冊（{roster.length}/100 組）</h3>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {roster.length === 0 ? <p className="mt-2 text-sm text-slate-500">目前尚無小組。</p> : <ul className="mt-3 divide-y divide-slate-100">{roster.map((item) => {
      const acceptsNewMember = item.acceptsMembers && item.occupiedCount < item.capacity;
      return <li key={item.groupId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
        <span>{item.displayName} <span className="font-mono tracking-wider">({item.inviteCode})</span></span>
        <span>{item.onlineCount}/{item.capacity} 人在線</span>
        <span>{item.occupiedCount}/{item.capacity} 個使用中席位</span>
        <span className={acceptsNewMember ? 'text-emerald-700' : 'text-slate-500'}>{acceptsNewMember ? '開放加入' : '停止新加入'}</span>
        <span className="w-full text-xs text-slate-600">{item.answers.filter((answer) => answer.status === 'submitted').map((answer) => `第 ${answer.questionNumber} 題：${answer.answerParts?.join('、') ?? ''}`).join('；')}</span>
      </li>;
    })}</ul>}
  </section>;
}
