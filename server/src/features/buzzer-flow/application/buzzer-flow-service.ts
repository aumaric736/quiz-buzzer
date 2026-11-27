import type { AnswerSubmissionRequest } from '@quiz-buzzer/shared';
import { HttpError, isRecord } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { acceptAnswerSubmission } from '../persistence/buzzer-flow-repository.js';

export { type AcceptedAnswerSubmission } from '../persistence/buzzer-flow-repository.js';

export function validateAnswerSubmission(input: unknown): AnswerSubmissionRequest {
  if (!isRecord(input) || Object.keys(input).length !== 2 || !('questionNumber' in input) || !('answerParts' in input)) {
    throw new HttpError(400, 'INVALID_ANSWER', '請提供題號與依填空順序排列的答案片段。');
  }
  if (!Number.isSafeInteger(input.questionNumber) || (input.questionNumber as number) < 1) {
    throw new HttpError(400, 'INVALID_ANSWER', '題號必須是正整數。');
  }
  if (!Array.isArray(input.answerParts) || input.answerParts.some((part) => typeof part !== 'string')) {
    throw new HttpError(400, 'INVALID_ANSWER', '答案必須依填空順序以文字逐格提供。');
  }
  return { questionNumber: input.questionNumber as number, answerParts: input.answerParts as string[] };
}

export function submitAnswer(db: SqliteDatabase, sessionId: string, activityId: string, input: unknown, receiptSequence?: number) {
  const request = validateAnswerSubmission(input);
  return acceptAnswerSubmission(db, { sessionId, activityId, ...request, receiptSequence });
}
