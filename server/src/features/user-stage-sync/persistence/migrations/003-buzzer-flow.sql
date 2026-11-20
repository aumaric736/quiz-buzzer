CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_activity_id_id
  ON groups(activity_id, id);

CREATE TABLE IF NOT EXISTS buzzer_submissions (
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
  UNIQUE(activity_id, question_number),
  FOREIGN KEY (activity_id, question_number)
    REFERENCES activity_questions(activity_id, question_number) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, group_id)
    REFERENCES groups(activity_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_buzzer_submissions_activity_order
  ON buzzer_submissions(activity_id, accepted_order);
