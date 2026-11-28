import { useCallback, useEffect, useState } from 'react';
import type { ActivityPhase, ActivitySnapshot, AnswerStatusResponse, BuzzerQuestionUpdatedEvent, LiveGroupRosterRecord, TeacherQuestionProgress, TeacherQuestionStatus, TeacherReviewRecordsResponse, UserSession, WinningAnswerResult } from '@quiz-buzzer/shared';
import { changeActivityPhase, createActivity, getTeacherActivityProgress, openActivityJoining } from '../services/activity-api.js';
import { ActivityPhaseStatus } from '../components/ActivityPhaseStatus.js';
import { GuidedNotesImportView } from '../../guided-notes/views/GuidedNotesImportView.js';
import { GuidedNotesExportPreview } from '../../guided-notes/views/GuidedNotesExportPreview.js';
import { confirmExport } from '../../guided-notes/services/export-preview-api.js';
import { getAnswerStatus } from '../services/answer-access-api.js';
import { QuestionResultList } from '../../buzzer-flow/components/QuestionResultList.js';
import { QuestionAnswerProgress } from '../../buzzer-flow/components/QuestionAnswerProgress.js';
import { getTeacherReviewRecords } from '../../results-review/services/results-review-api.js';
import { TeacherActivityHistory } from '../../results-review/components/TeacherActivityHistory.js';
import { TeacherSubmissionReview } from '../../results-review/components/TeacherSubmissionReview.js';
import { ActivityJoinCode } from '../components/ActivityJoinCode.js';
import { TeacherGroupRoster } from '../components/TeacherGroupRoster.js';
import { applyTeacherLiveEvent, applyTeacherQuestionProgress } from '../services/live-activity-state.js';

interface TeacherActivityViewProps { session: UserSession; initialActivity?: ActivitySnapshot | null }

const nextPhase: Partial<Record<ActivityPhase, ActivityPhase>> = { '搶答進行中': '已結束' };

