import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

function edgeColor(type) {
  const colors = {
    automated_campaign: "#5aa7ff",
    same_actor_group: "#ffbf47",
    similar_mo: "#43d9bd",
    sequential: "#ff6a3d",
    part_of_operation: "#8bd3ff"
  };
  return colors[type] || "#90a6bd";
}

function nodeColor(eventClass) {
  const colors = {
    military_kinetic: "#ff7a5c",
    political: "#f8b133",
    cyber_information: "#24c4c8",
    economic: "#74d680",
    socio_cultural: "#d7b8ff",
    indicator_warning: "#ff4f7a",
    other: "#9fb3c8"
  };
  return colors[eventClass] || "#9fb3c8";
}

function formatValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "n/a";
  return value || value === 0 ? String(value) : "n/a";
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number.toFixed(digits);
}

function formatDateTime(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function compactLocation(node) {
  return node?.location_name || [node?.city, node?.state || node?.admin1, node?.country].filter(Boolean).join(", ") || "n/a";
}

function linkEndpointId(endpoint) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

function nodeLabel(node) {
  return [
    `Event #${node.id}`,
    `Class: ${formatValue(node.event_class)}${node.event_subclass ? ` / ${node.event_subclass}` : ""}`,
    `Location: ${compactLocation(node)}`,
    `Initiator: ${formatValue(node.actor_initiator_name)}`,
    `Target: ${formatValue(node.actor_target_name)}`,
    `Weapon: ${formatValue(node.weapon_system || node.weapon_category)}`,
    `Started: ${formatDateTime(node.started_at)}`,
    `Severity: ${formatValue(node.severity)}`
  ].join("\n");
}

function linkLabel(link) {
  return [
    `${formatValue(link.relationship_type)} · confidence ${Number(link.link_confidence || 0).toFixed(2)}`,
    `Status: ${formatValue(link.status)}`,
    `Factors: ${formatValue(link.link_factors)}`,
    `Shared actors: ${formatValue(link.shared_actor_names)}`,
    `Shared location: ${formatValue(link.shared_location_name)}`,
    `Shared weapon: ${formatValue(link.shared_weapon)}`,
    formatNumber(link.distance_km) ? `Distance: ${formatNumber(link.distance_km)} km` : null,
    formatNumber(link.time_delta_hours) ? `Time delta: ${formatNumber(link.time_delta_hours)}h` : null
  ].filter(Boolean).join("\n");
}

function NodeSummary({ node, degree }) {
  if (!node) {
    return <p className="empty-note">Select a node to inspect event context and its strongest campaign links.</p>;
  }

  return (
    <div className="network-selected-card">
      <div className="network-selected-title">
        <strong>Event #{node.id}</strong>
        <span className={`status-pill status-${node.status}`}>{formatValue(node.status)}</span>
      </div>
      <div className="network-fact-grid">
        <div><span>Class</span><strong>{formatValue(node.event_class)}</strong></div>
        <div><span>Location</span><strong>{compactLocation(node)}</strong></div>
        <div><span>Started</span><strong>{formatDateTime(node.started_at)}</strong></div>
        <div><span>Severity</span><strong>{node.severity ? `${node.severity}/5` : "n/a"}</strong></div>
        <div><span>Initiator</span><strong>{formatValue(node.actor_initiator_name)}</strong></div>
        <div><span>Target</span><strong>{formatValue(node.actor_target_name)}</strong></div>
        <div><span>Weapon</span><strong>{formatValue(node.weapon_system || node.weapon_category)}</strong></div>
        <div><span>Links</span><strong>{degree}</strong></div>
      </div>
    </div>
  );
}

function LinkInspector({ links, nodesById, selectedEventId, onSelectEvent }) {
  const [statusFilter, setStatusFilter] = useState("active");

  if (!selectedEventId) {
    return <p className="empty-note">Select a graph node to review connected links.</p>;
  }

  const visibleLinks = links.filter((link) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "rejected") return link.status === "rejected";
    return link.status !== "rejected";
  });

  return (
    <div className="network-link-inspector">
      <div className="network-link-filter">
        <button type="button" className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>
          Active
        </button>
        <button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>
          All
        </button>
        <button type="button" className={statusFilter === "rejected" ? "active" : ""} onClick={() => setStatusFilter("rejected")}>
          Rejected
        </button>
      </div>
      <div className="network-link-list">
      {!visibleLinks.length && <p className="empty-note">No links match this filter.</p>}
      {visibleLinks.map((link) => {
        const sourceId = linkEndpointId(link.source);
        const targetId = linkEndpointId(link.target);
        const relatedId = sourceId === selectedEventId ? targetId : sourceId;
        const related = nodesById.get(relatedId);
        const chips = [
          ...(link.link_factors || []).filter(Boolean).slice(0, 5),
          ...(link.shared_actor_names || []).filter(Boolean).slice(0, 2),
          link.shared_location_name,
          link.shared_weapon
        ].filter(Boolean);
        return (
          <button
            key={link.id || `${sourceId}-${targetId}-${link.relationship_type}`}
            type="button"
            className={`network-link-card network-link-status-${link.status || "unknown"}`}
            onClick={() => onSelectEvent?.(relatedId)}
          >
            <div className="network-link-row-head">
              <strong>Event #{relatedId}</strong>
              <span>{Number(link.link_confidence || 0).toFixed(2)} · {formatValue(link.status)}</span>
            </div>
            <small>{formatValue(link.relationship_type)} · {formatValue(link.status)}</small>
            <small>{related ? `${formatValue(related.event_class)} · ${compactLocation(related)}` : "Related event"}</small>
            <div className="network-link-chip-row">
              {[...new Set(chips)].map((chip, index) => <span key={`${link.id}-${chip}-${index}`}>{chip}</span>)}
            </div>
          </button>
        );
      })}
      </div>
    </div>
  );
}

