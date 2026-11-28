import { Router, type Request } from 'express';
import type { BuzzerQuestionUpdatedEvent, BuzzerQuestionsResponse, TeacherActivityProgressResponse } from '@quiz-buzzer/shared';
import { HttpError, isRecord, requireNonEmptyString } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { submitAnswer } from '../application/buzzer-flow-service.js';
import { getTeacherQuestionProgress } from '../persistence/buzzer-flow-repository.js';
import { requireActiveSession } from '../../user-stage-sync/application/session-service.js';
import { activityOperationQueue } from '../application/activity-operation-queue.js';
import { recordActivityOperation } from '../persistence/activity-operation-repository.js';

function requestSessionId(request: Request): string {
  const value = request.header('X-Local-Session-Id');
  if (!value || value.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return value;
}

function requireActivityAccess(db: SqliteDatabase, sessionId: string, activityId: string): void {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role, activity_id AS activityId, group_id AS groupId, authenticated_at AS authenticatedAt FROM user_sessions WHERE id = ?')
    .get(sessionId) as { role: string; activityId: string | null; groupId: string | null; authenticatedAt: string | null } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  const activity = db.prepare('SELECT created_by_session_id AS owner FROM activities WHERE id = ?').get(activityId) as { owner: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (session.role === 'teacher' && session.authenticatedAt && activity.owner === sessionId) return;
  if (session.role === 'student' && session.activityId === activityId && session.groupId
    && db.prepare('SELECT 1 FROM groups WHERE id = ? AND activity_id = ?').get(session.groupId, activityId)) return;
  throw new HttpError(403, 'ACTIVITY_MEMBERSHIP_REQUIRED', '只有此活動的老師或已加入組別的學生可以查看題目。');
}

export function buzzerFlowRoutes(
  db: SqliteDatabase,
  publishBuzzerQuestion: (event: BuzzerQuestionUpdatedEvent) => void = () => undefined,
  publishTeamAnswer: (activityId: string, groupId: string, questionNumber: number) => void = () => undefined
): Router {
  const router = Router();
  router.get('/api/activities/:activityId/teacher-progress', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const sessionId = requestSessionId(request);
      requireActiveSession(db, sessionId);
      const session = db.prepare('SELECT role, authenticated_at AS authenticatedAt FROM user_sessions WHERE id = ?').get(sessionId) as
        { role: string; authenticatedAt: string | null } | undefined;
      const activity = db.prepare('SELECT created_by_session_id AS owner, live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId) as
        { owner: string; liveRevision: number } | undefined;
      if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
      if (session?.role !== 'teacher' || !session.authenticatedAt || activity.owner !== sessionId) {
        throw new HttpError(403, 'ACTIVITY_MEMBERSHIP_REQUIRED', '只有此活動的老師可以查看各組作答進度。');
      }
      response.json({ activityId, activityLiveRevision: activity.liveRevision, questions: getTeacherQuestionProgress(db, activityId) } satisfies TeacherActivityProgressResponse);
    } catch (error) { next(error); }
  });

  router.get('/api/activities/:activityId/questions', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const sessionId = requestSessionId(request);
      requireActivityAccess(db, sessionId, activityId);
      const questions = db.prepare(`SELECT q.question_number AS questionNumber, q.display_order AS displayOrder, COUNT(m.slot_order) AS blankCount
        FROM activity_questions q
        LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
        LEFT JOIN guided_notes_blank_mappings m
          ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
        WHERE q.activity_id = ?
        GROUP BY q.question_number
        ORDER BY q.display_order`).all(activityId) as BuzzerQuestionsResponse['questions'];
      response.json({ questions } satisfies BuzzerQuestionsResponse);
    } catch (error) { next(error); }
  });

  router.post('/api/activities/:activityId/answers', async (request, response, next) => {
    try {
      if (!isRecord(request.body)) throw new HttpError(400, 'INVALID_ANSWER', '請提供題號與答案片段。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const sessionId = requestSessionId(request);
      const result = await activityOperationQueue.run(activityId, () => {
        const receiptSequence = recordActivityOperation(db, activityId, 'answer');
        return submitAnswer(db, sessionId, activityId, request.body, receiptSequence);
      });
      if (!result.isReplay) {
        publishBuzzerQuestion({ type: 'buzzer.question.updated', activityId, questionNumber: result.questionNumber,
          displayOrder: result.displayOrder,
          status: result.isWinner ? 'won' : 'submitted', groupId: result.groupId, groupName: result.groupName,
          answerParts: result.answerParts, submissionRank: result.submissionRank, isWinner: result.isWinner });
        publishTeamAnswer(activityId, result.groupId, result.questionNumber);
      }
      response.status(result.isReplay ? 200 : 201).json({ accepted: true, questionNumber: result.questionNumber,
        status: result.isReplay ? 'already_submitted' : 'accepted', answerParts: result.answerParts });
    } catch (error) { next(error); }
  });
  return router;
}
