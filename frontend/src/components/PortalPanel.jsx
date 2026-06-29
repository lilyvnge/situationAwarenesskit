import { useState } from "react";
import { submitPortalObservation } from "../api";
import { useAuth } from "../auth/AuthContext";

const SOURCE_RATINGS = ["A", "B", "C", "D", "E", "F"];

export default function PortalPanel({ onSubmitted }) {
  const auth = useAuth();
  const canSubmit = auth.hasRole("admin", "analyst", "submitter");
  const [form, setForm] = useState({
    title: "",
    contentSnippet: "",
    link: "",
    isoDate: new Date().toISOString().slice(0, 16),
    source_rating: "B",
    source_tier: 3
  });
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [processedNotice, setProcessedNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus({ kind: "", message: "" });
    setProcessedNotice(null);
    try {
      const response = await submitPortalObservation({
        ...form,
        isoDate: form.isoDate ? new Date(form.isoDate).toISOString() : null,
        source_tier: Number(form.source_tier)
      });
      if (response.processed) {
        setProcessedNotice({
          sourceId: response.source_id,
          sourceUrl: response.source_url
        });
        setStatus({ kind: "success", message: `Workflow confirmed source #${response.source_id}.` });
      } else {
        setStatus({
          kind: "warning",
          message: "n8n accepted the observation, but persistence was not confirmed yet."
        });
      }
      setForm((current) => ({
        ...current,
        title: "",
        contentSnippet: "",
        link: "",
        isoDate: new Date().toISOString().slice(0, 16)
      }));
      await onSubmitted?.();
    } catch (error) {
      setStatus({ kind: "error", message: error.message || "Unable to submit observation." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="portal-layout">
      {processedNotice && (
        <div className="processed-toast" role="status" aria-live="polite">
          <strong>PROCESSED</strong>
          <span>Source #{processedNotice.sourceId}</span>
        </div>
      )}
      <section className="panel portal-panel">
        <header className="panel-title-row">
          <div>
            <h2>INT Intake Portal</h2>
            <span className="mono">Feeds n8n workflow webhook: int-ingestion</span>
          </div>
          <span className={`status-pill ${canSubmit ? "status-confirmed" : "status-discarded"}`}>
            {canSubmit ? "Submission enabled" : "Read only"}
          </span>
        </header>

        <form className="portal-form" onSubmit={submit}>
          <label>
            Event Title
            <input
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Short human-readable summary"
              disabled={!canSubmit}
            />
          </label>

          <label className="portal-span">
            Observation Text
            <textarea
              value={form.contentSnippet}
              onChange={(event) => updateField("contentSnippet", event.target.value)}
              placeholder="Paste the INT/OSINT observation text here."
              minLength={10}
              required
              disabled={!canSubmit}
            />
          </label>

          <label>
            Source URL
            <input
              value={form.link}
              onChange={(event) => updateField("link", event.target.value)}
              placeholder="https://... or portal://..."
              disabled={!canSubmit}
            />
          </label>

          <label>
            Posted At
            <input
              type="datetime-local"
              value={form.isoDate}
              onChange={(event) => updateField("isoDate", event.target.value)}
              disabled={!canSubmit}
            />
          </label>

          <label>
            Source Rating
            <select
              value={form.source_rating}
              onChange={(event) => updateField("source_rating", event.target.value)}
              disabled={!canSubmit}
            >
              {SOURCE_RATINGS.map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </select>
          </label>

          <label>
            Source Tier
            <input
              type="number"
              min="1"
              max="5"
              value={form.source_tier}
              onChange={(event) => updateField("source_tier", event.target.value)}
              disabled={!canSubmit}
            />
          </label>

          {status.message && <div className={`portal-message portal-${status.kind}`}>{status.message}</div>}

          <div className="portal-actions">
            <button className="primary" type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Submitting..." : "Submit Observation"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
