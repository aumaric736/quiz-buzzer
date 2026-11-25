import type { AnswerStatusResponse, Role, TeacherQuestionStatus } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from '../persistence/database.js';
import { HttpError } from '../../../api/validation.js';
import { loadEndedAnswerResults } from '../../buzzer-flow/application/winning-answer-provider.js';
import { requireActiveSession } from './session-service.js';

function parseLiveAnswerParts(value: string | null): string[] {
  if (value === null) throw new HttpError(409, 'ANSWER_STATUS_INVALID', '已保存的作答狀況不完整，無法顯示即時結果。');
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new HttpError(409, 'ANSWER_STATUS_INVALID', '已保存的答案格式無效，無法顯示即時結果。'); }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((part) => typeof part !== 'string' || !part.trim() || part.length > 1000)) {
    throw new HttpError(409, 'ANSWER_STATUS_INVALID', '已保存的答案片段格式不正確，無法顯示即時結果。');
  }
  return parsed.map((part) => (part as string).trim());
}

export function readAnswerStatus(db: SqliteDatabase, sessionId: string, activityId: string): AnswerStatusResponse {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role, activity_id AS activityId, group_id AS groupId FROM user_sessions WHERE id = ?').get(sessionId) as
    { role: Role; activityId: string | null; groupId: string | null } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  const activity = db.prepare('SELECT phase, created_by_session_id AS owner FROM activities WHERE id = ?').get(activityId) as
    { phase: '準備中' | '搶答進行中' | '已結束'; owner: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (session.role === 'teacher') {
    if (activity.owner !== sessionId) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以查看作答狀況。');
  } else if (session.activityId !== activityId || !session.groupId
    || !db.prepare('SELECT 1 FROM groups WHERE id = ? AND activity_id = ?').get(session.groupId, activityId)) {
    throw new HttpError(403, 'ACTIVITY_MEMBERSHIP_REQUIRED', '請先加入此活動的學生組別再查看作答狀況。');
  }

  if (activity.phase === '準備中') return { phase: '準備中', items: [] };
  if (activity.phase === '已結束') return { phase: '已結束', items: loadEndedAnswerResults(db, activityId) };

  if (session.role === 'teacher') {
    const items = db.prepare(`SELECT q.question_number AS questionNumber, b.group_id AS groupId,
        g.display_name AS groupName, b.answer_parts_json AS answerPartsJson
      FROM activity_questions q
      LEFT JOIN buzzer_submissions b ON b.activity_id = q.activity_id AND b.question_number = q.question_number AND b.is_winner = 1
      LEFT JOIN groups g ON g.id = b.group_id AND g.activity_id = b.activity_id
      WHERE q.activity_id = ? ORDER BY q.question_number`).all(activityId) as Array<{
        questionNumber: number; groupId: string | null; groupName: string | null; answerPartsJson: string | null
      }>;
    return {
      phase: '搶答進行中',
      items: items.map((item): TeacherQuestionStatus => item.groupId === null
        ? { questionNumber: item.questionNumber, status: 'open' }
        : {
            questionNumber: item.questionNumber, status: 'won', groupId: item.groupId,
            groupName: item.groupName ?? '', answerParts: parseLiveAnswerParts(item.answerPartsJson)
          })
    };
  }

  const items = db.prepare(`SELECT q.question_number AS questionNumber
    FROM buzzer_submissions b
    JOIN activity_questions q ON q.activity_id = b.activity_id AND q.question_number = b.question_number
    WHERE b.activity_id = ? AND b.group_id = ? ORDER BY q.question_number`).all(activityId, session.groupId) as Array<{ questionNumber: number }>;
  return { phase: '搶答進行中', items: items.map(({ questionNumber }) => ({ questionNumber, status: 'submitted' as const })) };
}
