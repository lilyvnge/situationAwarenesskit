ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_marked_interest BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS map_removed_at TIMESTAMPTZ;

UPDATE events
SET is_marked_interest = FALSE
WHERE is_marked_interest IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_map_visibility
ON events (map_removed_at, is_marked_interest, started_at DESC);
