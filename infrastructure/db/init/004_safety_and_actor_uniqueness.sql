-- Safety migration for existing databases:
-- 1) deduplicate actors and enforce unique actor names for upsert safety
-- 2) deduplicate events per osint source and enforce uniqueness

-- Normalize duplicate actors by case-insensitive name and keep the lowest id.
CREATE TEMP TABLE _actor_groups AS
SELECT
    LOWER(name) AS lname,
    MIN(id) AS keep_id,
    ARRAY_AGG(id) AS all_ids
FROM actors
WHERE name IS NOT NULL
GROUP BY LOWER(name)
HAVING COUNT(*) > 1;

CREATE TEMP TABLE _actor_map AS
SELECT
    g.keep_id,
    UNNEST(g.all_ids) AS old_id
FROM _actor_groups g;

UPDATE events e
SET actor_initiator_id = m.keep_id
FROM _actor_map m
WHERE e.actor_initiator_id = m.old_id
  AND m.old_id <> m.keep_id;

UPDATE events e
SET actor_target_id = m.keep_id
FROM _actor_map m
WHERE e.actor_target_id = m.old_id
  AND m.old_id <> m.keep_id;

DELETE FROM actors a
USING _actor_map m
WHERE a.id = m.old_id
  AND m.old_id <> m.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_actors_name ON actors (name);

-- Keep only one event per source (oldest row wins) so uniqueness can be enforced.
CREATE TEMP TABLE _event_dupes AS
SELECT id
FROM (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY osint_source_id
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM events
    WHERE osint_source_id IS NOT NULL
) ranked
WHERE ranked.rn > 1;

DELETE FROM events e
USING _event_dupes d
WHERE e.id = d.id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_events_osint_source_id
ON events (osint_source_id)
WHERE osint_source_id IS NOT NULL;

