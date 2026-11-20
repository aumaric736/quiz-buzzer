import type { TeacherReviewRecordsResponse } from '@quiz-buzzer/shared';

interface TeacherSubmissionReviewProps { review: TeacherReviewRecordsResponse }

export function TeacherSubmissionReview({ review }: TeacherSubmissionReviewProps) {
  return <section className="mt-6 rounded-2xl border border-slate-200 p-5" aria-label="完整作答紀錄">
    <h3 className="text-lg font-bold">完整作答紀錄</h3>
    <p className="mt-1 break-all font-mono text-xs text-slate-500">活動 {review.activityId}</p>
    <div className="mt-4 space-y-4">
      {review.questions.map((question) => <article key={question.questionNumber} className="rounded-xl bg-slate-50 p-4">
        <h4 className="font-semibold">第 {question.questionNumber} 題</h4>
        {question.unanswered ? <p className="mt-2 text-sm text-slate-600">無人作答</p> : <ol className="mt-2 space-y-2">
          {question.records.map((record) => <li key={record.groupId} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>順位 {record.submissionRank}：{record.groupName}</p>
              <span className={record.isWinner ? 'font-semibold text-emerald-700' : 'text-slate-500'}>{record.isWinner ? '搶答成功' : '未勝出'}</span>
            </div>
            <p className="mt-1 text-sm text-slate-700">答案：{record.answerParts.join(' / ')}</p>
          </li>)}
        </ol>}
      </article>)}
    </div>
  </section>;
}
