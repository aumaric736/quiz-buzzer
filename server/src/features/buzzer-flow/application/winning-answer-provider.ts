import type { WinningAnswerProvider, WinningAnswerResult } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';

interface ResultRow {
  questionNumber: number;
  displayOrder: number;
  blankCount: number;
  firstSlot: number | null;
  lastSlot: number | null;
  submissionCount: number;
  submissionRank: number | null;
  groupId: string | null;
  groupName: string | null;
  answerPartsJson: string | null;
}

export function loadEndedAnswerResults(db: SqliteDatabase, activityId: string): WinningAnswerResult[] {
  const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId) as { phase: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.phase !== '已結束') throw new HttpError(409, 'BUZZER_NOT_ENDED', '活動結束後才能讀取完整答案結果。');

  const rows = db.prepare(`SELECT q.question_number AS questionNumber, q.display_order AS displayOrder, COUNT(DISTINCT m.slot_order) AS blankCount,
      MIN(m.slot_order) AS firstSlot, MAX(m.slot_order) AS lastSlot,
      COUNT(DISTINCT attempts.accepted_order) AS submissionCount,
      b.submission_rank AS submissionRank,
      b.group_id AS groupId, g.display_name AS groupName, b.answer_parts_json AS answerPartsJson
    FROM activity_questions q
    LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
    LEFT JOIN guided_notes_blank_mappings m
      ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
    LEFT JOIN buzzer_submissions attempts ON attempts.activity_id = q.activity_id AND attempts.question_number = q.question_number
    LEFT JOIN buzzer_submissions b ON b.activity_id = q.activity_id AND b.question_number = q.question_number AND b.is_winner = 1
    LEFT JOIN groups g ON g.id = b.group_id AND g.activity_id = b.activity_id
    WHERE q.activity_id = ?
    GROUP BY q.question_number, b.group_id, g.display_name, b.answer_parts_json
    ORDER BY q.display_order`).all(activityId) as ResultRow[];
  if (rows.length === 0) throw new HttpError(409, 'ANSWER_RESULT_INVALID', '活動沒有可供結果查詢的 Guided Notes 題目。');

  const results: WinningAnswerResult[] = [];
  let lastDisplayOrder = -1;
  for (const row of rows) {
    if (row.displayOrder <= lastDisplayOrder || row.blankCount < 1 || row.firstSlot !== 0 || row.lastSlot !== row.blankCount - 1) {
      throw new HttpError(409, 'ANSWER_RESULT_INVALID', '已保存的題目或填空資料不完整，無法提供最終結果。');
    }
    lastDisplayOrder = row.displayOrder;
    if (row.groupId === null) {
      if (row.submissionCount > 0 || row.groupName !== null || row.answerPartsJson !== null) {
        throw new HttpError(409, 'ANSWER_RESULT_INVALID', '已保存的答案結果資料不一致，無法提供最終結果。');
      }
      results.push({ questionNumber: row.questionNumber, winner: false });
      continue;
    }
    if (!row.groupName || row.answerPartsJson === null || row.submissionRank !== 1) {
      throw new HttpError(409, 'ANSWER_RESULT_INVALID', '已保存的勝出組別資料不完整，無法提供最終結果。');
    }
    let value: unknown;
    try { value = JSON.parse(row.answerPartsJson); }
    catch { throw new HttpError(409, 'ANSWER_RESULT_INVALID', '已保存的答案格式無效，無法提供最終結果。'); }
    if (!Array.isArray(value) || value.length !== row.blankCount
      || value.some((part) => typeof part !== 'string' || part.trim().length === 0 || part.length > 1000)) {
      throw new HttpError(409, 'ANSWER_RESULT_INVALID', '已保存的答案片段與講義填空數不符，無法提供最終結果。');
    }
    results.push({
      questionNumber: row.questionNumber, winner: true,
      winningGroupId: row.groupId, winningGroupName: row.groupName,
      answerParts: value as string[]
    });
  }
  return results;
}

export function createWinningAnswerProvider(db: SqliteDatabase): WinningAnswerProvider {
  return { async getResults(activityId) { return loadEndedAnswerResults(db, activityId); } };
}
