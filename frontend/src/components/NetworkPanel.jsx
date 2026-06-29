import { useEffect, useMemo, useRef } from "react";
import ForceGraph2D from "react-force-graph-2d";

function edgeColor(type) {
  const colors = {
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

function nodeLabel(node) {
  const country = node.country ? ` · ${node.country}` : "";
  const confidence = node.ai_confidence ? ` · ${node.ai_confidence}` : "";
  return `Event ${node.id} · ${node.event_class}${country}${confidence}`;
}

export default function NetworkPanel({ network, selectedEventId, onSelectEvent }) {
  const graphRef = useRef(null);

  const graphData = useMemo(() => {
    const nodes = network.nodes.map((n) => ({
      ...n,
      id: n.id
    }));
    const links = network.edges.map((e) => ({
      source: e.event_id_1,
      target: e.event_id_2,
      relationship_type: e.relationship_type,
      link_confidence: e.link_confidence
    }));
    return { nodes, links };
  }, [network]);

  const selectedNeighborhood = useMemo(() => {
    const connectedNodeIds = new Set();
    const connectedLinkKeys = new Set();

    if (!selectedEventId) {
      return { connectedNodeIds, connectedLinkKeys };
    }

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;
      if (sourceId === selectedEventId || targetId === selectedEventId) {
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
        connectedLinkKeys.add(`${sourceId}-${targetId}-${link.relationship_type}`);
      }
    });

    return { connectedNodeIds, connectedLinkKeys };
  }, [graphData.links, selectedEventId]);

  useEffect(() => {
    if (!selectedEventId || !graphRef.current) return;

    let attempts = 0;
    let timerId;

    const centerSelectedNode = () => {
      const selectedNode = graphData.nodes.find((node) => node.id === selectedEventId);
      if (selectedNode?.x !== undefined && selectedNode?.y !== undefined) {
        graphRef.current?.centerAt(selectedNode.x, selectedNode.y, 700);
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
    const color = nodeColor(node.event_class);
    const radius = selected ? 9 : connected ? 6.5 : 5;

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius + (selected ? 7 : 3), 0, 2 * Math.PI, false);
    ctx.fillStyle = selected ? "rgba(36, 196, 200, 0.22)" : "rgba(255, 255, 255, 0.08)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = selected ? "#f7fbff" : color;
    ctx.fill();
    ctx.lineWidth = selected ? 2.4 : 1.2;
    ctx.strokeStyle = selected ? "#24c4c8" : "rgba(5, 11, 18, 0.9)";
    ctx.stroke();

    if (selected || connected) {
      const label = `#${node.id}`;
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
        <h2>Link Analysis Graph</h2>
        <span className="mono">
          {graphData.nodes.length} nodes · {graphData.links.length} links
        </span>
      </header>
      <div className="network-canvas">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeRelSize={5}
          nodeLabel={nodeLabel}
          linkLabel={(l) => `${l.relationship_type} (${Number(l.link_confidence || 0).toFixed(2)})`}
          linkColor={(l) => edgeColor(l.relationship_type)}
          linkWidth={(link) => {
            const sourceId = typeof link.source === "object" ? link.source.id : link.source;
            const targetId = typeof link.target === "object" ? link.target.id : link.target;
            return selectedNeighborhood.connectedLinkKeys.has(`${sourceId}-${targetId}-${link.relationship_type}`)
              ? 3
              : 1.2;
          }}
          linkDirectionalParticles={(link) => {
            const sourceId = typeof link.source === "object" ? link.source.id : link.source;
            const targetId = typeof link.target === "object" ? link.target.id : link.target;
            return selectedNeighborhood.connectedLinkKeys.has(`${sourceId}-${targetId}-${link.relationship_type}`)
              ? 2
              : 0;
          }}
          linkDirectionalParticleWidth={2}
          nodeCanvasObject={paintNode}
          backgroundColor="#07111b"
          cooldownTicks={80}
          onNodeClick={(node) => {
            onSelectEvent(node.id);
            graphRef.current?.centerAt(node.x, node.y, 650);
            graphRef.current?.zoom(2.4, 650);
          }}
        />
      </div>
    </section>
  );
}
