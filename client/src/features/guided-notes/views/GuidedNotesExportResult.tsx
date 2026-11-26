import type { GuidedNotesExportResult as Result } from '@quiz-buzzer/shared';

interface GuidedNotesExportResultProps { result: Result }

export function GuidedNotesExportResult({ result, onRetry, retrying = false }: GuidedNotesExportResultProps & { onRetry?: () => void; retrying?: boolean }) {
  const statusLabel = result.status === 'completed' ? '匯出結果已確認'
    : result.status === 'unknown' ? '寫回結果尚未確認'
      : result.status === 'failed' ? '部分或全部題目未寫回'
        : '匯出仍在處理中';
  return <section role="status" className={`mt-5 rounded-2xl p-5 ${result.status === 'completed' ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'}`}>
    <h4 className="font-semibold">{statusLabel}</h4>
    {result.status === 'unknown' && <p className="mt-2 text-sm">請檢查原講義的填答格後再建立新預覽；系統不會自動重送可能已完成的寫入。</p>}
    <ul className="mt-3 space-y-1 text-sm">
      <li>已寫回：{result.writtenQuestionNumbers.length ? result.writtenQuestionNumbers.join('、') : '無'}</li>
      <li>維持原狀：{result.unchangedQuestionNumbers.length ? result.unchangedQuestionNumbers.join('、') : '無'}</li>
      <li>略過或失敗：{result.failedQuestionNumbers.length ? result.failedQuestionNumbers.join('、') : '無'}</li>
    </ul>
    <p className="mt-3 break-all font-mono text-xs">匯出編號：{result.exportId}</p>
    {onRetry && ['unknown', 'failed', 'pending'].includes(result.status) && <button type="button" disabled={retrying} onClick={onRetry} className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{retrying ? '重新檢查並寫回中…' : '重新檢查講義並安全重試'}</button>}
  </section>;
}
