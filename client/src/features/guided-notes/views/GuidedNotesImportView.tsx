import { useState, type FormEvent } from 'react';
import type { GuidedNotesImportResponse, GuidedNotesWorksheet, UserSession } from '@quiz-buzzer/shared';
import { discoverWorksheets, importWorksheet } from '../services/guided-notes-api.js';

interface GuidedNotesImportViewProps {
  session: UserSession;
  activityId: string;
  locked?: boolean;
}

export function GuidedNotesImportView({ session, activityId, locked = false }: GuidedNotesImportViewProps) {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [worksheets, setWorksheets] = useState<GuidedNotesWorksheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [imported, setImported] = useState<GuidedNotesImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function findWorksheets(event: FormEvent) {
    event.preventDefault();
    setError(''); setImported(null); setWorksheets([]); setSelectedSheetId('');
    if (!spreadsheetUrl.trim()) { setError('請貼上 Google Sheets 講義網址。'); return; }
    setBusy(true);
    try {
      const result = await discoverWorksheets(session.sessionId, activityId, spreadsheetUrl.trim());
      setSpreadsheetId(result.spreadsheetId);
      setWorksheets(result.worksheets);
      if (result.worksheets.length === 0) setError('這份文件沒有可選擇的工作表。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '讀取工作表失敗，請重試。'); }
    finally { setBusy(false); }
  }

  async function runImport() {
    setError(''); setImported(null);
    if (!/^(0|[1-9]\d*)$/.test(selectedSheetId)) { setError('請先選擇一個工作表。'); return; }
    setBusy(true);
    try {
      setImported(await importWorksheet(session.sessionId, activityId, { spreadsheetId, sheetId: Number(selectedSheetId) }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '匯入 Guided Notes 失敗，請重試。'); }
    finally { setBusy(false); }
  }

  return <section className="mt-6 w-full max-w-2xl rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
    <p className="text-sm font-medium text-indigo-700">題目來源</p>
    <h3 className="mt-1 text-xl font-bold">匯入 Guided Notes</h3>
    {locked && <p role="status" className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">開放加入後，學習單與題目清單已鎖定。</p>}
    <p className="mt-2 text-sm text-slate-600">請先將講義分享給伺服器設定的 Google Sheets 服務帳戶。系統只載入題號與填答位置，不會匯入題目敘述。</p>
    {!locked && <form className="mt-5 space-y-3" onSubmit={(event) => void findWorksheets(event)}>
      <label className="block text-sm font-medium">Google Sheets 網址
        <input className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" type="url" inputMode="url" autoComplete="off" maxLength={2048} value={spreadsheetUrl} onChange={(event) => setSpreadsheetUrl(event.target.value)} />
      </label>
      <button className="rounded-xl border border-indigo-300 px-4 py-2 font-semibold text-indigo-900 hover:bg-indigo-50 disabled:opacity-50" disabled={busy || !spreadsheetUrl.trim()}>{busy ? '讀取中…' : '讀取工作表'}</button>
    </form>}
    {!locked && worksheets.length > 0 && <div className="mt-5 space-y-3">
      <label className="block text-sm font-medium">選擇工作表
        <select className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3" value={selectedSheetId} onChange={(event) => setSelectedSheetId(event.target.value)}>
          <option value="">請選擇</option>
          {worksheets.map((sheet) => <option key={sheet.sheetId} value={sheet.sheetId}>{sheet.title}</option>)}
        </select>
      </label>
      <button type="button" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50" disabled={busy || !selectedSheetId} onClick={() => void runImport()}>{busy ? '匯入中…' : '匯入題號與填答位置'}</button>
    </div>}
    {imported && <div role="status" className="mt-5 rounded-2xl bg-emerald-50 p-5 text-emerald-950">
      <p className="font-semibold">已匯入 {imported.questions.length} 題</p>
      <ul className="mt-2 list-inside list-disc text-sm">{imported.questions.map((question) => <li key={question.questionNumber}>第 {question.questionNumber} 題：{question.blankCount} 個填答格</li>)}</ul>
    </div>}
    {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  </section>;
}
