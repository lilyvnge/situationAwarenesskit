import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const CARTO_DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const DEFAULT_BASEMAPS = {
  dark: {
    label: "Dark",
    url: CARTO_DARK_TILES,
    options: {
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 19,
      subdomains: "abcd"
    }
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: ESRI_ATTRIBUTION,
      maxZoom: 19
    }
  },
  terrain: {
    label: "Terrain",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, and contributors",
      maxZoom: 19
    }
  }
};

function colorForClass(eventClass) {
  const palette = {
    military_kinetic: "#ff5a3d",
    political: "#f8b133",
    cyber_information: "#24c4c8",
    economic: "#7de37d",
    socio_cultural: "#f6d55c",
    indicator_warning: "#ff2d55",
    other: "#92a1b2"
  };
  return palette[eventClass] || "#92a1b2";
}

function symbolForClass(eventClass) {
  const symbols = {
    military_kinetic: "✦",
    political: "⚖",
    cyber_information: "⌁",
    economic: "◈",
    socio_cultural: "◎",
    indicator_warning: "!",
    other: "•",
    unknown: "?"
  };
  return symbols[eventClass] || "•";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function popupHtml(properties, canManageInterest, canBuildCampaign, canSurveille) {
  const interestAction = properties.isMarkedInterest ? "remove" : "mark";
  const interestLabel = properties.isMarkedInterest ? "Remove" : "Mark As Interest";
  return `
    <div class="event-popup-card">
      <div class="event-popup-topline">
        <span>${escapeHtml(properties.eventClass || "Event")}</span>
        <strong>${properties.isMarkedInterest ? "interest" : escapeHtml(properties.confidence || "n/a")}</strong>
      </div>
      <div class="event-popup-brief">${escapeHtml(properties.brief || "No event brief available.")}</div>
      <div class="event-popup-meta">${escapeHtml(properties.country || "Unknown area")} · ${escapeHtml(properties.startedAt || "")}</div>
      ${
        canManageInterest
          ? `<button class="map-interest-action" type="button" data-action="${interestAction}" data-event-id="${escapeHtml(properties.id)}">${interestLabel}</button>`
          : ""
      }
      ${
        canBuildCampaign
          ? `<button class="map-build-campaign-action" type="button" data-event-id="${escapeHtml(properties.id)}">View Campaign</button>`
          : ""
      }
      ${
        canSurveille
          ? `<button class="map-surveille-action" type="button" data-event-id="${escapeHtml(properties.id)}">Surveille</button>`
          : ""
      }
    </div>
  `;
}

function formatPopupDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function summarizeValues(values, fallback) {
  const unique = [...new Set(values.filter(Boolean))];
  if (!unique.length) return fallback;
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} +${unique.length - 3}`;
}

function campaignPopupHtml(details, heatPoints) {
  const eventCount = heatPoints.length || Number(details?.event_count || 0);
  const countries = summarizeValues(heatPoints.map((point) => point.country), "Multiple areas");
  const classes = summarizeValues(heatPoints.map((point) => point.eventClass), "Mixed event classes");
  const latest = formatPopupDate(details?.latest_event_at);

  return `
    <div class="event-popup-card campaign-popup-card">
      <div class="event-popup-topline">
        <span>Campaign ${details?.id ? `#${escapeHtml(details.id)}` : ""}</span>
        <strong>${escapeHtml(String(details?.status || "active").toUpperCase())}</strong>
      </div>
      <div class="event-popup-brief">${escapeHtml(details?.name || "Generated campaign")}</div>
      <div class="campaign-popup-grid">
        <span>Events</span><strong>${escapeHtml(eventCount)}</strong>
        <span>Area</span><strong>${escapeHtml(countries)}</strong>
        <span>Classes</span><strong>${escapeHtml(classes)}</strong>
        ${latest ? `<span>Latest</span><strong>${escapeHtml(latest)}</strong>` : ""}
      </div>
      ${details?.description ? `<div class="campaign-popup-description">${escapeHtml(details.description)}</div>` : ""}
    </div>
  `;
}

function markerIcon(properties, selected) {
  const color = selected ? "#f7fbff" : properties.color;
  const halo = selected ? "#24c4c8" : "#07111b";
  return L.divIcon({
    className: "event-marker-shell",
    html: `
      <span class="event-marker ${selected ? "selected" : ""}" style="--marker-color: ${color}; --marker-halo: ${halo};">
        <span>${escapeHtml(properties.symbol)}</span>
      </span>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
}

