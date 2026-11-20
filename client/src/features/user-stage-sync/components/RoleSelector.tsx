import { useState } from 'react';
import type { Role, UserSession } from '@quiz-buzzer/shared';
import { createLocalSession, saveLocalSessionId } from '../services/session-api.js';

interface RoleSelectorProps { onSelected: (session: UserSession) => void }

export function RoleSelector({ onSelected }: RoleSelectorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(role: Role) {
    setBusy(true);
    setError('');
    try {
      const session = await createLocalSession(role);
      saveLocalSessionId(session.sessionId);
      onSelected(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '建立工作階段失敗，請重試。');
    } finally { setBusy(false); }
  }

  return <section className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-xl font-semibold">選擇使用角色</h2>
    <p className="mt-2 text-sm text-slate-600">這是本機模擬角色，不會建立帳號。</p>
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button className="rounded-xl bg-indigo-600 px-5 py-4 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy} onClick={() => void choose('teacher')}>我是老師</button>
      <button className="rounded-xl border border-slate-300 px-5 py-4 font-semibold hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => void choose('student')}>我是學生</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
