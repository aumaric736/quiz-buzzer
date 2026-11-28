import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WinningAnswerResult } from '../../../shared/src/guided-notes/contracts.js';
import { QuestionResultList } from '../../../client/src/features/buzzer-flow/components/QuestionResultList.js';
import { StudentJoinView } from '../../../client/src/features/user-stage-sync/views/StudentJoinView.js';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { submitAnswer } from '../../../server/src/features/buzzer-flow/application/buzzer-flow-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('final result visibility acceptance', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let studentAId: string;
  let studentBId: string;
  let activityId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentAId = createSession(db, 'student').sessionId;
    studentBId = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5], 2);
    enrollGroup(db, studentAId, activityId, 'Blue Team');
    enrollGroup(db, studentBId, activityId, 'Green Team');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('keeps live student status private, then renders complete shared results after teacher end', async () => {
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    submitAnswer(db, studentAId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] });
    const live = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentBId } });
    expect(await live.json()).toEqual({ phase: '搶答進行中', items: [] });

    transitionActivity(db, teacherId, activityId, '已結束');
    const teacherResults = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': teacherId } });
    const studentResults = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentBId } });
    const teacherStatus = await teacherResults.json() as { items: Array<Record<string, unknown>> };
    const studentStatus = await studentResults.json() as { items: Array<Record<string, unknown>> };
    expect(studentStatus).toEqual(teacherStatus);
    expect(studentStatus.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionNumber: 2, winner: true, winningGroupName: 'Blue Team', answerParts: ['first', 'second'] }),
      { questionNumber: 5, winner: false }
    ]));
    const html = renderToStaticMarkup(<QuestionResultList items={studentStatus.items as WinningAnswerResult[]} />);
    expect(html).toContain('第 2 題');
    expect(html).toContain('Blue Team');
    expect(html).toContain('第 5 題');
    expect(html).toContain('無勝出組別');
  });

  it('keeps ended results read-only without a new-activity action', () => {
    const html = renderToStaticMarkup(<StudentJoinView
      session={{ sessionId: studentAId, role: 'student', activityId, groupId: 'group-1', groupName: 'Blue Team' }}
      initialActivity={{ activityId, phase: '已結束', revision: 2 }}
    />);
    expect(html).toContain('已結束');
    expect(html).not.toContain('加入新活動');
  });
});
