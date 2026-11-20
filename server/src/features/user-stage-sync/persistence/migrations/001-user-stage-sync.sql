PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  activity_id TEXT REFERENCES activities(id),
  group_id TEXT REFERENCES groups(id),
  updated_at TEXT NOT NULL,
  CHECK (role = 'student' OR group_id IS NULL)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  phase TEXT NOT NULL CHECK (phase IN ('準備中', '搶答進行中', '已結束')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_by_session_id TEXT NOT NULL REFERENCES user_sessions(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0 AND display_name = trim(display_name)),
  normalized_name TEXT NOT NULL CHECK (normalized_name = lower(trim(display_name))),
  joined_at TEXT NOT NULL,
  UNIQUE (activity_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(created_by_session_id);
CREATE INDEX IF NOT EXISTS idx_groups_activity ON groups(activity_id);
