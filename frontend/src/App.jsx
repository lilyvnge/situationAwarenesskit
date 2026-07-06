import { useEffect, useMemo, useState } from "react";
import {
  fetchCampaignEvents,
  fetchCampaignNetwork,
  fetchCampaigns,
  fetchEventDetail,
  fetchEvents,
  fetchNetwork,
  markEventAsInterest,
  removeEventFromMap,
  searchMaxarImages
} from "./api";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";
import BrandMark from "./components/BrandMark";
import ControlBar from "./components/ControlBar";
import EventDetailPanel from "./components/EventDetailPanel";
import MapPanel from "./components/MapPanel";
import NetworkPanel from "./components/NetworkPanel";
import PortalPanel from "./components/PortalPanel";
import TimelinePanel from "./components/TimelinePanel";
import UserManagementPanel from "./components/UserManagementPanel";

const MAXAR_API_KEY = import.meta.env.VITE_MAXAR_API_KEY || "";
const MAXAR_TILE_URL = import.meta.env.VITE_MAXAR_TILE_URL || "";
const MAXAR_WMS_URL = import.meta.env.VITE_MAXAR_WMS_URL || "https://api.maxar.com/streaming/v1/ogc/wms";
const MAXAR_WMS_LAYERS = import.meta.env.VITE_MAXAR_WMS_LAYERS || "Maxar:Imagery";

const SURVEILLE_FALLBACK_BASEMAPS = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
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

function resolveMaxarTileUrl() {
  if (!MAXAR_TILE_URL) return "";
  return MAXAR_TILE_URL
    .replaceAll("{apiKey}", encodeURIComponent(MAXAR_API_KEY))
    .replaceAll("{API_KEY}", encodeURIComponent(MAXAR_API_KEY));
}

function toUtcSecondIso(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildMaxarSearchParams(eventDetail) {
  const lat = Number(eventDetail?.latitude);
  const lon = Number(eventDetail?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const halfSpan = 0.12;
  const centerDate = eventDetail?.started_at ? new Date(eventDetail.started_at) : new Date();
  const safeCenterDate = Number.isNaN(centerDate.getTime()) ? new Date() : centerDate;
  const start = new Date(safeCenterDate);
  const end = new Date(safeCenterDate);
  start.setUTCDate(start.getUTCDate() - 30);
  end.setUTCDate(end.getUTCDate() + 30);

  return {
    bbox: [
      Math.max(-180, lon - halfSpan),
      Math.max(-90, lat - halfSpan),
      Math.min(180, lon + halfSpan),
      Math.min(90, lat + halfSpan)
    ].map((value) => value.toFixed(6)).join(","),
    startDate: toUtcSecondIso(start),
    endDate: toUtcSecondIso(end),
    limit: 20,
    scope: "Event time ± 30 days"
  };
}

function extractMaxarItems(payload) {
  const collection =
    (Array.isArray(payload?.features) && payload.features) ||
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.results) && payload.results) ||
    (Array.isArray(payload?.data) && payload.data) ||
    [];

  return collection.map((item, index) => {
    const properties = item.properties || item;
    const assets = item.assets || {};
    const links = Array.isArray(item.links) ? item.links : [];
    const browseAsset = assets.browse?.href || assets.thumbnail?.href || assets.preview?.href;
    const cloudAsset = assets["cloud-cover"]?.href || assets.cloudCover?.href;
    const orderLinks = links.filter((link) => String(link.rel || "").startsWith("order-"));
    return {
      id: item.id || properties.id || properties.catalog_id || properties.catalogId || properties.image_id || `image-${index}`,
      collection: item.collection || properties.collection || properties.product_type,
      acquired:
        properties.acquisitionDate ||
        properties.acquired ||
        properties.datetime ||
        properties.collectTime ||
        properties.collection_time ||
        properties.collect_time_start ||
        properties.timestamp,
      cloudCover:
        properties["eo:cloud_cover"] ??
        properties.cloudCover ??
        properties.cloud_cover ??
        properties.cloudCoverPercentage ??
        properties.cloud_cover_percentage,
      sensor:
        properties.platform ||
        properties.sensor ||
        properties.constellation ||
        properties.instrument ||
        properties.source,
      resolution: properties.resolution || properties.gsd || properties.groundSampleDistance || properties.ground_sample_distance,
      offNadir:
        properties["view:off_nadir"] ??
        properties.offNadirAngle ??
        properties.off_nadir_angle ??
        properties.offNadir ??
        properties.off_nadir_avg,
      sunElevation: properties["view:sun_elevation"] ?? properties.sun_elevation ?? properties["view:sun_elevation_max"],
      sunAzimuth: properties["view:sun_azimuth"] ?? properties.sun_azimuth,
      footprintBbox: Array.isArray(item.bbox) ? item.bbox.join(", ") : "",
      browseHref: browseAsset,
      cloudCoverHref: cloudAsset,
      orderLinks,
      raw: properties
    };
  });
}