export function TeacherActivityView({ session, initialActivity = null }: TeacherActivityViewProps) {
  const [activity, setActivity] = useState<ActivitySnapshot | null>(initialActivity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answerItems, setAnswerItems] = useState<Array<TeacherQuestionStatus | WinningAnswerResult>>([]);
  const [teacherProgress, setTeacherProgress] = useState<TeacherQuestionProgress[]>([]);
  const [liveGroups, setLiveGroups] = useState<LiveGroupRosterRecord[] | null>(null);
  const [selectedReviewActivityId, setSelectedReviewActivityId] = useState<string | null>(null);
  const [review, setReview] = useState<TeacherReviewRecordsResponse | null>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [reviewBusy, setReviewBusy] = useState(false);

  const refreshAnswerStatus = useCallback(async () => {
    if (!activity || activity.phase === '準備中') return;
    try {
      if (activity.phase === '搶答進行中') {
        const progress = await getTeacherActivityProgress(session.sessionId, activity.activityId);
        setTeacherProgress(progress.questions);
        return;
      }
      const status: AnswerStatusResponse = await getAnswerStatus(session.sessionId, activity.activityId);
      if (status.phase !== '準備中') {
        setAnswerItems(status.items as Array<TeacherQuestionStatus | WinningAnswerResult>);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '讀取作答狀況失敗。'); }
  }, [activity?.activityId, activity?.phase, session.sessionId]);

  useEffect(() => { void refreshAnswerStatus(); }, [refreshAnswerStatus]);

  function handleBuzzerUpdate(_event: BuzzerQuestionUpdatedEvent) { void refreshAnswerStatus(); }
  function handleLiveEvent(event: Exclude<import('../services/activity-socket.js').ActivitySocketEvent, ActivitySnapshot | BuzzerQuestionUpdatedEvent>) {
    if (event.type === 'activity.roster.updated' && event.activityId === activity?.activityId) {
      setLiveGroups((current) => applyTeacherLiveEvent(current, event));
    } else if (event.type === 'activity.team-answer.updated' && event.activityId === activity?.activityId) {
      setLiveGroups((current) => applyTeacherLiveEvent(current, event));
      setTeacherProgress((current) => applyTeacherQuestionProgress(current, event.questionProgress));
    }
  }

  async function openReview(activityId: string) {
    setSelectedReviewActivityId(activityId);
    setReview(null);
    setReviewBusy(true);
    setError('');
    try { setReview(await getTeacherReviewRecords(session.sessionId, activityId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '讀取檢討紀錄失敗，請重試。'); }
    finally { setReviewBusy(false); }
  }

  async function createNewActivity() {
    setBusy(true);
    setError('');
    try {
      const created = await createActivity(session.sessionId);
      setActivity(created);
      setAnswerItems([]);
      setLiveGroups(null);
      setTeacherProgress([]);
      setSelectedReviewActivityId(null);
      setReview(null);
      setHistoryRefreshToken((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '建立活動失敗，請重試。'); }
    finally { setBusy(false); }
  }

  async function run(operation: () => Promise<ActivitySnapshot>) {
    setBusy(true);
    setError('');
    try { setActivity(await operation()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '活動操作失敗，請重試。'); }
    finally { setBusy(false); }
  }

  return <section className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-sm font-medium text-indigo-700">老師控制台</p><h2 className="mt-1 text-2xl font-bold">活動階段</h2></div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">本機模擬</span>
    </div>
    {!activity ? <div className="mt-8"><p className="text-slate-600">建立活動後，學生即可在準備階段加入組別。</p><button className="mt-4 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy} onClick={() => void createNewActivity()}>{busy ? '建立中…' : '建立活動'}</button></div> : <div className="mt-8">
      <ActivityJoinCode code={activity.activityId} />
      <TeacherGroupRoster sessionId={session.sessionId} activityId={activity.activityId} liveGroups={liveGroups} />
      <div className="mt-5 rounded-2xl bg-indigo-50 p-6"><p className="text-sm text-indigo-800">目前階段</p><p aria-live="polite" className="mt-1 text-3xl font-bold text-indigo-950">{activity.phase}</p></div>
      <ActivityPhaseStatus sessionId={session.sessionId} activity={activity} onUpdate={setActivity} onReconnect={() => void refreshAnswerStatus()} onBuzzerUpdate={handleBuzzerUpdate} onLiveEvent={handleLiveEvent} />
      <p className="mt-3 text-sm text-slate-600">搶答不設倒數，會持續進行直到老師手動結束。</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {activity.phase === '準備中' ? <>
          <button type="button" className="rounded-xl border border-indigo-300 px-5 py-3 font-semibold text-indigo-800 disabled:opacity-50" disabled={busy || Boolean(activity.joiningOpenedAt)} onClick={() => void run(() => openActivityJoining(session.sessionId, activity.activityId))}>開始加入</button>
          <button type="button" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy || !activity.joiningOpenedAt} onClick={() => void run(() => changeActivityPhase(session.sessionId, activity.activityId, '搶答進行中'))}>開始答題</button>
        </> : <button type="button" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy || activity.phase !== '搶答進行中'} onClick={() => {
          const phase = nextPhase[activity.phase];
          if (phase) void run(() => changeActivityPhase(session.sessionId, activity.activityId, phase));
        }}>{busy ? '更新中…' : '結束答題'}</button>}
      </div>
      <GuidedNotesImportView session={session} activityId={activity.activityId} locked={activity.phase !== '準備中' || Boolean(activity.joiningOpenedAt)} />
      {activity.phase === '搶答進行中' && <QuestionAnswerProgress questions={teacherProgress} />}
      {activity.phase === '已結束' && <QuestionResultList items={answerItems} />}
      {activity.phase === '已結束' && <GuidedNotesExportPreview session={session} activityId={activity.activityId} onConfirm={(previewId) => confirmExport(session.sessionId, activity.activityId, previewId)} />}
      {activity.phase === '已結束' && <button type="button" className="mt-5 rounded-xl border border-indigo-300 px-5 py-3 font-semibold text-indigo-800 disabled:opacity-50" disabled={busy} onClick={() => void createNewActivity()}>{busy ? '建立中…' : '建立新活動'}</button>}
    </div>}
    <TeacherActivityHistory sessionId={session.sessionId} selectedActivityId={selectedReviewActivityId} refreshToken={historyRefreshToken} onOpen={(activityId) => void openReview(activityId)} />
    {reviewBusy && <p role="status" className="mt-4 text-sm text-slate-600">正在載入檢討紀錄…</p>}
    {review && <TeacherSubmissionReview review={review} />}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
