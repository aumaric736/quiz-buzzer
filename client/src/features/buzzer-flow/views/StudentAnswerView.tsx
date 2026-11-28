import { useEffect, useState } from 'react';
import type { ActivitySnapshot, BuzzerQuestionPrompt } from '@quiz-buzzer/shared';
import { AnswerQuestionForm } from '../components/AnswerQuestionForm.js';
import { getBuzzerQuestions } from '../services/buzzer-flow-api.js';

interface StudentAnswerViewProps {
  sessionId: string;
  groupId: string;
  activity: ActivitySnapshot;
  submittedQuestionNumbers?: number[];
  submittedAnswers?: Array<{ questionNumber: number; answerParts: string[] }>;
}

export function StudentAnswerView({ sessionId, groupId, activity, submittedQuestionNumbers = [], submittedAnswers = [] }: StudentAnswerViewProps) {
  const [questions, setQuestions] = useState<BuzzerQuestionPrompt[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void getBuzzerQuestions(sessionId, activity.activityId)
      .then((result) => { if (active) { setQuestions(result.questions); setError(''); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '無法載入活動題目。'); });
    return () => { active = false; };
  }, [sessionId, activity.activityId]);

  return <section className="mt-6 space-y-4" aria-label="活動題目">
    <h3 className="text-xl font-bold">搶答題目</h3>
    {activity.phase === '準備中' && <p className="text-sm text-slate-600">老師開始搶答後即可提交。活動會持續進行，直到老師手動結束。</p>}
    {activity.phase === '已結束' && <p className="text-sm text-slate-600">搶答已結束，不能再提交答案。</p>}
    {!questions && !error && <p role="status" className="text-sm text-slate-600">正在載入題目…</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {questions?.length === 0 && <p className="text-sm text-slate-600">老師尚未匯入題目。</p>}
    {questions?.map((question) => <AnswerQuestionForm key={question.questionNumber} sessionId={sessionId} activityId={activity.activityId} groupId={groupId} phase={activity.phase} question={question} alreadySubmitted={submittedQuestionNumbers.includes(question.questionNumber)} submittedAnswerParts={submittedAnswers.find((item) => item.questionNumber === question.questionNumber)?.answerParts} />)}
  </section>;
}
