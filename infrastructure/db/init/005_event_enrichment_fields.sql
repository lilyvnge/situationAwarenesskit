-- Adds classifier enrichment fields consumed by the dashboard event detail panel
-- and produced by the Cerebras Classification + Guardrails workflow.

ALTER TABLE events
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS started_at_original TEXT,
    ADD COLUMN IF NOT EXISTS weapon_category TEXT,
    ADD COLUMN IF NOT EXISTS casualties_confidence TEXT,
    ADD COLUMN IF NOT EXISTS severity INT,
    ADD COLUMN IF NOT EXISTS escalation_potential TEXT,
    ADD COLUMN IF NOT EXISTS strategic_impact TEXT,
    ADD COLUMN IF NOT EXISTS event_phase TEXT,
    ADD COLUMN IF NOT EXISTS intelligence_gaps TEXT[],
    ADD COLUMN IF NOT EXISTS classification_metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE events
    ALTER COLUMN severity TYPE INT,
    ALTER COLUMN classification_metadata SET DEFAULT '{}'::jsonb;

UPDATE events
SET state = COALESCE(state, admin1)
WHERE state IS NULL
  AND admin1 IS NOT NULL;

UPDATE events
SET classification_metadata = '{}'::jsonb
WHERE classification_metadata IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_severity_time
ON events (severity DESC, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_enrichment_phase
ON events (event_phase, escalation_potential);