function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count >= 100 ? "large" : count >= 25 ? "medium" : "small";
  return L.divIcon({
    html: `<span>${count}</span>`,
    className: `event-cluster event-cluster-${size}`,
    iconSize: L.point(46, 46)
  });
}

function createGeographicHeatLayer() {
  const HeatLayer = L.Layer.extend({
    initialize(options = {}) {
      L.setOptions(this, options);
      this._points = [];
    },

    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "campaign-heatmap-canvas");
      this._canvas.style.pointerEvents = "none";
      this._canvas.style.position = "absolute";
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on("moveend zoomend resize viewreset", this._reset, this);
      this._reset();
    },

    onRemove(map) {
      map.off("moveend zoomend resize viewreset", this._reset, this);
      this._canvas?.remove();
      this._canvas = null;
      this._map = null;
    },

    setPoints(points) {
      this._points = points;
      this._reset();
    },

    _reset() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      const ratio = window.devicePixelRatio || 1;

      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x * ratio;
      this._canvas.height = size.y * ratio;
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;

      const ctx = this._canvas.getContext("2d");
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      this._draw(ctx);
    },

    _draw(ctx) {
      if (!this._points.length) return;
      const zoom = this._map.getZoom();
      const radius = Math.max(34, Math.min(118, 22 + zoom * 8));

      ctx.globalCompositeOperation = "lighter";
      this._points.forEach((point) => {
        const projected = this._map.latLngToContainerPoint([point.lat, point.lon]);
        const intensity = Math.max(0.35, Math.min(1, point.intensity || 0.65));
        const gradient = ctx.createRadialGradient(projected.x, projected.y, 0, projected.x, projected.y, radius);
        gradient.addColorStop(0, `rgba(255, 62, 48, ${0.46 * intensity})`);
        gradient.addColorStop(0.35, `rgba(255, 177, 51, ${0.3 * intensity})`);
        gradient.addColorStop(0.68, `rgba(36, 196, 200, ${0.16 * intensity})`);
        gradient.addColorStop(1, "rgba(36, 196, 200, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";
    }
  });

  return new HeatLayer();
}

function createBasemapLayer(layerConfig) {
  if (layerConfig.type === "wms") {
    return L.tileLayer.wms(layerConfig.url, layerConfig.options);
  }
  return L.tileLayer(layerConfig.url, layerConfig.options);
}

