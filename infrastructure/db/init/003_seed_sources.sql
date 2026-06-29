CREATE TABLE IF NOT EXISTS source_reputation (
    id BIGSERIAL PRIMARY KEY,
    source_key TEXT UNIQUE NOT NULL,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_tier SMALLINT NOT NULL,
    source_rating CHAR(1) NOT NULL,
    notes TEXT
);

INSERT INTO source_reputation (source_key, source_name, source_type, source_tier, source_rating, notes)
VALUES
    ('isw', 'Institute for the Study of War', 'think_tank', 1, 'A', 'Baseline curated source'),
    ('critical_threats', 'Critical Threats Project', 'think_tank', 1, 'A', 'Baseline curated source'),
    ('reuters', 'Reuters', 'news_wire', 3, 'B', 'Global wire service'),
    ('afp', 'Agence France-Presse', 'news_wire', 3, 'B', 'Global wire service'),
    ('telegram_verified', 'Verified Telegram Channels', 'social_media', 2, 'B', 'Manual verification required')
ON CONFLICT (source_key) DO NOTHING;

