ALTER TABLE activities
  ADD COLUMN joining_opened_at TEXT;

ALTER TABLE user_sessions
  ADD COLUMN disconnected_at TEXT;

ALTER TABLE activity_questions
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0);

WITH ordered_questions AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY activity_id ORDER BY question_number) - 1 AS display_order
  FROM activity_questions
)
UPDATE activity_questions
SET display_order = (
  SELECT ordered_questions.display_order
  FROM ordered_questions
  WHERE ordered_questions.id = activity_questions.id
);

UPDATE activities
SET joining_opened_at = updated_at
WHERE phase = '準備中'
  AND EXISTS (
    SELECT 1
    FROM user_sessions AS members
    WHERE members.activity_id = activities.id
      AND members.role = 'student'
      AND members.group_id IS NOT NULL
      AND members.retired_at IS NULL
  )
  AND EXISTS (
    SELECT 1
    FROM activity_questions AS questions
    WHERE questions.activity_id = activities.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM activity_questions AS questions
    LEFT JOIN guided_notes_sources AS sources
      ON sources.activity_id = questions.activity_id
    LEFT JOIN guided_notes_blank_mappings AS mappings
      ON mappings.source_id = sources.id
     AND mappings.activity_id = questions.activity_id
     AND mappings.question_number = questions.question_number
    WHERE questions.activity_id = activities.id
    GROUP BY questions.id
    HAVING COUNT(mappings.slot_order) = 0
       OR MIN(mappings.slot_order) <> 0
       OR MAX(mappings.slot_order) <> COUNT(mappings.slot_order) - 1
  );

UPDATE user_sessions
SET disconnected_at = updated_at
WHERE role = 'student'
  AND retired_at IS NULL
  AND disconnected_until IS NOT NULL;
