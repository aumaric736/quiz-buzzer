import { useEffect, useState, type FormEvent } from 'react';
import type { ActivityPhase, BuzzerQuestionPrompt } from '@quiz-buzzer/shared';
import { submitBuzzerAnswer } from '../services/buzzer-flow-api.js';
import { getQuestionDraft, removeQuestionDraft, saveQuestionDraft } from '../services/question-draft-store.js';

interface AnswerQuestionFormProps {
  sessionId: string;
  activityId: string;
  groupId: string;
  phase: ActivityPhase;
  question: BuzzerQuestionPrompt;
  alreadySubmitted?: boolean;
  submittedAnswerParts?: string[];
}

export function AnswerQuestionForm({ sessionId, activityId, groupId, phase, question, alreadySubmitted = false, submittedAnswerParts = [] }: AnswerQuestionFormProps) {
  const [answerParts, setAnswerParts] = useState<string[]>(() => {
    const saved = getQuestionDraft(activityId, groupId, question.questionNumber);
    return saved?.length === question.blankCount ? saved : Array.from({ length: question.blankCount }, () => '');
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [error, setError] = useState('');

  useEffect(() => {
    if (alreadySubmitted) {
      setSubmitted(true);
      removeQuestionDraft(activityId, groupId, question.questionNumber);
    }
  }, [activityId, alreadySubmitted, groupId, question.questionNumber]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (phase !== '搶答進行中') {
      setError('目前不是搶答進行中，只有活動開放時才能提交答案。');
      return;
    }
    if (answerParts.some((part) => !part.trim())) {
      setError('請填寫本題的每一個空格後再提交。');
      return;
    }
    setSubmitting(true);
    try {
      await submitBuzzerAnswer(sessionId, activityId, { questionNumber: question.questionNumber, answerParts });
      setSubmitted(true);
      removeQuestionDraft(activityId, groupId, question.questionNumber);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '答案提交失敗，請稍後重試。');
    } finally { setSubmitting(false); }
  }

  return <form className="rounded-2xl border border-slate-200 p-5" onSubmit={(event) => void submit(event)}>
    <h3 className="text-lg font-semibold">第 {question.questionNumber} 題</h3>
    {submitted && submittedAnswerParts.length > 0 && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">本組已提交：{submittedAnswerParts.join('／')}</p>}
    <div className="mt-4 space-y-3">
      {answerParts.map((part, index) => <label key={`${question.questionNumber}-${index}`} className="block text-sm font-medium text-slate-700">
        填空 {index + 1}
        <input
          className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3"
          value={part}
          maxLength={1000}
          autoComplete="off"
          disabled={phase !== '搶答進行中' || submitted || submitting}
          onChange={(event) => setAnswerParts((current) => {
            const next = current.map((value, partIndex) => partIndex === index ? event.target.value : value);
            saveQuestionDraft(activityId, groupId, question.questionNumber, next);
            return next;
          })}
        />
      </label>)}
    </div>
    <button type="submit" disabled={phase !== '搶答進行中' || submitted || submitting}
      className="mt-4 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
      {submitted ? '已提交' : submitting ? '提交中…' : '提交答案'}
    </button>
    {submitted && <p role="status" className="mt-3 text-sm text-emerald-800">答案已受理。活動結束後才能查看完整結果。</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
  </form>;
}
