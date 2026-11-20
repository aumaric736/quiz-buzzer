import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { UserSession } from '@quiz-buzzer/shared';
import { RoleSelector } from './features/user-stage-sync/components/RoleSelector.js';
import { TeacherActivityView } from './features/user-stage-sync/views/TeacherActivityView.js';
import { StudentJoinView } from './features/user-stage-sync/views/StudentJoinView.js';
import { clearLocalSessionId, loadLocalSessionId } from './features/user-stage-sync/services/session-api.js';
import { restoreApplicationSession } from './features/user-stage-sync/services/session-restore.js';
import type { ActivitySnapshot } from '@quiz-buzzer/shared';
import './styles.css';

function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [activity, setActivity] = useState<ActivitySnapshot | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState('');

  async function restoreSavedSession() {
    setRestoreError('');
    const sessionId = loadLocalSessionId();
    if (!sessionId) { setRestoring(false); return; }
    setRestoring(true);
    try {
      const restored = await restoreApplicationSession(sessionId);
      setSession(restored.session);
      setActivity(restored.activity);
    } catch (reason) {
      setSession(null);
      setActivity(null);
      setRestoreError(reason instanceof Error ? reason.message : '無法恢復工作階段，請重試。');
    } finally { setRestoring(false); }
  }

  useEffect(() => { void restoreSavedSession(); }, []);

  return <main className="flex min-h-screen flex-col items-center bg-slate-50 px-5 py-14 text-slate-900">
    <h1 className="mb-8 text-3xl font-bold">課堂搶答系統</h1>
    {restoring ? <p role="status">正在恢復本機工作階段…</p> : restoreError ? <section className="max-w-xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200"><p role="alert" className="text-red-800">{restoreError}</p><div className="mt-5 flex gap-3"><button className="rounded-xl bg-indigo-600 px-4 py-2 text-white" onClick={() => void restoreSavedSession()}>重新嘗試</button><button className="rounded-xl border px-4 py-2" onClick={() => { clearLocalSessionId(); setRestoreError(''); }}>重新選擇角色</button></div></section> : session ? session.role === 'teacher' ? <TeacherActivityView session={session} initialActivity={activity} /> : <StudentJoinView session={session} initialActivity={activity} /> : <RoleSelector onSelected={(value) => { setSession(value); setActivity(null); }} />}
  </main>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
