import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ActivitySnapshot, AnswerStatusResponse, GroupRecord, StudentOwnQuestionStatus, UserSession, WinningAnswerResult } from '@quiz-buzzer/shared';
import { getActivity } from '../services/activity-api.js';
import { joinActivity } from '../services/group-api.js';
import { ActivityPhaseStatus } from '../components/ActivityPhaseStatus.js';
import { getAnswerStatus } from '../services/answer-access-api.js';
import { StudentAnswerView } from '../../buzzer-flow/views/StudentAnswerView.js';
import { QuestionResultList } from '../../buzzer-flow/components/QuestionResultList.js';

interface StudentJoinViewProps { session: UserSession; initialActivity?: ActivitySnapshot | null }

export function StudentJoinView({ session, initialActivity = null }: StudentJoinViewProps) {
  const [activityId, setActivityId] = useState(session.activityId ?? '');
  const [groupName, setGroupName] = useState('');
  const [group, setGroup] = useState<GroupRecord | null>(() => session.activityId && session.groupId ? {
    groupId: session.groupId, activityId: session.activityId, displayName: session.groupName ?? '已加入組別'
  } : null);
  const [activity, setActivity] = useState<ActivitySnapshot | null>(initialActivity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answerItems, setAnswerItems] = useState<Array<StudentOwnQuestionStatus | WinningAnswerResult> | null>(null);
  const [switchingActivity, setSwitchingActivity] = useState(false);

  const refreshAnswerStatus = useCallback(async () => {
    if (!activity || !group || activity.phase === '準備中') return;
    try {
      const result: AnswerStatusResponse = await getAnswerStatus(session.sessionId, activity.activityId);
      if (result.phase !== '準備中') setAnswerItems(result.items as Array<StudentOwnQuestionStatus | WinningAnswerResult>);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '讀取作答狀況失敗。'); }
  }, [activity?.activityId, activity?.phase, group, session.sessionId]);

  useEffect(() => {
    void refreshAnswerStatus();
  }, [refreshAnswerStatus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!activityId.trim()) { setError('請輸入活動代碼。'); return; }
    if (!groupName.trim()) { setError('請輸入組別名稱。'); return; }
    setBusy(true);
    try {
      const joined = await joinActivity(session.sessionId, activityId.trim(), groupName);
      const current = await getActivity(session.sessionId, joined.activityId);
      setGroup(joined);
      setActivity(current);
      setAnswerItems(null);
      setSwitchingActivity(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '加入活動失敗，請重試。'); }
    finally { setBusy(false); }
  }

  return <section className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <p className="text-sm font-medium text-indigo-700">學生畫面</p><h2 className="mt-1 text-2xl font-bold">加入課堂活動</h2>
    {group && activity ? <div className="mt-7 rounded-2xl bg-indigo-50 p-6"><p className="text-sm text-indigo-800">組別</p><p className="mt-1 text-xl font-semibold">{group.displayName}</p><p className="mt-5 text-sm text-indigo-800">目前階段</p><p aria-live="polite" className="mt-1 text-2xl font-bold">{activity.phase}</p>
      <ActivityPhaseStatus sessionId={session.sessionId} activity={activity} onUpdate={setActivity} onReconnect={() => void refreshAnswerStatus()} />
      <StudentAnswerView sessionId={session.sessionId} activity={activity} submittedQuestionNumbers={answerItems?.flatMap((item) => 'status' in item && item.status === 'submitted' ? [item.questionNumber] : [])} />
      {activity.phase === '已結束' && <>{answerItems && <QuestionResultList items={answerItems as WinningAnswerResult[]} />}
        {!switchingActivity && <button type="button" disabled={!answerItems} className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { setActivityId(''); setGroupName(''); setSwitchingActivity(true); }}>{answerItems ? '加入新活動' : '載入結果後可加入新活動'}</button>}
        {switchingActivity && answerItems && <div className="mt-6 rounded-xl bg-white p-5 ring-1 ring-indigo-200"><p className="mb-4 text-sm text-slate-700">加入新活動後，將無法再以學生身分查看目前活動的結果。</p><form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-medium">新活動代碼<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={activityId} onChange={(event) => setActivityId(event.target.value)} maxLength={100} autoComplete="off" /></label>
          <label className="block text-sm font-medium">組別名稱<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} autoComplete="off" /></label>
          <div className="flex gap-3"><button className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy}>{busy ? '加入中…' : '加入新活動'}</button><button type="button" className="rounded-xl border border-slate-300 px-5 py-3 font-semibold" onClick={() => { setSwitchingActivity(false); setActivityId(activity.activityId); setGroupName(''); setError(''); }}>取消</button></div>
        </form></div>}
      </>}
    </div> : <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
      <label className="block text-sm font-medium">活動代碼<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={activityId} onChange={(event) => setActivityId(event.target.value)} maxLength={100} autoComplete="off" /></label>
      <label className="block text-sm font-medium">組別名稱<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} autoComplete="off" /></label>
      <button className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy}>{busy ? '加入中…' : '加入活動'}</button>
    </form>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
