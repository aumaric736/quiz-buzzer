import type { StudentTeamLiveSnapshot } from '@quiz-buzzer/shared';

export function GroupPresenceStatus({ snapshot }: { snapshot: StudentTeamLiveSnapshot }) {
  const full = snapshot.onlineCount === snapshot.capacity;
  const roleLabel = snapshot.groupRole === 'leader' ? '組長' : '組員';
  return <div className="mt-4 flex items-center gap-3 text-sm" aria-live="polite" aria-label="小組在線狀態">
    <span className="rounded-full bg-white px-3 py-1 font-semibold text-indigo-900">
      {snapshot.onlineCount}/{snapshot.capacity}{full ? '（已滿額）' : ''}
    </span>
    <span className="rounded-full bg-indigo-100 px-3 py-1 font-medium text-indigo-900">{roleLabel}</span>
  </div>;
}
