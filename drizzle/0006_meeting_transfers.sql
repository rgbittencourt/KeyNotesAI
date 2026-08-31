CREATE TABLE IF NOT EXISTS meeting_transfers (
  source_email TEXT NOT NULL,
  meeting_id TEXT NOT NULL,
  target_email TEXT NOT NULL,
  transferred_at TEXT NOT NULL,
  PRIMARY KEY (source_email, meeting_id)
);
