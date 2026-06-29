# n8n Workflow Notes

## Included Example
- File: `n8n/workflows/osint_ingestion_sample.json`
- Purpose: starter ingest from RSS, normalize, generate embeddings (HF), and persist to `osint_sources`.
- File: `n8n/workflows/hf_intelligence_classification_guardrails.json`
- Purpose: unified classification workflow with guardrails, quarantine, actor upsert, and event insertion.
  - `CLASSIFIER_PROVIDER=local` -> calls `POST /classify` (recommended default).
  - `CLASSIFIER_PROVIDER=hf` -> calls Hugging Face inference API.
- File: `n8n/workflows/linkage_nightly.json`
- Purpose: nightly auto-linking into `event_links` using spatial proximity + actor overlap + vector similarity.

## Import
1. Start stack with `docker compose up -d`.
2. Open `http://localhost:5678`.
3. Import workflow JSON from `n8n/workflows/osint_ingestion_sample.json`.
4. Import workflow JSON from `n8n/workflows/hf_intelligence_classification_guardrails.json`.
5. Import workflow JSON from `n8n/workflows/linkage_nightly.json`.
6. Configure Postgres credential in n8n:
   - Host: `db`
   - Port: `5432`
   - Database: `intel`
   - User: `intel`
   - Password: `intel`

## Next Workflows To Add
1. `unified_classification_guardrails`: implemented in `n8n/workflows/hf_intelligence_classification_guardrails.json`.
2. `linkage_nightly`: implemented in `n8n/workflows/linkage_nightly.json`.
3. `quarantine_low_reputation`: built into unified classification workflow.

## Linkage Scoring Notes
- Actor overlap contributes the largest confidence weight.
- Spatial match is based on `ST_DWithin(..., 100km)` with wider prefilter at 250km.
- Temporal match is `<= 48h` between inferred event times.
- Vector similarity uses `1 - (embedding <=> embedding)` from `pgvector`.
- Links are upserted as `proposed`, but existing `confirmed` links stay `confirmed`.

## Enrichment Notes
- `osint_ingestion_sample` now writes `osint_sources.embedding` using Hugging Face feature extraction.
- Unified classification workflow now attempts actor enrichment:
  - extract `actor_initiator` / `actor_target`
  - upsert into `actors`
  - write `events.actor_initiator_id` and `events.actor_target_id`
- For existing databases, apply `infrastructure/db/init/004_safety_and_actor_uniqueness.sql` once to add uniqueness safety for actors/events.

## Classifier Contract
- Endpoint: `POST http://backend:8000/classify`
- Schema: `GET http://backend:8000/classify/schema`
- Behavior: request and response are strict (`additionalProperties: false`), so unexpected fields fail validation.
