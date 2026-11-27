import { useState } from 'react';
import type { GuidedNotesExportPreview as Preview, GuidedNotesExportResult as Result, UserSession } from '@quiz-buzzer/shared';
import { createExportPreview, getExportResult, GuidedNotesExportApiError, retryExport } from '../services/export-preview-api.js';
import { buildExportPreviewActionRequest, canRegenerateExportPreview, toExportPreviewViewModels } from './export-preview-view-model.js';
import { GuidedNotesExportResult } from './GuidedNotesExportResult.js';

interface GuidedNotesExportPreviewProps {
  session: UserSession;
  activityId: string;
  onConfirm: (previewId: string) => Promise<Result>;
}

export function GuidedNotesExportPreview({ session, activityId, onConfirm }: GuidedNotesExportPreviewProps) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);

  async function retryPrevious() {
    if (!result) return;
    setBusy(true); setError('');
    try { setResult(await retryExport(session.sessionId, activityId, result.exportId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '安全重試失敗，請先檢查原講義。'); }
    finally { setBusy(false); }
  }

  async function loadPreview() {
    setError(''); setRecoveryAvailable(false); setPreview(null); setResult(null); setBusy(true);
    try { setPreview(await createExportPreview(session.sessionId, activityId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '建立匯出預覽失敗，請重試。'); }
    finally { setBusy(false); }
  }

  async function confirmPreview() {
    if (!preview) return;
    const request = buildExportPreviewActionRequest('confirm', preview.previewId);
    if (!request) return;
    setBusy(true); setError('');
    try { setResult(await onConfirm(request.previewId)); setPreview(null); }
    catch (reason) {
      if (reason instanceof GuidedNotesExportApiError && reason.code === 'EXPORT_OUTCOME_UNKNOWN' && reason.exportId) {
        try { setResult(await getExportResult(session.sessionId, activityId, reason.exportId)); setPreview(null); }
        catch (statusError) { setError(statusError instanceof Error ? statusError.message : reason.message); }
      } else {
        setError(reason instanceof Error ? reason.message : '確認匯出失敗，請重試。');
        setRecoveryAvailable(reason instanceof GuidedNotesExportApiError && canRegenerateExportPreview(reason.code));
      }
    }
    finally { setBusy(false); }
  }

  function cancelPreview() {
    if (!preview) return;
    buildExportPreviewActionRequest('cancel', preview.previewId);
    setPreview(null); setResult(null);
    setError('');
  }

  const items = preview ? toExportPreviewViewModels(preview.items) : [];
  const hasWritableItem = preview?.items.some((item) => item.status === 'ready') ?? false;

  return <section className="mt-6 w-full max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <p className="text-sm font-medium text-indigo-700">活動已結束後</p>
    <h3 className="mt-1 text-xl font-bold">檢查答案寫回預覽</h3>
    {!preview && <button type="button" className="mt-5 rounded-xl border border-indigo-300 px-4 py-2 font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50" disabled={busy} onClick={() => void loadPreview()}>{busy ? '準備中…' : '建立匯出預覽'}</button>}
    {preview && <>
      <p className="mt-3 text-sm text-slate-600">預覽有效至 {new Date(preview.expiresAt).toLocaleTimeString()}。確認前不會修改講義。</p>
      <ol className="mt-4 space-y-3">{items.map((item) => <li key={item.questionNumber} className="rounded-xl border border-slate-200 p-4">
        <p className="font-semibold">第 {item.questionNumber} 題 · {item.label}</p>
        {item.winningGroupName && <p className="mt-1 text-sm text-slate-700">成功組別：{item.winningGroupName}</p>}
        {item.answerParts.length > 0 && <p className="mt-1 text-sm text-slate-700">答案：{item.answerParts.join(' / ')}</p>}
        <p className="mt-1 text-sm text-slate-600">填答位置：{item.targetLabels.join('、') || '無'}</p>
        {item.occupiedTargetLabels.length > 0 && <p className="mt-1 text-sm font-medium text-red-700">已有內容，請清空：{item.occupiedTargetLabels.join('、')}</p>}
      </li>)}</ol>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50" disabled={busy} onClick={cancelPreview}>取消</button>
        <button type="button" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy || !hasWritableItem} onClick={() => void confirmPreview()}>{busy ? '處理中…' : '確認寫回'}</button>
      </div>
    </>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {recoveryAvailable && <button type="button" className="mt-3 rounded-xl border border-indigo-300 px-4 py-2 font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50" disabled={busy} onClick={() => void loadPreview()}>重新建立預覽</button>}
    {result && <GuidedNotesExportResult result={result} onRetry={() => void retryPrevious()} retrying={busy} />}
  </section>;
}
