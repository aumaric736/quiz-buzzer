import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { ActivitySnapshot, AnswerStatusResponse, GroupRecord, StudentOwnQuestionStatus, StudentTeamLiveSnapshot, UserSession, WinningAnswerResult } from '@quiz-buzzer/shared';
import { getActivity } from '../services/activity-api.js';
import { joinActivity } from '../services/group-api.js';
import { ActivityPhaseStatus } from '../components/ActivityPhaseStatus.js';
import { getAnswerStatus } from '../services/answer-access-api.js';
import { StudentAnswerView } from '../../buzzer-flow/views/StudentAnswerView.js';
import { QuestionResultList } from '../../buzzer-flow/components/QuestionResultList.js';
import { getPublishedFinalResults } from '../../buzzer-flow/services/buzzer-flow-api.js';
import { GroupPresenceStatus } from '../components/GroupPresenceStatus.js';
import type { ActivitySocketEvent } from '../services/activity-socket.js';
import { applyStudentAnswerEvent, applyStudentPresenceEvent } from '../services/live-activity-state.js';

function presenceFromGroup(group: GroupRecord): StudentTeamLiveSnapshot | null {
  if (!group.groupRole || group.onlineCount === undefined || group.occupiedCount === undefined) return null;
  return { activityId: group.activityId, groupId: group.groupId,
    groupLiveRevision: group.groupLiveRevision ?? 0, displayName: group.displayName, groupRole: group.groupRole,
    onlineCount: group.onlineCount, occupiedCount: group.occupiedCount, capacity: group.capacity ?? 2,
    acceptsMembers: group.acceptsMembers ?? false, answers: [] };
}

interface StudentJoinViewProps { session: UserSession; initialActivity?: ActivitySnapshot | null }

