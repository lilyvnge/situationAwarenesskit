CREATE TABLE IF NOT EXISTS osint_sources (
    id BIGSERIAL PRIMARY KEY,
    raw_text TEXT,
    clean_text TEXT,
    translated_text TEXT,
    source_url TEXT NOT NULL,
    source_handle TEXT,
    source_rating CHAR(1),
    source_tier SMALLINT,
    posted_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    content_hash TEXT UNIQUE,
    embedding vector(384)
);

CREATE TABLE IF NOT EXISTS actors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    aliases TEXT[],
    type TEXT,
    country TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    osint_source_id BIGINT UNIQUE REFERENCES osint_sources(id),
    event_class TEXT NOT NULL,
    event_subclass TEXT,
    description TEXT,
    geom GEOMETRY(Point, 4326),
    country TEXT,
    admin1 TEXT,
    state TEXT,
    city TEXT,
    started_at TIMESTAMPTZ,
    started_at_original TEXT,
    ai_confidence TEXT,
    actor_initiator_id INT REFERENCES actors(id),
    actor_target_id INT REFERENCES actors(id),
    weapon_system TEXT,
    weapon_category TEXT,
    casualties_est JSONB,
    casualties_confidence TEXT,
    severity INT,
    escalation_potential TEXT,
    strategic_impact TEXT,
    event_phase TEXT,
    intelligence_gaps TEXT[],
    classification_metadata JSONB DEFAULT '{}'::jsonb,
    classification_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'pending_review'
);

CREATE TABLE IF NOT EXISTS event_links (
    id BIGSERIAL PRIMARY KEY,
    event_id_1 BIGINT REFERENCES events(id) ON DELETE CASCADE,
    event_id_2 BIGINT REFERENCES events(id) ON DELETE CASCADE,
    relationship_type TEXT,
    link_confidence REAL DEFAULT 0.0,
    created_by TEXT,
    status TEXT DEFAULT 'proposed',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (event_id_1 < event_id_2),
    UNIQUE (event_id_1, event_id_2, relationship_type)
);

CREATE TABLE IF NOT EXISTS campaigns (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_events (
    campaign_id BIGINT REFERENCES campaigns(id) ON DELETE CASCADE,
    event_id BIGINT REFERENCES events(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, event_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_geom ON events USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_events_class_time ON events (event_class, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_actor_i ON events (actor_initiator_id);
CREATE INDEX IF NOT EXISTS idx_events_actor_t ON events (actor_target_id);
CREATE INDEX IF NOT EXISTS idx_sources_tier ON osint_sources (source_tier, source_rating);
CREATE INDEX IF NOT EXISTS idx_links_status ON event_links (status, link_confidence DESC);
