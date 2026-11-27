import { useState, type FormEvent } from 'react';
import type { UserSession } from '@quiz-buzzer/shared';
import { createLocalSession, loginTeacher, saveLocalSessionId } from '../services/session-api.js';

interface RoleSelectorProps { onSelected: (session: UserSession) => void }

export function RoleSelector({ onSelected }: RoleSelectorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function chooseStudent() {
    setBusy(true);
    setError('');
    try {
      const session = await createLocalSession('student');
      saveLocalSessionId(session.sessionId);
      onSelected(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '建立工作階段失敗，請重試。');
    } finally { setBusy(false); }
  }

  async function signInTeacher(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await loginTeacher(username, password);
      saveLocalSessionId(session.sessionId);
      onSelected(session);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '登入失敗，請重試。'); }
    finally { setBusy(false); }
  }

  return <section className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <h2 className="text-xl font-semibold">選擇使用角色</h2>
    <form className="mt-6 space-y-3" onSubmit={(event) => void signInTeacher(event)}>
      <h3 className="font-semibold">老師登入</h3>
      <label className="block text-sm">帳號<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
      <label className="block text-sm">密碼<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
      <button className="w-full rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy}>登入並管理活動</button>
    </form>
    <div className="mt-4 border-t border-slate-200 pt-4">
      <button className="w-full rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50 disabled:opacity-50" disabled={busy} onClick={() => void chooseStudent()}>我是學生</button>
    </div>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