export function StudentJoinView({ session, initialActivity = null }: StudentJoinViewProps) {
  const [activityId, setActivityId] = useState(session.activityId ?? '');
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [joinMode, setJoinMode] = useState<'leader' | 'member'>('leader');
  const [group, setGroup] = useState<GroupRecord | null>(() => session.activityId && session.groupId ? {
    groupId: session.groupId, activityId: session.activityId, displayName: session.groupName ?? '已加入組別', inviteCode: session.groupInviteCode ?? undefined
  } : null);
  const [presence, setPresence] = useState<StudentTeamLiveSnapshot | null>(null);
  const [activity, setActivity] = useState<ActivitySnapshot | null>(initialActivity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answerItems, setAnswerItems] = useState<Array<StudentOwnQuestionStatus | WinningAnswerResult> | null>(null);
  const [resultsCode, setResultsCode] = useState('');
  const [publicResults, setPublicResults] = useState<WinningAnswerResult[] | null>(null);

  const refreshAnswerStatus = useCallback(async () => {
    if (!activity || !group || activity.phase === '準備中') return;
    try {
      const result: AnswerStatusResponse = activity.phase === '已結束'
        ? await getPublishedFinalResults(activity.activityId)
        : await getAnswerStatus(session.sessionId, activity.activityId);
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
    if (joinMode === 'leader' && !groupName.trim()) { setError('請輸入新組名。'); return; }
    if (joinMode === 'member' && !/^\d{6}$/.test(inviteCode)) { setError('請輸入六位數字小組邀請碼。'); return; }
    setBusy(true);
    try {
      const joined = await joinActivity(session.sessionId, activityId.trim(), joinMode === 'leader' ? { mode: 'leader', groupName } : { mode: 'member', inviteCode });
      const current = await getActivity(session.sessionId, joined.activityId);
      setGroup(joined);
      setPresence(presenceFromGroup(joined));
      setActivity(current);
      setAnswerItems(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '加入活動失敗，請重試。'); }
    finally { setBusy(false); }
  }

  async function loadPublicResults(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!resultsCode.trim()) { setError('請輸入活動加入碼。'); return; }
    setBusy(true);
    try { const result = await getPublishedFinalResults(resultsCode.trim()); setPublicResults(result.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '載入最終結果失敗。'); }
    finally { setBusy(false); }
  }

  return <section className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <p className="text-sm font-medium text-indigo-700">學生畫面</p><h2 className="mt-1 text-2xl font-bold">加入課堂活動</h2>
    {group && activity ? <div className="mt-7 rounded-2xl bg-indigo-50 p-6"><p className="text-sm text-indigo-800">組別</p><p className="mt-1 text-xl font-semibold">{group.displayName}</p>{group.inviteCode && <div className="mt-3 rounded-xl bg-white p-4"><p className="text-sm text-indigo-800">小組邀請碼</p><p className="font-mono text-2xl font-bold tracking-widest">{group.inviteCode}</p></div>}<p className="mt-5 text-sm text-indigo-800">目前階段</p><p aria-live="polite" className="mt-1 text-2xl font-bold">{activity.phase}</p>
      {presence && <GroupPresenceStatus snapshot={presence} />}
      <ActivityPhaseStatus sessionId={session.sessionId} activity={activity} groupId={group.groupId} onUpdate={setActivity}
        onReconnect={() => void refreshAnswerStatus()} onLiveEvent={(event: Exclude<ActivitySocketEvent, ActivitySnapshot>) => {
          if (event.type === 'team.presence.updated' && event.groupId === group.groupId) {
            const snapshot = applyStudentPresenceEvent(event);
            setPresence(snapshot);
            setAnswerItems(applyStudentAnswerEvent(null, event));
          }
          if (event.type === 'team.answer.updated' && event.groupId === group.groupId) {
            setAnswerItems((current) => applyStudentAnswerEvent(current?.filter((item): item is StudentOwnQuestionStatus => 'status' in item && item.status === 'submitted') ?? null, event));
          }
        }} />
      <StudentAnswerView sessionId={session.sessionId} groupId={group.groupId} activity={activity} submittedQuestionNumbers={answerItems?.flatMap((item) => 'status' in item && item.status === 'submitted' ? [item.questionNumber] : [])} submittedAnswers={answerItems?.flatMap((item) => 'status' in item && item.status === 'submitted' && item.answerParts ? [{ questionNumber: item.questionNumber, answerParts: item.answerParts }] : [])} />
      {activity.phase === '已結束' && answerItems && <QuestionResultList items={answerItems as WinningAnswerResult[]} />}
    </div> : <form className="mt-7 space-y-4" onSubmit={(event) => void submit(event)}>
      <label className="block text-sm font-medium">活動加入碼<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={activityId} onChange={(event) => setActivityId(event.target.value)} maxLength={100} autoComplete="off" /></label>
      {renderEnrollmentFields()}
      <button className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy}>{busy ? '加入中…' : '加入活動'}</button>
    </form>}
    {!group && <form className="mt-6 rounded-2xl border border-slate-200 p-5" onSubmit={(event) => void loadPublicResults(event)}>
      <h3 className="font-semibold">瀏覽已結束活動結果</h3>
      <p className="mt-1 text-sm text-slate-600">輸入活動加入碼即可唯讀查看，不會加入小組。</p>
      <label className="mt-3 block text-sm font-medium">活動加入碼<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={resultsCode} onChange={(event) => setResultsCode(event.target.value)} maxLength={100} autoComplete="off" /></label>
      <button className="mt-3 rounded-xl border border-indigo-300 px-5 py-3 font-semibold text-indigo-800 disabled:opacity-50" disabled={busy}>{busy ? '載入中…' : '查看最終結果'}</button>
      {publicResults && <QuestionResultList items={publicResults} />}
    </form>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;

  function renderEnrollmentFields() {
    return <div className="space-y-3">
      <fieldset className="space-y-2"><legend className="text-sm font-medium">選擇加入方式</legend>
        <label className="flex items-center gap-2"><input type="radio" name="joinMode" checked={joinMode === 'leader'} onChange={() => setJoinMode('leader')} />組長建組</label>
        <label className="flex items-center gap-2"><input type="radio" name="joinMode" checked={joinMode === 'member'} onChange={() => setJoinMode('member')} />加入既有組別</label>
      </fieldset>
      {joinMode === 'leader' ? <label className="block text-sm font-medium">新組名<input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} autoComplete="off" /></label>
        : <label className="block text-sm font-medium">六位數小組邀請碼<input inputMode="numeric" pattern="[0-9]{6}" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono tracking-widest" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} autoComplete="off" /></label>}
    </div>;
  }
}
