import { useState } from 'react';

export function ActivityJoinCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  }
  return <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
    <div><p className="text-sm text-slate-500">活動加入碼</p><p className="mt-1 break-all font-mono text-sm font-semibold">{code}</p></div>
    <button type="button" onClick={() => void copy()} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-white">{copied ? '已複製' : '複製'}</button>
  </div>;
}
