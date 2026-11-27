import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { applyMigrations } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('results-review SQLite migration', () => {
  let db: Database.Database | undefined;

  afterEach(() => { db?.close(); db = undefined; });

  it('preserves each existing winner as rank one and enforces per-question rank and winner uniqueness', () => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const migrations = resolve(process.cwd(), 'server/src/features/user-stage-sync/persistence/migrations');
    for (const name of ['001-user-stage-sync.sql', '002-guided-notes-sheets.sql', '003-buzzer-flow.sql', '005-user-stage-recovery.sql', '006-two-person-teams.sql', '008-live-team-activity.sql']) {
      applyMigrations(db, resolve(migrations, name));
    }

    const teacherId = createSession(db, 'teacher').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1, 2], 1);
    const winnerSession = createSession(db, 'student').sessionId;
    const otherSession = createSession(db, 'student').sessionId;
    const winnerGroup = enrollGroup(db, winnerSession, activityId, 'Blue');
    const otherGroup = enrollGroup(db, otherSession, activityId, 'Green');
    const old = db.prepare(`INSERT INTO buzzer_submissions
      (activity_id, question_number, group_id, answer_parts_json, accepted_at)
      VALUES (?, ?, ?, ?, ?)`).run(activityId, 1, winnerGroup.groupId, '["winner"]', '2026-11-20T12:00:00.000Z');
    const oldAcceptedOrder = Number(old.lastInsertRowid);

    applyMigrations(db, resolve(migrations, '004-results-review.sql'));
    applyMigrations(db, resolve(migrations, '007-answer-receipts.sql'));

    expect(db.prepare(`SELECT accepted_order AS acceptedOrder, activity_id AS activityId,
        question_number AS questionNumber, group_id AS groupId, answer_parts_json AS answerPartsJson,
        accepted_at AS acceptedAt, submission_rank AS submissionRank, is_winner AS isWinner
      FROM buzzer_submissions`).get()).toEqual({
      acceptedOrder: oldAcceptedOrder, activityId, questionNumber: 1, groupId: winnerGroup.groupId,
      answerPartsJson: '["winner"]', acceptedAt: '2026-11-20T12:00:00.000Z', submissionRank: 1, isWinner: 1
    });

    const insert = db.prepare(`INSERT INTO buzzer_submissions
      (activity_id, question_number, group_id, answer_parts_json, accepted_at, submission_rank, is_winner)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run(activityId, 1, otherGroup.groupId, '["later"]', '2026-11-20T12:01:00.000Z', 2, 0);
    expect(() => insert.run(activityId, 1, otherGroup.groupId, '["duplicate group"]', 'now', 3, 0)).toThrow();
    const thirdSession = createSession(db, 'student').sessionId;
    const thirdGroup = enrollGroup(db, thirdSession, activityId, 'Red');
    expect(() => insert.run(activityId, 1, thirdGroup.groupId, '["duplicate rank"]', 'now', 2, 0)).toThrow();
    expect(() => insert.run(activityId, 1, thirdGroup.groupId, '["duplicate winner"]', 'now', 3, 1)).toThrow();
  });
});
