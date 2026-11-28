import { useState } from 'react';
import type { TeacherQuestionProgress } from '@quiz-buzzer/shared';

interface QuestionAnswerProgressProps { questions: TeacherQuestionProgress[] }

export function QuestionAnswerProgress({ questions }: QuestionAnswerProgressProps) {
  const ordered = [...questions].sort((left, right) => left.displayOrder - right.displayOrder);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  if (ordered.length === 0) return <section className="mt-6 rounded-2xl border border-slate-200 p-5"><h3 className="font-semibold">各題作答進度</h3><p className="mt-2 text-sm text-slate-600">尚無可檢視的題目。</p></section>;
  const selected = ordered.find((question) => question.questionNumber === selectedNumber) ?? ordered[0]!;
  return <section className="mt-6 rounded-2xl border border-slate-200 p-5" aria-label="各題作答進度">
    <h3 className="text-lg font-semibold">各題作答進度</h3>
    <div className="mt-3 flex flex-wrap gap-2" aria-label="選擇題目">
      {ordered.map((question) => <button key={question.questionNumber} type="button"
        aria-pressed={selected.questionNumber === question.questionNumber}
        className={`rounded-lg border px-3 py-2 text-left text-sm ${selected.questionNumber === question.questionNumber ? 'border-indigo-500 bg-indigo-50 text-indigo-950' : 'border-slate-300 text-slate-700'}`}
        onClick={() => setSelectedNumber(question.questionNumber)}>
        <span className="block font-medium">第 {question.questionNumber} 題</span>
        <span className="block">{question.answeredGroupCount} / {question.totalGroupCount} 組已作答</span>
      </button>)}
    </div>
    <div className="mt-3">
      <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-900" aria-live="polite">
        第 {selected.questionNumber} 題：{selected.answeredGroupCount} / {selected.totalGroupCount} 組已作答
      </p>
    </div>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <div><h4 className="font-semibold">已作答（{selected.answeredGroupCount}）</h4>
        {selected.answeredGroups.length ? <ul className="mt-2 space-y-2">{selected.answeredGroups.map((group) => <li key={group.groupId} className="rounded-xl bg-emerald-50 p-3">
          <div className="flex items-center justify-between gap-3"><span className="font-medium">{group.groupName}</span><span className="text-sm text-emerald-800">第 {group.submissionRank} 順位</span></div>
          <ol className="mt-2 list-decimal pl-5 text-sm">{group.answerParts.map((part, index) => <li key={index}>{part}</li>)}</ol>
        </li>)}</ul> : <p className="mt-2 text-sm text-slate-500">尚無組別作答。</p>}
      </div>
      <div><h4 className="font-semibold">未作答（{selected.unansweredGroups.length}）</h4>
        {selected.unansweredGroups.length ? <ul className="mt-2 space-y-2">{selected.unansweredGroups.map((group) => <li key={group.groupId} className="rounded-xl bg-slate-50 p-3">{group.groupName}</li>)}</ul>
          : <p className="mt-2 text-sm text-slate-500">所有組別均已作答。</p>}
      </div>
    </div>
  </section>;
}