export default function MapPanel({
  events,
  selectedEventId,
  onSelectEvent,
  onInterestAction,
  onBuildCampaign,
  onSurveille,
  heatmapEventIds = [],
  heatmapDetails = null,
  heatmapOnly = false,
  basemaps = DEFAULT_BASEMAPS,
  initialBasemap = "dark",
  title = "Common Operational Posture"
}) {
  const [basemap, setBasemap] = useState(() => (basemaps[initialBasemap] ? initialBasemap : Object.keys(basemaps)[0]));
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const clusterRef = useRef(null);
  const heatLayerRef = useRef(null);
  const heatPointsRef = useRef([]);
  const markerByIdRef = useRef(new Map());
  const coordinateReadoutRef = useRef(null);
  const heatmapEventIdSet = useMemo(() => new Set(heatmapEventIds.map(Number)), [heatmapEventIds]);

  const features = useMemo(
    () =>
      events
        .filter((feature) => feature.geometry?.coordinates?.length === 2)
        .map((feature) => {
          const [lon, lat] = feature.geometry.coordinates;
          const properties = {
            id: feature.properties.id,
            eventClass: feature.properties.event_class,
            country: feature.properties.country || "",
            startedAt: feature.properties.started_at || "",
            confidence: feature.properties.ai_confidence || "",
            brief: feature.properties.description || "No event brief available.",
            isMarkedInterest: Boolean(feature.properties.is_marked_interest),
            severity: feature.properties.severity,
            color: colorForClass(feature.properties.event_class),
            symbol: symbolForClass(feature.properties.event_class)
          };
          return {
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties
          };
        }),
    [events]
  );

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;
    const initialLayer = basemaps[initialBasemap] || Object.values(basemaps)[0];

    const map = L.map(mapNodeRef.current, {
      center: [12, 24],
      zoom: 2,
      minZoom: 2,
      worldCopyJump: true,
      zoomControl: false
    });

    L.control.zoom({ position: "topright" }).addTo(map);
    const coordinateControl = L.control({ position: "bottomleft" });
    coordinateControl.onAdd = () => {
      const readout = L.DomUtil.create("div", "map-coordinate-readout");
      readout.textContent = "Lat -- · Lon --";
      coordinateReadoutRef.current = readout;
      L.DomEvent.disableClickPropagation(readout);
      return readout;
    };
    coordinateControl.addTo(map);

    map.on("mousemove", (event) => {
      if (!coordinateReadoutRef.current) return;
      coordinateReadoutRef.current.textContent = `Lat ${event.latlng.lat.toFixed(5)} · Lon ${event.latlng.lng.toFixed(5)}`;
    });
    map.on("mouseout", () => {
      if (!coordinateReadoutRef.current) return;
      coordinateReadoutRef.current.textContent = "Lat -- · Lon --";
    });

    if (initialLayer) {
      tileLayerRef.current = createBasemapLayer(initialLayer).addTo(map);
    }

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 46,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: clusterIcon
    }).addTo(map);

    mapRef.current = map;
    clusterRef.current = clusterGroup;
    heatLayerRef.current = createGeographicHeatLayer().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      clusterRef.current = null;
      heatLayerRef.current = null;
      markerByIdRef.current = new Map();
      coordinateReadoutRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerConfig = basemaps[basemap] || basemaps.dark || Object.values(basemaps)[0];
    if (!map || !layerConfig) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.removeFrom(map);
    }

    tileLayerRef.current = createBasemapLayer(layerConfig).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [basemap, basemaps]);

  useEffect(() => {
    const clusterGroup = clusterRef.current;
    if (!clusterGroup) return;
    const canManageInterest = typeof onInterestAction === "function";
    const canBuildCampaign = typeof onBuildCampaign === "function";
    const canSurveille = typeof onSurveille === "function";

    markerByIdRef.current = new Map();
    clusterGroup.clearLayers();
    if (heatmapOnly) return;

    const geoJsonLayer = L.geoJSON(
      {
        type: "FeatureCollection",
        features
      },
      {
        pointToLayer: (feature, latLng) => {
          const selected = feature.properties.id === selectedEventId;
          const marker = L.marker(latLng, {
            icon: markerIcon(feature.properties, selected),
            keyboard: true,
            title: feature.properties.brief
          });
          marker.bindPopup(popupHtml(feature.properties, canManageInterest, canBuildCampaign, canSurveille), {
            className: "event-leaflet-popup",
            closeButton: false,
            maxWidth: 320
          });
          marker.on("click", () => onSelectEvent(feature.properties.id));
          marker.on("popupopen", (event) => {
            const popupElement = event.popup.getElement();
            const interestButton = popupElement?.querySelector(".map-interest-action");
            const buildButton = popupElement?.querySelector(".map-build-campaign-action");
            const surveilleButton = popupElement?.querySelector(".map-surveille-action");
            interestButton?.addEventListener(
              "click",
              async (clickEvent) => {
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                interestButton.disabled = true;
                interestButton.textContent = interestButton.dataset.action === "mark" ? "Marking..." : "Removing...";
                try {
                  await onInterestAction?.(feature.properties.id, interestButton.dataset.action);
                  marker.closePopup();
                } catch (error) {
                  interestButton.disabled = false;
                  interestButton.textContent = "Retry";
                }
              },
              { once: true }
            );
            buildButton?.addEventListener(
              "click",
              (clickEvent) => {
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                onBuildCampaign?.(feature.properties.id);
              },
              { once: true }
            );
            surveilleButton?.addEventListener(
              "click",
              (clickEvent) => {
                clickEvent.preventDefault();
                clickEvent.stopPropagation();
                onSurveille?.(feature.properties.id);
              },
              { once: true }
            );
          });
          markerByIdRef.current.set(feature.properties.id, marker);
          return marker;
        }
      }
    );

    clusterGroup.addLayer(geoJsonLayer);
  }, [features, selectedEventId, onSelectEvent, onInterestAction, onBuildCampaign, onSurveille, heatmapOnly]);

  useEffect(() => {
    const heatLayer = heatLayerRef.current;
    if (!heatLayer) return;

    const heatPoints = features
      .filter((feature) => heatmapEventIdSet.has(Number(feature.properties.id)))
      .map((feature) => {
        const [lon, lat] = feature.geometry.coordinates;
        const severity = Number(feature.properties.severity || 3);
        return {
          lat,
          lon,
          intensity: Number.isFinite(severity) ? severity / 5 : 0.6,
          country: feature.properties.country,
          eventClass: feature.properties.eventClass,
          startedAt: feature.properties.startedAt
        };
      });
    heatPointsRef.current = heatPoints;
    heatLayer.setPoints(heatPoints);
  }, [features, heatmapEventIdSet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !heatmapOnly) return;

    const handleHeatClick = (event) => {
      if (!heatPointsRef.current.length) return;
      const clicked = map.latLngToContainerPoint(event.latlng);
      let nearest = null;
      let nearestDistance = Infinity;

      heatPointsRef.current.forEach((point) => {
        const projected = map.latLngToContainerPoint([point.lat, point.lon]);
        const distance = clicked.distanceTo(projected);
        if (distance < nearestDistance) {
          nearest = point;
          nearestDistance = distance;
        }
      });

      if (!nearest || nearestDistance > 95) return;
      L.popup({
        className: "event-leaflet-popup campaign-leaflet-popup",
        closeButton: false,
        maxWidth: 340
      })
        .setLatLng(event.latlng)
        .setContent(campaignPopupHtml(heatmapDetails, heatPointsRef.current))
        .openOn(map);
    };

    map.on("click", handleHeatClick);
    return () => map.off("click", handleHeatClick);
  }, [heatmapOnly, heatmapDetails]);

  useEffect(() => {
    const map = mapRef.current;
    const clusterGroup = clusterRef.current;
    if (!map || !clusterGroup || !selectedEventId || heatmapOnly) return;

    const marker = markerByIdRef.current.get(selectedEventId);
    if (!marker) return;

    clusterGroup.zoomToShowLayer(marker, () => {
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 6), {
        duration: 0.9,
        easeLinearity: 0.22
      });
      marker.openPopup();
    });
  }, [selectedEventId, features]);

  return (
    <section className="panel map-panel">
      <header className="panel-title-row">
        <h2>{title}</h2>
        <div className="map-panel-controls">
          <span className="mono">{features.length} geo-tagged events</span>
          <div className="map-layer-switch" aria-label="Map layer">
            {Object.entries(basemaps).map(([key, layer]) => (
              <button
                key={key}
                type="button"
                className={basemap === key ? "active" : ""}
                onClick={() => setBasemap(key)}
                aria-pressed={basemap === key}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div ref={mapNodeRef} className="map-canvas" />
    </section>
  );
}
