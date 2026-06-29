# Intelligence Analyzer (Local-First MVP)

This repository is a local-first foundation for an intelligence analysis platform focused on geopolitical and military OSINT events with geospatial and link analysis support.

## What Is Included
- Dockerized local stack:
  - PostgreSQL 16 + PostGIS + pgvector
  - Redis
  - n8n
  - FastAPI backend
- Core database schema for:
  - `osint_sources`
  - `actors`
  - `events`
  - `event_links`
  - `campaigns`
  - `audit_log`
- Sample n8n ingestion workflow (`RSS -> normalize -> store source`)
- API starter endpoints for event listing, detail lookup, network view, link creation, and analyst review actions

## Quick Start

```bash
docker compose up --build -d
```

Services:
- Backend API: `http://localhost:8000`
- API health check: `http://localhost:8000/health`
- Frontend COP Dashboard: `http://localhost:3000`
- n8n: `http://localhost:5678`
- Postgres: `localhost:5432` (db/user/pass: `intel`)

Before running HF-powered workflow nodes, set `HUGGINGFACE_API_TOKEN` in `.env`.
Set `CLASSIFIER_PROVIDER=local` (recommended) or `CLASSIFIER_PROVIDER=hf` for unified classification workflow mode.
For local dashboard access, the default demo users are `admin/admin123`, `analyst/analyst123`, and `viewer/viewer123`.
Override them with `AUTH_USERS` and set a strong `JWT_SECRET_KEY` before any shared deployment.

Stop services:

```bash
docker compose down
```

## API Endpoints (MVP)
- `GET /health`
- `POST /auth/login`
- `GET /auth/me`
- `GET /classify/schema`
- `POST /classify`
- `GET /events?event_class=&country=&status=&limit=&offset=`
- `GET /events/{event_id}`
- `GET /events/network?event_id=&limit=`
- `POST /events/{event_id}/links`
- `POST /analyst/review`

## COP Frontend
- Stack: React + Vite + MapLibre + Recharts + Force Graph
- Features:
  - live geospatial event map
  - operational tempo timeline
  - event-link network graph
  - analyst event detail panel
- Data wiring:
  - `GET /events` -> map + timeline
  - `GET /events/network` -> network graph
  - `GET /events/{id}` -> event detail panel

## Example Requests

Create a link:

```bash
curl -X POST http://localhost:8000/events/1/links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "related_event_id": 2,
    "relationship_type": "similar_mo",
    "link_confidence": 0.84,
    "created_by": "analyst_01",
    "status": "proposed",
    "notes": "same UAS profile and strike timing"
  }'
```

Classify an OSINT observation:

```bash
curl -X POST http://localhost:8000/classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Local reports indicate an artillery strike near Kharkiv with 3 casualties.",
    "source_url": "https://example.com/report/123",
    "source_rating": "B",
    "language": "en"
  }'
```

Review an event:

```bash
curl -X POST http://localhost:8000/analyst/review \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": 1,
    "status": "confirmed",
    "analyst": "analyst_01",
    "notes": "cross-verified with second source"
  }'
```

## Security and Analyst Guardrails
- This is for situational awareness and event analysis, not targeting.
- Use role-based access and per-tenant data segregation before production.
- Keep low-confidence and low-reputation items in review queues.
- Preserve immutable audit trails (`audit_log`) for all analyst decisions.

## Next Implementation Steps
1. Add classifier microservice (`/classify`) with strict JSON schema output.
2. Add n8n workflow for classification and event insertion.
3. Add linkage worker using spatial-temporal + actor + embedding similarity.
4. Add frontend dashboard (MapLibre/OpenLayers + network panel).
5. Add auth (Keycloak/Auth0), tenancy controls, and backup strategy for server deployment.

## Existing DB Migrations
If your stack was already running before the latest schema safety and enrichment updates, apply:

```bash
cat infrastructure/db/init/004_safety_and_actor_uniqueness.sql | docker compose exec -T db psql -U intel -d intel
cat infrastructure/db/init/005_event_enrichment_fields.sql | docker compose exec -T db psql -U intel -d intel
```
