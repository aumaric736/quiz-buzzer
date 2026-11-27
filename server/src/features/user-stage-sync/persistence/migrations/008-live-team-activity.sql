ALTER TABLE activities
  ADD COLUMN live_revision INTEGER NOT NULL DEFAULT 0 CHECK (live_revision >= 0);

ALTER TABLE groups
  ADD COLUMN live_revision INTEGER NOT NULL DEFAULT 0 CHECK (live_revision >= 0);
