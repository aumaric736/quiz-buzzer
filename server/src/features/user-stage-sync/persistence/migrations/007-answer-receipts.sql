ALTER TABLE buzzer_submissions ADD COLUMN receipt_sequence INTEGER;
CREATE UNIQUE INDEX idx_buzzer_submission_activity_receipt
  ON buzzer_submissions(activity_id, receipt_sequence) WHERE receipt_sequence IS NOT NULL;
