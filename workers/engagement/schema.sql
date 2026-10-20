CREATE TABLE IF NOT EXISTS engagement_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('active_30s','scroll_50','scroll_90','repository_click')),
  target TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (day, path, event_type, target)
) WITHOUT ROWID;
