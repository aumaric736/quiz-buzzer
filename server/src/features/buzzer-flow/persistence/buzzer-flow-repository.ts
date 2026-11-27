import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { HttpError } from '../../../api/validation.js';
import { requireActiveSession } from '../../user-stage-sync/application/session-service.js';

export interface AcceptedAnswerSubmission {
  acceptedOrder: number;
  acceptedAt: string;
  activityId: string;
  questionNumber: number;
  groupId: string;
  groupName: string;
  answerParts: string[];
  isWinner: boolean;
  submissionRank?: number;
  isReplay?: boolean;
}

export interface AcceptAnswerInput {
  sessionId: string;
  activityId: string;
  questionNumber: number;
  answerParts: string[];
  receiptSequence?: number;
}

function invalidAnswer(message: string): HttpError {
  return new HttpError(400, 'INVALID_ANSWER', message);
}

function rejectDuplicateSubmission(): never {
  throw new HttpError(409, 'DUPLICATE_SUBMISSION', '你們組別已提交此題，第一次受理的答案不會被覆寫。');
}

export function acceptAnswerSubmission(db: SqliteDatabase, input: AcceptAnswerInput): AcceptedAnswerSubmission {
  requireActiveSession(db, input.sessionId);
  const accept = db.transaction(() => {
    const session = db.prepare('SELECT role, activity_id AS activityId, group_id AS groupId FROM user_sessions WHERE id = ?')
      .get(input.sessionId) as { role: string; activityId: string | null; groupId: string | null } | undefined;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
    if (session.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', '只有學生組別可以提交答案。');

    const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(input.activityId) as { phase: string } | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
    if (!session.groupId || session.activityId !== input.activityId) {
      throw new HttpError(403, 'ACTIVITY_MEMBERSHIP_REQUIRED', '請先加入此活動的學生組別再作答。');
    }
    const group = db.prepare('SELECT id, display_name AS displayName FROM groups WHERE id = ? AND activity_id = ?')
      .get(session.groupId, input.activityId) as { id: string; displayName: string } | undefined;
    if (!group) throw new HttpError(403, 'ACTIVITY_MEMBERSHIP_REQUIRED', '請先加入此活動的學生組別再作答。');
    if (activity.phase !== '搶答進行中') {
      throw new HttpError(409, 'BUZZER_NOT_OPEN', '目前不是搶答進行中，只有活動開放時才能提交答案。');
    }

    const question = db.prepare(`SELECT q.question_number AS questionNumber, COUNT(m.slot_order) AS blankCount,
        MIN(m.slot_order) AS firstSlot, MAX(m.slot_order) AS lastSlot
      FROM activity_questions q
      LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
      LEFT JOIN guided_notes_blank_mappings m
        ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
      WHERE q.activity_id = ? AND q.question_number = ?
      GROUP BY q.question_number`).get(input.activityId, input.questionNumber) as {
        questionNumber: number; blankCount: number; firstSlot: number | null; lastSlot: number | null
      } | undefined;
    if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', '找不到這題，請重新載入活動題目。');
    if (question.blankCount < 1 || question.firstSlot !== 0 || question.lastSlot !== question.blankCount - 1) {
      throw new HttpError(409, 'QUESTION_MAPPINGS_INVALID', '此題填空資料不完整，請通知老師重新確認 Guided Notes。');
    }
    if (input.answerParts.length !== question.blankCount) {
      throw invalidAnswer(`第 ${input.questionNumber} 題有 ${question.blankCount} 個填空，請逐格填寫後再提交。`);
    }
    const answerParts = input.answerParts.map((part) => {
      if (typeof part !== 'string' || part.trim().length === 0) {
        throw invalidAnswer('每個填空都必須輸入非空白答案。');
      }
      if (part.trim().length > 1000) throw invalidAnswer('每個答案片段不可超過 1000 個字元。');
      return part;
    });

    const duplicate = db.prepare(`SELECT accepted_order AS acceptedOrder, accepted_at AS acceptedAt,
        answer_parts_json AS answerPartsJson, is_winner AS isWinner
      FROM buzzer_submissions
      WHERE activity_id = ? AND question_number = ? AND group_id = ?`)
      .get(input.activityId, input.questionNumber, group.id);
    if (duplicate) {
      const prior = duplicate as { acceptedOrder: number; acceptedAt: string; answerPartsJson: string; isWinner: number };
      const priorParts = JSON.parse(prior.answerPartsJson) as string[];
      if (JSON.stringify(priorParts) !== JSON.stringify(input.answerParts)) rejectDuplicateSubmission();
      return { acceptedOrder: prior.acceptedOrder, acceptedAt: prior.acceptedAt, activityId: input.activityId,
        questionNumber: input.questionNumber, groupId: group.id, groupName: group.displayName, answerParts: priorParts,
        isWinner: prior.isWinner === 1, isReplay: true };
    }

    const rankRow = db.prepare(`SELECT COALESCE(MAX(submission_rank), 0) AS maxRank,
        COALESCE(MAX(is_winner), 0) AS hasWinner
      FROM buzzer_submissions WHERE activity_id = ? AND question_number = ?`)
      .get(input.activityId, input.questionNumber) as { maxRank: number; hasWinner: number };
    const submissionRank = rankRow.maxRank + 1;
    const isWinner = rankRow.hasWinner === 0;

    const acceptedAt = new Date().toISOString();
    const result = db.prepare(`INSERT INTO buzzer_submissions
      (activity_id, question_number, group_id, answer_parts_json, accepted_at, submission_rank, is_winner, receipt_sequence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.activityId, input.questionNumber, group.id, JSON.stringify(input.answerParts), acceptedAt, submissionRank, isWinner ? 1 : 0, input.receiptSequence ?? null);
    db.prepare('UPDATE groups SET live_revision = live_revision + 1 WHERE id = ?').run(group.id);
    db.prepare('UPDATE activities SET live_revision = live_revision + 1 WHERE id = ?').run(input.activityId);
    return {
      acceptedOrder: Number(result.lastInsertRowid), acceptedAt,
      activityId: input.activityId, questionNumber: input.questionNumber,
      groupId: group.id, groupName: group.displayName, answerParts: input.answerParts, isWinner, submissionRank
    };
  });

  try { return accept.immediate(); }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: buzzer_submissions.activity_id, buzzer_submissions.question_number, buzzer_submissions.group_id')) {
      rejectDuplicateSubmission();
    }
    throw error;
  }
}
