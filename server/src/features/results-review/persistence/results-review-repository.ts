import type { TeacherActivityListResponse, TeacherReviewQuestion, TeacherReviewRecordsResponse } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';

interface QuestionRow {
  questionNumber: number;
  blankCount: number;
  firstSlot: number | null;
  lastSlot: number | null;
}

interface SubmissionRow {
  submissionRank: number;
  groupId: string;
  groupName: string;
  answerPartsJson: string;
  isWinner: number;
}

function invalidRecords(): never {
  throw new HttpError(409, 'REVIEW_RECORDS_INVALID', '已保存的作答紀錄或順位不一致，無法提供檢討資料。');
}

export function listOwnedActivities(db: SqliteDatabase, ownerSessionId: string): TeacherActivityListResponse {
  const activities = db.prepare(`SELECT id AS activityId, phase, created_at AS createdAt
    FROM activities WHERE created_by_session_id = ?
    ORDER BY created_at DESC, id DESC`).all(ownerSessionId) as TeacherActivityListResponse['activities'];
  return { activities };
}

export function loadReviewRecords(db: SqliteDatabase, activityId: string): TeacherReviewRecordsResponse {
  const questionRows = db.prepare(`SELECT q.question_number AS questionNumber, COUNT(m.slot_order) AS blankCount,
      MIN(m.slot_order) AS firstSlot, MAX(m.slot_order) AS lastSlot
    FROM activity_questions q
    LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
    LEFT JOIN guided_notes_blank_mappings m
      ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
    WHERE q.activity_id = ?
    GROUP BY q.question_number ORDER BY q.question_number`).all(activityId) as QuestionRow[];
  if (questionRows.length === 0 || questionRows.some((question) => question.blankCount < 1
    || question.firstSlot !== 0 || question.lastSlot !== question.blankCount - 1)) invalidRecords();

  const selectSubmissions = db.prepare(`SELECT b.submission_rank AS submissionRank, b.group_id AS groupId,
      g.display_name AS groupName, b.answer_parts_json AS answerPartsJson, b.is_winner AS isWinner
    FROM buzzer_submissions b
    LEFT JOIN groups g ON g.id = b.group_id AND g.activity_id = b.activity_id
    WHERE b.activity_id = ? AND b.question_number = ?
    ORDER BY b.submission_rank`);

  const questions: TeacherReviewQuestion[] = questionRows.map((question) => {
    const rows = selectSubmissions.all(activityId, question.questionNumber) as SubmissionRow[];
    const records = rows.map((row, index) => {
      if (row.submissionRank !== index + 1 || !row.groupId || !row.groupName
        || row.isWinner !== (index === 0 ? 1 : 0)) invalidRecords();
      let parsed: unknown;
      try { parsed = JSON.parse(row.answerPartsJson); } catch { invalidRecords(); }
      if (!Array.isArray(parsed) || parsed.length !== question.blankCount
        || parsed.some((part) => typeof part !== 'string' || part.trim().length === 0 || part.length > 1000)) invalidRecords();
      return {
        submissionRank: row.submissionRank,
        groupId: row.groupId,
        groupName: row.groupName,
        answerParts: (parsed as string[]).map((part) => part.trim()),
        isWinner: row.isWinner === 1
      };
    });
    return { questionNumber: question.questionNumber, unanswered: records.length === 0, records };
  });
  return { activityId, phase: '已結束', questions };
}