function formatCatalogValue(value) {
  return value || value === 0 ? String(value) : "n/a";
}

function formatCatalogNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return formatCatalogValue(value);
  return number.toFixed(digits);
}

function formatCampaignDate(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function compactCampaignList(values, limit = 4) {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!items.length) return "n/a";
  const visible = items.slice(0, limit).join(", ");
  return items.length > limit ? `${visible} +${items.length - limit}` : visible;
}

function eventLocation(properties) {
  return [properties?.city, properties?.state || properties?.admin1, properties?.country].filter(Boolean).join(", ") || "n/a";
}

function CampaignSignalBlock({ label, values }) {
  const items = Array.isArray(values) ? [...new Set(values.filter(Boolean))] : [];
  return (
    <div className="campaign-signal-block">
      <span>{label}</span>
      {items.length ? (
        <div className="campaign-chip-list">
          {items.slice(0, 10).map((item, index) => (
            <strong key={`${label}-${item}-${index}`}>{item}</strong>
          ))}
          {items.length > 10 && <strong>+{items.length - 10}</strong>}
        </div>
      ) : (
        <em>n/a</em>
      )}
    </div>
  );
}

function CampaignSummaryPanel({ campaign, events, selectedEventId, onSelectEvent }) {
  const eventRows = events.map((feature) => feature.properties || {});
  const topEvents = eventRows.slice(0, 10);
  const actorNames = [
    ...(campaign?.initiator_names || []),
    ...(campaign?.target_names || [])
  ].filter(Boolean);

  return (
    <div className="panel campaign-summary-panel">
      <header className="panel-title-row">
        <div>
          <h2>Campaign Summary</h2>
          <span className="mono">{campaign ? `Campaign #${campaign.id}` : "No campaign selected"}</span>
        </div>
        {campaign?.status && <span className={`status-pill status-${campaign.status}`}>{campaign.status}</span>}
      </header>

      {!campaign ? (
        <div className="campaign-summary-scroll">
          <p className="empty-note">Select an Auto Campaign to view linked event context.</p>
        </div>
      ) : (
        <div className="campaign-summary-scroll">
          <div className="campaign-summary-copy">
            <strong>{campaign.name}</strong>
            <p>{campaign.description || "Automated campaign cluster from linked events."}</p>
          </div>

          <div className="campaign-metric-grid">
            <div>
              <span>Events</span>
              <strong>{campaign.event_count ?? eventRows.length}</strong>
            </div>
            <div>
              <span>Severity</span>
              <strong>{campaign.max_severity ? `${campaign.max_severity}/5` : "n/a"}</strong>
            </div>
            <div>
              <span>First Seen</span>
              <strong>{formatCampaignDate(campaign.first_event_at)}</strong>
            </div>
            <div>
              <span>Latest Seen</span>
              <strong>{formatCampaignDate(campaign.latest_event_at)}</strong>
            </div>
          </div>

          <div className="campaign-signal-grid">
            <CampaignSignalBlock label="Actors" values={actorNames} />
            <CampaignSignalBlock label="Countries" values={campaign.countries} />
            <CampaignSignalBlock label="Locations" values={campaign.locations} />
            <CampaignSignalBlock label="Classes" values={campaign.event_classes} />
            <CampaignSignalBlock label="Weapons" values={[...(campaign.weapon_systems || []), ...(campaign.weapon_categories || [])]} />
          </div>

          <div className="campaign-linked-events">
            <div className="campaign-linked-events-title">
              <strong>Linked Events</strong>
              <span className="mono">{eventRows.length} loaded</span>
            </div>
            {topEvents.map((properties) => (
              <button
                key={properties.id}
                type="button"
                className={properties.id === selectedEventId ? "active" : ""}
                onClick={() => onSelectEvent?.(properties.id)}
              >
                <span className="mono">#{properties.id} · {formatCampaignDate(properties.started_at)}</span>
                <strong>{properties.event_class || "unknown"} · {eventLocation(properties)}</strong>
                <small>
                  {[properties.actor_initiator_name, properties.actor_target_name].filter(Boolean).join(" -> ") || "Actors n/a"}
                </small>
              </button>
            ))}
            {!eventRows.length && <p className="empty-note">Campaign event details are loading.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const route =
    window.location.pathname === "/portal"
      ? "portal"
      : window.location.pathname === "/campaign"
        ? "campaign"
        : window.location.pathname === "/surveille"
          ? "surveille"
          : "dashboard";

  if (route === "portal") {
    return (
      <ProtectedRoute allowedRoles={["submitter"]} workspace="portal">
        <PortalPage />
      </ProtectedRoute>
    );
  }

  if (route === "campaign") {
    return (
      <ProtectedRoute allowedRoles={["admin", "analyst"]} workspace="dashboard">
        <CampaignPage />
      </ProtectedRoute>
    );
  }

  if (route === "surveille") {
    return (
      <ProtectedRoute allowedRoles={["admin", "analyst", "viewer"]} workspace="dashboard">
        <SurveillePage />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["admin", "analyst", "viewer"]} workspace="dashboard">
      <DashboardPage />
    </ProtectedRoute>
  );
}

function useThemePreference() {
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem("intel_theme");
    if (storedTheme) return storedTheme;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("intel_theme", theme);
  }, [theme]);

  return [theme, setTheme];
}

function DashboardPage() {
  const auth = useAuth();
  const [theme, setTheme] = useThemePreference();
  const canUseAnalysisPanels = auth.user?.role === "admin" || auth.user?.role === "analyst";
  const [filters, setFilters] = useState({
    eventClass: "",
    country: "",
    region: ""
  });
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [eventDetail, setEventDetail] = useState(null);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCore = async () => {
    setLoading(true);
    setError(null);
    try {
      const eventCollection = await fetchEvents({
        eventClass: filters.eventClass,
        country: filters.country?.trim() || "",
        region: filters.region,
        limit: 600
      });
      setEvents(eventCollection.features || []);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCore();
  }, []);

  useEffect(() => {
    void loadCore();
  }, [filters.eventClass, filters.region]);

  useEffect(() => {
    if (!selectedEventId) return;
    let canceled = false;
    fetchEventDetail(selectedEventId)
      .then((data) => {
        if (!canceled) setEventDetail(data);
      })
      .catch(() => {
        if (!canceled) setEventDetail(null);
      });
    return () => {
      canceled = true;
    };
  }, [selectedEventId]);

  const refreshSelectedEvent = async () => {
    if (!selectedEventId) return;
    const detail = await fetchEventDetail(selectedEventId);
    setEventDetail(detail);
  };

  const handleMapInterestAction = async (eventId, action) => {
    if (action === "mark") {
      await markEventAsInterest(eventId, "Marked as interest from map popup");
      await loadCore();
      if (selectedEventId === eventId) {
        const detail = await fetchEventDetail(eventId);
        setEventDetail(detail);
      }
      return;
    }

    await removeEventFromMap(eventId, "Removed from map popup");
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
      setEventDetail(null);
    }
    await loadCore();
  };

  const filteredEvents = useMemo(() => {
    const countryFilter = filters.country.trim().toLowerCase();
    if (!countryFilter) return events;
    return events.filter((f) => String(f.properties.country || "").toLowerCase().includes(countryFilter));
  }, [events, filters.country]);
  const canManageMapInterest = auth.user?.role === "admin" || auth.user?.role === "analyst";

  return (
    <div className={`app-shell ${canUseAnalysisPanels ? "" : "viewer-shell"}`}>
      <ControlBar
        filters={filters}
        setFilters={setFilters}
        onRefresh={loadCore}
        loading={loading}
        user={auth.user}
        onLogout={auth.logout}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        onManageUsers={() => setShowUserManagement((current) => !current)}
      />
      {error && <div className="error-banner">{error}</div>}
      {auth.user?.role === "admin" && showUserManagement && (
        <UserManagementPanel currentUser={auth.user} onClose={() => setShowUserManagement(false)} />
      )}
      <main className={`dashboard-grid ${canUseAnalysisPanels ? "" : "viewer-dashboard-grid"}`}>
        <MapPanel
          events={filteredEvents}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          onInterestAction={canManageMapInterest ? handleMapInterestAction : undefined}
          onBuildCampaign={
            canUseAnalysisPanels ? (eventId) => { window.location.href = `/campaign?event=${eventId}`; } : undefined
          }
          onSurveille={(eventId) => { window.location.href = `/surveille?event=${eventId}`; }}
        />
        {canUseAnalysisPanels && (
          <aside className="sidebar-stack">
            <TimelinePanel events={filteredEvents} onSelectEvent={setSelectedEventId} />
          </aside>
        )}
        <EventDetailPanel eventDetail={eventDetail} onEventUpdated={refreshSelectedEvent} />
      </main>
    </div>
  );
}

function SurveillePage() {
  const auth = useAuth();
  const [theme, setTheme] = useThemePreference();
  const initialEventId = Number(new URLSearchParams(window.location.search).get("event")) || null;
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [eventDetail, setEventDetail] = useState(null);
  const [maxarSearchParams, setMaxarSearchParams] = useState(null);
  const [maxarItems, setMaxarItems] = useState([]);
  const [maxarLoading, setMaxarLoading] = useState(false);
  const [maxarError, setMaxarError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const maxarTileUrl = resolveMaxarTileUrl();
  const maxarWmsEnabled = Boolean(MAXAR_API_KEY && MAXAR_WMS_URL && MAXAR_WMS_LAYERS);
  const surveilleBasemaps = useMemo(() => {
    if (maxarWmsEnabled) {
      return {
        maxar: {
          type: "wms",
          label: "Maxar",
          url: MAXAR_WMS_URL,
          options: {
            layers: MAXAR_WMS_LAYERS,
            format: "image/png",
            transparent: false,
            version: "1.3.0",
            maxar_api_key: MAXAR_API_KEY,
            attribution: "Imagery &copy; Maxar"
          }
        },
        ...SURVEILLE_FALLBACK_BASEMAPS
      };
    }
    if (!maxarTileUrl) return SURVEILLE_FALLBACK_BASEMAPS;
    return {
      maxar: {
        label: "Maxar",
        url: maxarTileUrl,
        options: {
          attribution: "Imagery &copy; Maxar",
          maxZoom: 20
        }
      },
      ...SURVEILLE_FALLBACK_BASEMAPS
    };
  }, [maxarTileUrl, maxarWmsEnabled]);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const eventCollection = await fetchEvents({ limit: 600 });
      setEvents(eventCollection.features || []);
      if (!selectedEventId && eventCollection.features?.[0]?.properties?.id) {
        setSelectedEventId(eventCollection.features[0].properties.id);
      }
    } catch (err) {
      setError(err.message || "Failed to load Surveille map.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(selectedEventId));
    window.history.replaceState({}, "", url);

    let canceled = false;
    fetchEventDetail(selectedEventId)
      .then((data) => {
        if (!canceled) setEventDetail(data);
      })
      .catch(() => {
        if (!canceled) setEventDetail(null);
      });
    return () => {
      canceled = true;
    };
  }, [selectedEventId]);

  useEffect(() => {
    const params = buildMaxarSearchParams(eventDetail);
    setMaxarSearchParams(params);
    setMaxarItems([]);
    setMaxarError("");
    if (!params) return;

    let canceled = false;
    setMaxarLoading(true);
    searchMaxarImages(params)
      .then((payload) => {
        if (canceled) return;
        const dateMatchedItems = extractMaxarItems(payload);
        if (dateMatchedItems.length) {
          setMaxarItems(dateMatchedItems);
          return null;
        }
        const locationOnlyParams = {
          bbox: params.bbox,
          limit: params.limit,
          scope: "All available imagery near location"
        };
        setMaxarSearchParams(locationOnlyParams);
        return searchMaxarImages(locationOnlyParams).then((fallbackPayload) => {
          if (!canceled) setMaxarItems(extractMaxarItems(fallbackPayload));
        });
      })
      .catch((err) => {
        if (!canceled) setMaxarError(err.message || "Unable to search Maxar catalog.");
      })
      .finally(() => {
        if (!canceled) setMaxarLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [eventDetail]);

  const refreshSelectedEvent = async () => {
    if (!selectedEventId) return;
    const detail = await fetchEventDetail(selectedEventId);
    setEventDetail(detail);
  };

  return (
    <div className="app-shell surveille-shell">
      <header className="campaign-header surveille-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <span className="login-kicker">Maxar Surveille</span>
            <h1>Surveille</h1>
            <p>Inspect selected events against high-context basemap imagery.</p>
          </div>
        </div>
        <div className="control-account">
          <div className="account-copy">
            <span className={`role-pill role-${auth.user?.role || "viewer"}`}>{auth.user?.role || "viewer"}</span>
            <span className="mono">{auth.user?.username}</span>
          </div>
          <button className="theme-toggle" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="ghost-button" type="button" onClick={loadEvents} disabled={loading}>
            Refresh
          </button>
          <button className="ghost-button" type="button" onClick={() => { window.location.href = "/"; }}>
            Dashboard
          </button>
          <button className="ghost-button" type="button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      </header>
      {!maxarTileUrl && !maxarWmsEnabled && (
        <div className="surveille-config-note">
          Set <span className="mono">VITE_MAXAR_API_KEY</span> for Maxar WMS, or set <span className="mono">VITE_MAXAR_TILE_URL</span> with a tile template using <span className="mono">{"{z}/{x}/{y}"}</span> and optional <span className="mono">{"{apiKey}"}</span>.
        </div>
      )}
      {error && <div className="error-banner">{error}</div>}
      <main className="surveille-grid">
        <MapPanel
          title="Surveille Map"
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          basemaps={surveilleBasemaps}
          initialBasemap={maxarWmsEnabled || maxarTileUrl ? "maxar" : "satellite"}
        />
        <MaxarCatalogPanel
          eventDetail={eventDetail}
          items={maxarItems}
          loading={maxarLoading}
          error={maxarError}
          searchParams={maxarSearchParams}
        />
        <EventDetailPanel eventDetail={eventDetail} onEventUpdated={refreshSelectedEvent} />
      </main>
    </div>
  );
}

function MaxarCatalogPanel({ eventDetail, items, loading, error, searchParams }) {
  return (
    <section className="panel maxar-catalog-panel">
      <header className="panel-title-row">
        <div>
          <h2>Maxar Catalog</h2>
          <span className="mono">{eventDetail ? `Event #${eventDetail.id}` : "Select an event"}</span>
        </div>
        <span className="mono">{loading ? "Searching..." : `${items.length} images`}</span>
      </header>

      {!eventDetail && <p className="empty-note">Select an event to search available imagery.</p>}
      {eventDetail && !searchParams && <p className="empty-note">This event needs latitude and longitude before catalog search can run.</p>}
      {searchParams && (
        <div className="maxar-search-window">
          <span>scope</span><strong>{searchParams.scope || "Event search"}</strong>
          <span>bbox</span><strong>{searchParams.bbox}</strong>
          {searchParams.startDate && <><span>start</span><strong>{searchParams.startDate}</strong></>}
          {searchParams.endDate && <><span>end</span><strong>{searchParams.endDate}</strong></>}
        </div>
      )}
      {error && <div className="login-error">{error}</div>}
      {!loading && searchParams && !error && !items.length && (
        <p className="empty-note">No matching imagery returned for this event window.</p>
      )}
      <div className="maxar-result-list">
        {items.map((item) => (
          <article className="maxar-result-row" key={item.id}>
            <div>
              <strong>{item.id}</strong>
              <span className="mono">{formatCatalogValue(item.collection)} · {formatCatalogValue(item.acquired)}</span>
            </div>
            <div className="maxar-result-meta">
              <span>Sensor {formatCatalogValue(item.sensor)}</span>
              <span>Cloud {formatCatalogNumber(item.cloudCover)}%</span>
              <span>GSD {formatCatalogNumber(item.resolution, 2)}m</span>
              <span>Off-nadir {formatCatalogNumber(item.offNadir)}°</span>
              <span>Sun elev {formatCatalogNumber(item.sunElevation)}°</span>
            </div>
            {item.footprintBbox && (
              <div className="maxar-footprint-row">
                <span>Footprint bbox</span>
                <strong>{item.footprintBbox}</strong>
              </div>
            )}
            <div className="maxar-link-row">
              {item.browseHref && (
                <a href={item.browseHref} target="_blank" rel="noreferrer">
                  Browse
                </a>
              )}
              {item.cloudCoverHref && (
                <a href={item.cloudCoverHref} target="_blank" rel="noreferrer">
                  Cloud Mask
                </a>
              )}
              {item.orderLinks.slice(0, 3).map((link) => (
                <a key={`${item.id}-${link.rel}`} href={link.href} target="_blank" rel="noreferrer">
                  {String(link.rel || "order").replace("order-", "Order ")}
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CampaignPage() {
  const auth = useAuth();
  const [theme, setTheme] = useThemePreference();
  const initialEventId = Number(new URLSearchParams(window.location.search).get("event")) || null;
  const initialCampaignId = Number(new URLSearchParams(window.location.search).get("campaign")) || null;
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId);
  const [events, setEvents] = useState([]);
  const [network, setNetwork] = useState({ nodes: [], edges: [] });
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const heatmapEventIds = selectedCampaign?.event_ids || [];

  const loadCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const campaignRows = await fetchCampaigns();
      setCampaigns(campaignRows);

      const campaignFromEvent = initialEventId
        ? campaignRows.find((campaign) => campaign.event_ids?.map(Number).includes(initialEventId))
        : null;
      const nextCampaignId = selectedCampaignId || campaignFromEvent?.id || campaignRows[0]?.id || null;
      setSelectedCampaignId(nextCampaignId);

      if (nextCampaignId) {
        const [eventCollection, networkData] = await Promise.all([
          fetchCampaignEvents(nextCampaignId),
          fetchCampaignNetwork(nextCampaignId)
        ]);
        setEvents(eventCollection.features || []);
        setNetwork(networkData);
        if (!selectedEventId && eventCollection.features?.[0]?.properties?.id) {
          setSelectedEventId(eventCollection.features[0].properties.id);
        }
      } else {
        const [eventCollection, networkData] = await Promise.all([
          fetchEvents({ limit: 600 }),
          fetchNetwork(initialEventId || undefined)
        ]);
        setEvents(eventCollection.features || []);
        setNetwork(networkData);
      }
    } catch (err) {
      setError(err.message || "Failed to load campaign builder.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    let canceled = false;
    const url = new URL(window.location.href);
    url.searchParams.set("campaign", String(selectedCampaignId));
    if (selectedEventId) url.searchParams.set("event", String(selectedEventId));
    window.history.replaceState({}, "", url);
    setLoading(true);
    Promise.all([fetchCampaignEvents(selectedCampaignId), fetchCampaignNetwork(selectedCampaignId)])
      .then(([eventCollection, networkData]) => {
        if (canceled) return;
        setEvents(eventCollection.features || []);
        setNetwork(networkData);
        if (!selectedEventId && eventCollection.features?.[0]?.properties?.id) {
          setSelectedEventId(eventCollection.features[0].properties.id);
        }
      })
      .catch((err) => {
        if (!canceled) setError(err.message || "Failed to load campaign.");
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [selectedCampaignId]);

  useEffect(() => {
    if (!selectedEventId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("event", String(selectedEventId));
    window.history.replaceState({}, "", url);
  }, [selectedEventId]);

  return (
    <div className="app-shell campaign-shell">
      <header className="campaign-header">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <span className="login-kicker">Campaign Builder</span>
            <h1>Campaign Link Analysis</h1>
            <p>View campaign context from event geography and linkage patterns.</p>
          </div>
        </div>
        <div className="control-account">
          <div className="account-copy">
            <span className={`role-pill role-${auth.user?.role || "analyst"}`}>{auth.user?.role || "analyst"}</span>
            <span className="mono">{auth.user?.username}</span>
          </div>
          <button className="theme-toggle" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="ghost-button" type="button" onClick={loadCampaigns} disabled={loading}>
            Refresh
          </button>
          <button className="ghost-button" type="button" onClick={() => { window.location.href = "/"; }}>
            Dashboard
          </button>
          <button className="ghost-button" type="button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      </header>
      {error && <div className="error-banner">{error}</div>}
      <main className="campaign-grid">
        <MapPanel
          events={events}
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
          heatmapEventIds={heatmapEventIds}
          heatmapDetails={selectedCampaign}
          heatmapOnly
        />
        <section className="campaign-side-panel">
          <div className="panel campaign-list-panel">
            <header className="panel-title-row">
              <h2>Campaigns</h2>
              <span className="mono">{campaigns.length} active</span>
            </header>
            <div className="campaign-list">
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  className={campaign.id === selectedCampaignId ? "active" : ""}
                  onClick={() => {
                    setSelectedCampaignId(campaign.id);
                    setSelectedEventId(campaign.event_ids?.[0] || null);
                  }}
                >
                  <strong>{campaign.name}</strong>
                  <span>{campaign.event_count} events · {campaign.status}</span>
                </button>
              ))}
              {!campaigns.length && <p className="empty-note">No campaigns have been generated yet.</p>}
            </div>
          </div>
          {loading && <div className="campaign-loading mono">Loading campaign context...</div>}
          <CampaignSummaryPanel
            campaign={selectedCampaign}
            events={events}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
          />
        </section>
        <section className="campaign-network-section">
          <NetworkPanel network={network} selectedEventId={selectedEventId} onSelectEvent={setSelectedEventId} />
        </section>
      </main>
    </div>
  );
}

function PortalPage() {
  const auth = useAuth();
  const [theme, setTheme] = useThemePreference();

  return (
    <div className="app-shell portal-shell">
      <header className="portal-header">
        <div className="brand-lockup portal-brand">
          <BrandMark size="large" />
          <div>
            <span className="login-kicker">INT Intake</span>
            <h1>Observation Portal</h1>
            <p>Submit field observations into the INT ingestion workflow without dashboard access.</p>
          </div>
        </div>
        <div className="control-account">
          <div className="account-copy">
            <span className={`role-pill role-${auth.user?.role || "submitter"}`}>{auth.user?.role || "submitter"}</span>
            {/* <span className="mono">{auth.user?.username}</span> */}
          </div>
          <button className="theme-toggle" type="button" onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button className="ghost-button" type="button" onClick={auth.logout}>
            Logout
          </button>
        </div>
      </header>
      <PortalPanel />
    </div>
  );
}
