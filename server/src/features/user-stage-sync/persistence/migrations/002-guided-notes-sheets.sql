CREATE TABLE IF NOT EXISTS activity_questions (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL CHECK (question_number > 0),
  created_at TEXT NOT NULL,
  UNIQUE (activity_id, question_number)
);

CREATE TABLE IF NOT EXISTS guided_notes_sources (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
  spreadsheet_id TEXT NOT NULL CHECK (length(trim(spreadsheet_id)) > 0),
  sheet_id INTEGER NOT NULL CHECK (sheet_id >= 0),
  sheet_title TEXT NOT NULL CHECK (length(trim(sheet_title)) > 0),
  structure_fingerprint TEXT NOT NULL CHECK (length(trim(structure_fingerprint)) > 0),
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (id, activity_id)
);

CREATE TABLE IF NOT EXISTS guided_notes_blank_mappings (
  source_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  question_number INTEGER NOT NULL CHECK (question_number > 0),
  slot_order INTEGER NOT NULL CHECK (slot_order >= 0),
  row_index INTEGER NOT NULL CHECK (row_index >= 0),
  column_index INTEGER NOT NULL CHECK (column_index >= 0),
  blank_kind TEXT NOT NULL CHECK (length(trim(blank_kind)) > 0),
  PRIMARY KEY (source_id, question_number, slot_order),
  UNIQUE (source_id, row_index, column_index),
  FOREIGN KEY (source_id, activity_id) REFERENCES guided_notes_sources(id, activity_id) ON DELETE CASCADE,
  FOREIGN KEY (activity_id, question_number) REFERENCES activity_questions(activity_id, question_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guided_notes_export_attempts (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  created_by_session_id TEXT NOT NULL REFERENCES user_sessions(id),
  status TEXT NOT NULL CHECK (status IN ('previewed', 'pending', 'completed', 'failed', 'unknown')),
  source_fingerprint TEXT NOT NULL,
  answer_snapshot_hash TEXT NOT NULL,
  preview_expires_at TEXT NOT NULL,
  written_question_numbers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(written_question_numbers)),
  unchanged_question_numbers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(unchanged_question_numbers)),
  failed_question_numbers TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(failed_question_numbers)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guided_notes_questions_activity
  ON activity_questions(activity_id, question_number);
CREATE INDEX IF NOT EXISTS idx_guided_notes_sources_activity
  ON guided_notes_sources(activity_id);
CREATE INDEX IF NOT EXISTS idx_guided_notes_exports_activity
  ON guided_notes_export_attempts(activity_id, created_at);
