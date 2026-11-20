CREATE TABLE buzzer_submissions_results_review (
  accepted_order INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL CHECK (question_number > 0),
  group_id TEXT NOT NULL,
  answer_parts_json TEXT NOT NULL CHECK (
    CASE
      WHEN json_valid(answer_parts_json) THEN json_type(answer_parts_json) = 'array'
      ELSE 0
    END
  ),
  accepted_at TEXT NOT NULL CHECK (length(trim(accepted_at)) > 0),
  submission_rank INTEGER NOT NULL CHECK (submission_rank > 0),
  is_winner INTEGER NOT NULL CHECK (is_winner IN (0, 1)),
  UNIQUE(activity_id, question_number, group_id),
  UNIQUE(activity_id, question_number, submission_rank),
  FOREIGN KEY (activity_id, question_number)
    REFERENCES activity_questions(activity_id, question_number) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, group_id)
    REFERENCES groups(activity_id, id) ON DELETE CASCADE
);

INSERT INTO buzzer_submissions_results_review
  (accepted_order, activity_id, question_number, group_id, answer_parts_json, accepted_at, submission_rank, is_winner)
SELECT accepted_order, activity_id, question_number, group_id, answer_parts_json, accepted_at, 1, 1
FROM buzzer_submissions;

DROP TABLE buzzer_submissions;
ALTER TABLE buzzer_submissions_results_review RENAME TO buzzer_submissions;

CREATE INDEX idx_buzzer_submissions_activity_order
  ON buzzer_submissions(activity_id, accepted_order);

CREATE INDEX idx_buzzer_submissions_activity_question_rank
  ON buzzer_submissions(activity_id, question_number, submission_rank);

CREATE UNIQUE INDEX idx_buzzer_submissions_one_winner_per_question
  ON buzzer_submissions(activity_id, question_number) WHERE is_winner = 1;
