ALTER TABLE groups ADD COLUMN invite_code TEXT;
ALTER TABLE groups ADD COLUMN leader_session_id TEXT REFERENCES user_sessions(id);
ALTER TABLE groups ADD COLUMN accepts_members INTEGER NOT NULL DEFAULT 1 CHECK (accepts_members IN (0, 1));

-- Existing groups get private random-format codes during upgrade. New codes are
-- generated cryptographically by the application and checked for collisions.
UPDATE groups SET invite_code = printf('%06d', abs(random()) % 1000000) WHERE invite_code IS NULL;
CREATE UNIQUE INDEX idx_groups_activity_invite_code
  ON groups(activity_id, invite_code);
CREATE INDEX idx_groups_activity_joinable
  ON groups(activity_id, accepts_members);

ALTER TABLE user_sessions ADD COLUMN group_role TEXT CHECK (group_role IN ('leader', 'member'));
ALTER TABLE user_sessions ADD COLUMN disconnected_until TEXT;
ALTER TABLE activities ADD COLUMN teacher_disconnected_until TEXT;
ALTER TABLE user_sessions ADD COLUMN authenticated_at TEXT;

CREATE TABLE activity_operation_receipts (
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('answer', 'end')),
  received_at TEXT NOT NULL,
  PRIMARY KEY (activity_id, sequence)
);

