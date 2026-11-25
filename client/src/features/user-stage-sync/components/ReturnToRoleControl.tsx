import { useState } from 'react';
import { clearLocalSessionId, loadLocalSessionId, resetLocalSession, retireBeforeClearingSession } from '../services/session-api.js';

interface ReturnToRoleControlProps { visible: boolean; onReturned: () => void }

export function ReturnToRoleControl({ visible, onReturned }: ReturnToRoleControlProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (!visible) return null;
  async function returnToRoles() {
    if (pending) return;
    setPending(true); setError('');
    try {
      await retireBeforeClearingSession(loadLocalSessionId(), resetLocalSession, clearLocalSessionId);
      onReturned();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法結束目前工作階段，請重試。');
    } finally { setPending(false); }
  }
  return <div className="mb-5 flex flex-col items-center gap-2">
    <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700" disabled={pending} onClick={() => void returnToRoles()}>
      {pending ? '正在清除工作階段…' : '返回角色選擇'}
    </button>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </div>;
}
