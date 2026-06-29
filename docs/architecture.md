# Intelligence Analyzer Architecture (Local MVP)

## Purpose
This platform ingests OSINT observations, normalizes and stores them, classifies them into intelligence events, and links events over time/space to support geopolitical and military analysis.

## Local Components
- `n8n`: ingestion and workflow orchestration
- `PostgreSQL + PostGIS + pgvector`: event/source/link persistence, geo and semantic search
- `Redis`: queue/pub-sub and caching
- `FastAPI`: analyst and dashboard-facing API layer

## Data Flow
1. Source content enters through n8n (RSS/webhooks/Telegram/etc.).
2. Guardrails apply normalization, deduplication, and initial reputation metadata.
3. Observation is saved to `osint_sources`.
4. Classifier service (next increment) maps observation into structured `events`.
5. Linkage logic suggests links in `event_links`.
6. Analysts validate events/links through API + dashboard.

## Analyst-Driven Rules
- No individual targeting workflows.
- Low-confidence items are retained but default to `pending_review`.
- Every analyst state change is logged in `audit_log`.

