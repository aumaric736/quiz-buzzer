import type { TeacherQuestionStatus, WinningAnswerResult } from '@quiz-buzzer/shared';

type QuestionResult = TeacherQuestionStatus | WinningAnswerResult;

interface QuestionResultListProps { items: QuestionResult[] }

export function QuestionResultList({ items }: QuestionResultListProps) {
  if (items.length === 0) return <p className="mt-4 text-sm text-slate-600">目前沒有可檢視的作答狀況。</p>;
  return <section className="mt-6 space-y-3" aria-label="各題作答狀況">
    <h3 className="text-xl font-bold">各題作答狀況</h3>
    <ol className="space-y-3">
      {items.map((item) => {
        const ended = 'winner' in item;
        const won = ended ? item.winner : item.status === 'won';
        const groupName = ended ? item.winner && item.winningGroupName : item.status === 'won' ? item.groupName : null;
        const answerParts = ended ? item.winner ? item.answerParts : [] : item.status === 'won' ? item.answerParts : [];
        return <li key={item.questionNumber} className="rounded-xl border border-slate-200 p-4">
          <p className="font-semibold">第 {item.questionNumber} 題</p>
          {won ? <><p className="mt-1 text-sm">成功組別：{groupName}</p><p className="mt-1 text-sm text-slate-700">答案：{answerParts.join(' / ')}</p></>
            : <p className="mt-1 text-sm text-slate-600">{ended ? '無勝出組別' : '等待作答'}</p>}
          {!ended && item.status === 'won' && item.submissions.length > 1 && <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">{item.submissions.map((submission) => <li key={submission.groupId}>第 {submission.submissionRank} 順位：{submission.groupName} — {submission.answerParts.join(' / ')}{submission.isWinner ? '（勝出）' : ''}</li>)}</ul>}
        </li>;
      })}
    </ol>
  </section>;
}
