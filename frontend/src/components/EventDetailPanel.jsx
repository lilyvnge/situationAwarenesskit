import { useEffect, useMemo, useState } from "react";
import { updateEventDetails, updateEventLinkStatus, updateEventStatus } from "../api";
import { useAuth } from "../auth/AuthContext";

const EVENT_STATUSES = [
  { label: "Pending Review", value: "pending_review" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Discarded", value: "discarded" }
];
const EVENT_CLASSES = [
  "unknown",
  "military_kinetic",
  "political",
  "cyber_information",
  "economic",
  "socio_cultural",
  "indicator_warning",
  "other"
];
const CONFIDENCE_LEVELS = ["", "low", "medium", "high"];
const ESCALATION_LEVELS = ["", "low", "medium", "high"];
const IMPACT_LEVELS = ["", "local", "regional", "global"];
const EVENT_PHASES = ["", "preparation", "execution", "aftermath", "ongoing"];

function toInputDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function editableFormFromEvent(eventDetail) {
  return {
    event_class: eventDetail.event_class || "",
    event_subclass: eventDetail.event_subclass || "",
    description: eventDetail.description || "",
    country: eventDetail.country || "",
    admin1: eventDetail.admin1 || "",
    state: eventDetail.state || "",
    city: eventDetail.city || "",
    started_at: toInputDateTime(eventDetail.started_at),
    started_at_original: eventDetail.started_at_original || "",
    ai_confidence: eventDetail.ai_confidence || "",
    weapon_system: eventDetail.weapon_system || "",
    weapon_category: eventDetail.weapon_category || "",
    casualties_confidence: eventDetail.casualties_confidence || "",
    severity: eventDetail.severity ?? "",
    escalation_potential: eventDetail.escalation_potential || "",
    strategic_impact: eventDetail.strategic_impact || "",
    event_phase: eventDetail.event_phase || "",
    latitude: eventDetail.latitude ?? "",
    longitude: eventDetail.longitude ?? "",
    intelligence_gaps: Array.isArray(eventDetail.intelligence_gaps)
      ? eventDetail.intelligence_gaps.join("\n")
      : ""
  };
}

function normalizeOptional(value) {
  return value === "" ? null : value;
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "n/a";
  return value || value === 0 ? value : "n/a";
}

function Item({ label, value }) {
  return (
    <div className="detail-item">
      <span className="label">{label}</span>
      <span className="value">{formatValue(value)}</span>
    </div>
  );
}

function SourceList({ sources }) {
  if (!sources?.length) {
    return <p className="empty-note">No INT sources attached.</p>;
  }

  return (
    <div className="source-list">
      {sources.map((source) => (
        <article className="source-row" key={source.id}>
          <div>
            <strong>{source.source_handle || `Source #${source.id}`}</strong>
            <span className="mono">Tier {formatValue(source.source_tier)} · Rating {formatValue(source.source_rating)}</span>
          </div>
          {source.source_url && (
            <a href={source.source_url} target="_blank" rel="noreferrer">
              Open Source
            </a>
          )}
        </article>
      ))}
    </div>
  );
}

function LinkList({ eventId, links, canAct, onAction }) {
  const [busyLinkId, setBusyLinkId] = useState(null);

  const handleLinkAction = async (linkId, status) => {
    setBusyLinkId(linkId);
    try {
      await updateEventLinkStatus(eventId, linkId, status, `Analyst marked link ${status}`);
      await onAction?.();
    } finally {
      setBusyLinkId(null);
    }
  };

  if (!links?.length) {
    return <p className="empty-note">No proposed or confirmed links for this event.</p>;
  }

  return (
    <div className="link-list">
      {links.map((link) => (
        <article className={`link-row link-status-${link.status}`} key={link.id}>
          <div className="link-row-main">
            <div>
              <strong>Event #{link.related_event_id}</strong>
              <span>{formatValue(link.related_event_class)} · {formatValue(link.related_country)}</span>
            </div>
            <span className="status-pill">{link.status}</span>
          </div>
          <div className="link-row-meta">
            <span>{formatValue(link.relationship_type)}</span>
            <span>Confidence {Number(link.link_confidence || 0).toFixed(2)}</span>
            <span>{formatValue(link.created_by)}</span>
          </div>
          {link.notes && <p>{link.notes}</p>}
          {canAct && link.status === "proposed" && (
            <div className="detail-actions">
              <button type="button" onClick={() => handleLinkAction(link.id, "confirmed")} disabled={busyLinkId === link.id}>
                Confirm
              </button>
              <button type="button" onClick={() => handleLinkAction(link.id, "rejected")} disabled={busyLinkId === link.id}>
                Reject
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export default function EventDetailPanel({ eventDetail, onEventUpdated }) {
  const auth = useAuth();
  const canManage = auth.hasRole("admin", "analyst");
  const canEditDetails = auth.hasRole("admin");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(eventDetail?.status || "");
    setNotes("");
    setError("");
    setEditing(false);
    setEditForm(eventDetail ? editableFormFromEvent(eventDetail) : {});
  }, [eventDetail]);

  const sourceText = useMemo(
    () => eventDetail?.translated_text || eventDetail?.clean_text || eventDetail?.raw_text || "No source text.",
    [eventDetail]
  );

  const handleStatusUpdate = async () => {
    if (!eventDetail || !status) return;
    setSavingStatus(true);
    setError("");
    try {
      await updateEventStatus(eventDetail.id, status, notes);
      await onEventUpdated?.();
    } catch (err) {
      setError(err.message || "Unable to update event status.");
    } finally {
      setSavingStatus(false);
    }
  };

  const updateEditField = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const handleEditSave = async () => {
    if (!eventDetail || !canEditDetails) return;
    setSavingEdit(true);
    setError("");
    try {
      const payload = {
        event_class: normalizeOptional(editForm.event_class),
        event_subclass: normalizeOptional(editForm.event_subclass),
        description: normalizeOptional(editForm.description),
        country: normalizeOptional(editForm.country),
        admin1: normalizeOptional(editForm.admin1),
        state: normalizeOptional(editForm.state),
        city: normalizeOptional(editForm.city),
        started_at: editForm.started_at ? new Date(editForm.started_at).toISOString() : null,
        started_at_original: normalizeOptional(editForm.started_at_original),
        ai_confidence: normalizeOptional(editForm.ai_confidence),
        weapon_system: normalizeOptional(editForm.weapon_system),
        weapon_category: normalizeOptional(editForm.weapon_category),
        casualties_confidence: normalizeOptional(editForm.casualties_confidence),
        severity: editForm.severity === "" ? null : Number(editForm.severity),
        escalation_potential: normalizeOptional(editForm.escalation_potential),
        strategic_impact: normalizeOptional(editForm.strategic_impact),
        event_phase: normalizeOptional(editForm.event_phase),
        latitude: editForm.latitude === "" ? null : Number(editForm.latitude),
        longitude: editForm.longitude === "" ? null : Number(editForm.longitude),
        intelligence_gaps: editForm.intelligence_gaps
          ? editForm.intelligence_gaps
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
          : []
      };
      const updatedEvent = await updateEventDetails(eventDetail.id, payload);
      setEditForm(editableFormFromEvent(updatedEvent));
      setEditing(false);
      await onEventUpdated?.();
    } catch (err) {
      setError(err.message || "Unable to update event details.");
    } finally {
      setSavingEdit(false);
    }
  };

  if (!eventDetail) {
    return (
      <section className="panel detail-panel">
        <header className="panel-title-row">
          <h2>Event Dossier</h2>
        </header>
        <p className="empty-note">Select an event from map, timeline, or network graph.</p>
      </section>
    );
  }

  return (
    <section className="panel detail-panel">
      <header className="panel-title-row">
        <div>
          <h2>Event Dossier</h2>
          <span className="mono">Event #{eventDetail.id}</span>
        </div>
        <div className="detail-header-actions">
          <span className={`status-pill status-${eventDetail.status}`}>{eventDetail.status}</span>
          {canEditDetails && (
            <button
              className="ghost-button detail-edit-button"
              type="button"
              onClick={() => {
                setEditForm(editableFormFromEvent(eventDetail));
                setEditing((current) => !current);
              }}
            >
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
      </header>

      <div className="detail-status-row">
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!canManage}>
            {EVENT_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Analyst Notes
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={canManage ? "Decision note" : "Read only"}
            disabled={!canManage}
          />
        </label>
        <button className="primary" type="button" onClick={handleStatusUpdate} disabled={!canManage || savingStatus}>
          {savingStatus ? "Saving..." : "Update"}
        </button>
      </div>
      {error && <div className="login-error">{error}</div>}

      {editing ? (
        <div className="detail-edit-form">
          <label>
            Class
            <select value={editForm.event_class || ""} onChange={(event) => updateEditField("event_class", event.target.value)}>
              {EVENT_CLASSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subclass
            <input value={editForm.event_subclass || ""} onChange={(event) => updateEditField("event_subclass", event.target.value)} />
          </label>
          <label>
            Severity
            <input min="1" max="5" type="number" value={editForm.severity} onChange={(event) => updateEditField("severity", event.target.value)} />
          </label>
          <label>
            Confidence
            <select value={editForm.ai_confidence || ""} onChange={(event) => updateEditField("ai_confidence", event.target.value)}>
              {CONFIDENCE_LEVELS.map((item) => (
                <option key={item || "blank"} value={item}>
                  {item || "n/a"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Country
            <input value={editForm.country || ""} onChange={(event) => updateEditField("country", event.target.value)} />
          </label>
          <label>
            Admin1
            <input value={editForm.admin1 || ""} onChange={(event) => updateEditField("admin1", event.target.value)} />
          </label>
          <label>
            State
            <input value={editForm.state || ""} onChange={(event) => updateEditField("state", event.target.value)} />
          </label>
          <label>
            City
            <input value={editForm.city || ""} onChange={(event) => updateEditField("city", event.target.value)} />
          </label>
          <label>
            Started
            <input type="datetime-local" value={editForm.started_at || ""} onChange={(event) => updateEditField("started_at", event.target.value)} />
          </label>
          <label>
            Original Time
            <input value={editForm.started_at_original || ""} onChange={(event) => updateEditField("started_at_original", event.target.value)} />
          </label>
          <label>
            Weapon System
            <input value={editForm.weapon_system || ""} onChange={(event) => updateEditField("weapon_system", event.target.value)} />
          </label>
          <label>
            Weapon Category
            <input value={editForm.weapon_category || ""} onChange={(event) => updateEditField("weapon_category", event.target.value)} />
          </label>
          <label>
            Casualties Confidence
            <select value={editForm.casualties_confidence || ""} onChange={(event) => updateEditField("casualties_confidence", event.target.value)}>
              {CONFIDENCE_LEVELS.map((item) => (
                <option key={item || "blank"} value={item}>
                  {item || "n/a"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Escalation Potential
            <select value={editForm.escalation_potential || ""} onChange={(event) => updateEditField("escalation_potential", event.target.value)}>
              {ESCALATION_LEVELS.map((item) => (
                <option key={item || "blank"} value={item}>
                  {item || "n/a"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Strategic Impact
            <select value={editForm.strategic_impact || ""} onChange={(event) => updateEditField("strategic_impact", event.target.value)}>
              {IMPACT_LEVELS.map((item) => (
                <option key={item || "blank"} value={item}>
                  {item || "n/a"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Event Phase
            <select value={editForm.event_phase || ""} onChange={(event) => updateEditField("event_phase", event.target.value)}>
              {EVENT_PHASES.map((item) => (
                <option key={item || "blank"} value={item}>
                  {item || "n/a"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Latitude
            <input type="number" step="0.000001" value={editForm.latitude} onChange={(event) => updateEditField("latitude", event.target.value)} />
          </label>
          <label>
            Longitude
            <input type="number" step="0.000001" value={editForm.longitude} onChange={(event) => updateEditField("longitude", event.target.value)} />
          </label>
          <label className="detail-edit-wide">
            Intelligence Gaps
            <textarea value={editForm.intelligence_gaps || ""} onChange={(event) => updateEditField("intelligence_gaps", event.target.value)} />
          </label>
          <label className="detail-edit-wide">
            Analyst Rationale
            <textarea value={editForm.description || ""} onChange={(event) => updateEditField("description", event.target.value)} />
          </label>
          <div className="detail-edit-actions">
            <button className="primary" type="button" onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? "Saving..." : "Save Details"}
            </button>
            <button className="ghost-button" type="button" onClick={() => setEditing(false)} disabled={savingEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="detail-grid detail-grid-wide">
          <Item label="Class" value={eventDetail.event_class} />
          <Item label="Subclass" value={eventDetail.event_subclass} />
          <Item label="Severity" value={eventDetail.severity} />
          <Item label="Confidence" value={eventDetail.ai_confidence} />
          <Item label="Country" value={eventDetail.country} />
          <Item label="Admin1" value={eventDetail.admin1} />
          <Item label="City" value={eventDetail.city} />
          <Item label="Started" value={eventDetail.started_at} />
          <Item label="Original Time" value={eventDetail.started_at_original} />
          <Item label="Initiator" value={eventDetail.actor_initiator_name} />
          <Item label="Target" value={eventDetail.actor_target_name} />
          <Item label="Weapon System" value={eventDetail.weapon_system} />
          <Item label="Weapon Category" value={eventDetail.weapon_category} />
          <Item label="Casualties Confidence" value={eventDetail.casualties_confidence} />
          <Item label="Escalation Potential" value={eventDetail.escalation_potential} />
          <Item label="Strategic Impact" value={eventDetail.strategic_impact} />
          <Item label="Event Phase" value={eventDetail.event_phase} />
          <Item label="Coordinates" value={
            eventDetail.latitude !== null && eventDetail.latitude !== undefined && eventDetail.longitude !== null && eventDetail.longitude !== undefined
              ? `${Number(eventDetail.latitude).toFixed(4)}, ${Number(eventDetail.longitude).toFixed(4)}`
              : null
          } />
          <Item label="Intelligence Gaps" value={eventDetail.intelligence_gaps} />
        </div>
      )}

      <div className="detail-text-block">
        <h3>INT Sources</h3>
        <SourceList sources={eventDetail.sources} />
      </div>

      <div className="detail-text-block">
        <h3>Proposed Links</h3>
        <LinkList eventId={eventDetail.id} links={eventDetail.proposed_links} canAct={canManage} onAction={onEventUpdated} />
      </div>

      <div className="detail-text-block">
        <h3>Analyst Rationale</h3>
        <p>{eventDetail.description || "No generated rationale available yet."}</p>
      </div>

      <div className="detail-text-block">
        <h3>OSINT Snippet</h3>
        <p>{sourceText}</p>
      </div>
    </section>
  );
}