export default function NetworkPanel({ network, selectedEventId, onSelectEvent }) {
  const graphRef = useRef(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  const graphData = useMemo(() => {
    const nodes = network.nodes.map((node) => ({ ...node, id: node.id }));
    const links = network.edges.map((edge) => ({
      ...edge,
      id: edge.id,
      source: edge.event_id_1,
      target: edge.event_id_2,
      link_factors: edge.link_factors || [],
      shared_actor_names: edge.shared_actor_names || []
    }));
    return { nodes, links };
  }, [network]);

  const nodesById = useMemo(() => new Map(graphData.nodes.map((node) => [node.id, node])), [graphData.nodes]);
  const selectedNode = selectedEventId ? nodesById.get(selectedEventId) : null;

  const selectedNeighborhood = useMemo(() => {
    const connectedNodeIds = new Set();
    const connectedLinkKeys = new Set();

    if (!selectedEventId) {
      return { connectedNodeIds, connectedLinkKeys };
    }

    graphData.links.forEach((link) => {
      const sourceId = linkEndpointId(link.source);
      const targetId = linkEndpointId(link.target);
      if (sourceId === selectedEventId || targetId === selectedEventId) {
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
        connectedLinkKeys.add(`${sourceId}-${targetId}-${link.relationship_type}`);
      }
    });

    return { connectedNodeIds, connectedLinkKeys };
  }, [graphData.links, selectedEventId]);

  const selectedLinks = useMemo(() => {
    if (!selectedEventId) return [];
    return graphData.links
      .filter((link) => linkEndpointId(link.source) === selectedEventId || linkEndpointId(link.target) === selectedEventId)
      .sort((left, right) => Number(right.link_confidence || 0) - Number(left.link_confidence || 0));
  }, [graphData.links, selectedEventId]);

  const networkStats = useMemo(() => {
    const confidenceValues = graphData.links.map((link) => Number(link.link_confidence)).filter(Number.isFinite);
    const averageConfidence = confidenceValues.length
      ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
      : 0;
    return {
      averageConfidence,
      proposed: graphData.links.filter((link) => link.status === "proposed").length,
      confirmed: graphData.links.filter((link) => link.status === "confirmed").length,
      selectedDegree: selectedLinks.length
    };
  }, [graphData.links, selectedLinks.length]);

  useEffect(() => {
    if (!selectedEventId || !graphRef.current) return;

    let attempts = 0;
    let timerId;

    const centerSelectedNode = () => {
      const selected = graphData.nodes.find((node) => node.id === selectedEventId);
      if (selected?.x !== undefined && selected?.y !== undefined) {
        graphRef.current?.centerAt(selected.x, selected.y, 700);
        graphRef.current?.zoom(2.3, 700);
        return;
      }

      attempts += 1;
      if (attempts < 8) {
        timerId = window.setTimeout(centerSelectedNode, 120);
      }
    };

    centerSelectedNode();
    return () => window.clearTimeout(timerId);
  }, [graphData.nodes, selectedEventId]);

  const paintNode = (node, ctx, globalScale) => {
    const selected = node.id === selectedEventId;
    const connected = selectedNeighborhood.connectedNodeIds.has(node.id);
    const hovered = node.id === hoveredNodeId;
    const severity = Number(node.severity || 0);
    const radius = selected ? 10 : connected ? 7 : 5 + Math.min(Math.max(severity, 0), 5) * 0.45;

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + (selected ? 8 : hovered ? 6 : 3), 0, 2 * Math.PI, false);
    ctx.fillStyle = selected
      ? "rgba(36, 196, 200, 0.24)"
      : hovered
        ? "rgba(90, 167, 255, 0.18)"
        : "rgba(255, 255, 255, 0.08)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = selected ? "#f7fbff" : nodeColor(node.event_class);
    ctx.fill();
    ctx.lineWidth = selected ? 2.6 : node.status === "confirmed" ? 2 : 1.2;
    ctx.strokeStyle = selected ? "#24c4c8" : node.status === "confirmed" ? "#1dd1a1" : "rgba(5, 11, 18, 0.9)";
    ctx.stroke();

    if (selected || connected || hovered) {
      const label = selected ? `#${node.id} ${compactLocation(node)}` : `#${node.id}`;
      const fontSize = selected ? 11 : 9;
      ctx.font = `${fontSize / globalScale}px IBM Plex Mono, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = selected ? "#f7fbff" : "#c7d5e3";
      ctx.fillText(label, node.x, node.y + radius + 4);
    }
  };

  return (
    <section className="panel network-panel">
      <header className="panel-title-row">
        <div>
          <h2>Link Analysis Graph</h2>
          <span className="mono">
            {graphData.nodes.length} nodes · {graphData.links.length} links · avg {networkStats.averageConfidence.toFixed(2)}
          </span>
        </div>
        <div className="network-stat-row">
          <span>{networkStats.proposed} proposed</span>
          <span>{networkStats.confirmed} confirmed</span>
          <span>{networkStats.selectedDegree} selected</span>
        </div>
      </header>

      <div className="network-content">
        <aside className="network-inspector">
          <NodeSummary node={selectedNode} degree={networkStats.selectedDegree} />
          <div className="network-legend">
            <span><i className="legend-node legend-military" /> Class color</span>
            <span><i className="legend-ring" /> Confirmed ring</span>
            <span><i className="legend-edge" /> Confidence width</span>
          </div>
          <LinkInspector links={selectedLinks.slice(0, 12)} nodesById={nodesById} selectedEventId={selectedEventId} onSelectEvent={onSelectEvent} />
        </aside>

        <div className="network-canvas">
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            nodeRelSize={5}
            nodeLabel={nodeLabel}
            linkLabel={linkLabel}
            linkColor={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              return selectedNeighborhood.connectedLinkKeys.has(`${sourceId}-${targetId}-${link.relationship_type}`)
                ? "#f7fbff"
                : edgeColor(link.relationship_type);
            }}
            linkWidth={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              const baseWidth = 0.8 + Number(link.link_confidence || 0) * 2.4;
              return selectedNeighborhood.connectedLinkKeys.has(`${sourceId}-${targetId}-${link.relationship_type}`)
                ? Math.max(3.4, baseWidth)
                : baseWidth;
            }}
            linkDirectionalParticles={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              return selectedNeighborhood.connectedLinkKeys.has(`${sourceId}-${targetId}-${link.relationship_type}`)
                ? 3
                : link.status === "confirmed" ? 1 : 0;
            }}
            linkDirectionalParticleWidth={2}
            nodeCanvasObject={paintNode}
            backgroundColor="#07111b"
            cooldownTicks={80}
            onNodeHover={(node) => setHoveredNodeId(node?.id || null)}
            onNodeClick={(node) => {
              onSelectEvent(node.id);
              graphRef.current?.centerAt(node.x, node.y, 650);
              graphRef.current?.zoom(2.4, 650);
            }}
          />
        </div>
      </div>
    </section>
  );
}
