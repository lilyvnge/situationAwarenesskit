import BrandMark from "./BrandMark";

const EVENT_CLASSES = [
  { label: "All", value: "" },
  { label: "Military", value: "military_kinetic" },
  { label: "Political", value: "political" },
  { label: "Cyber/Info", value: "cyber_information" },
  { label: "Indicator", value: "indicator_warning" },
  { label: "Economic", value: "economic" },
  { label: "Socio-Cultural", value: "socio_cultural" }
];

const REGIONS = [
  "North Africa",
  "West Africa",
  "Central Africa",
  "East Africa",
  "Southern Africa",
  "Western Asia (Middle East)",
  "Central Asia",
  "South Asia",
  "East Asia",
  "Southeast Asia",
  "Northern Europe",
  "Western Europe",
  "Eastern Europe",
  "Southern Europe",
  "Northern America",
  "Central America",
  "Caribbean",
  "South America",
  "Australia & New Zealand",
  "Melanesia",
  "Micronesia & Polynesia"
];

const ROLE_LABELS = {
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer"
};

export default function ControlBar({
  filters,
  setFilters,
  onRefresh,
  loading,
  user,
  onLogout,
  theme,
  onToggleTheme,
  onManageUsers
}) {
  const canReview = user?.role === "admin" || user?.role === "analyst";

  return (
    <section className="control-bar">
      <div className="control-left">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <h1>Situation Awareness Kit</h1>
            <p>{canReview ? "Analyst workspace with review-capable access." : "Read-only event awareness workspace."}</p>
          </div>
        </div>
      </div>
      <div className="control-right">
        <label>
          Event Class
          <select
            value={filters.eventClass}
            onChange={(e) => setFilters((prev) => ({ ...prev, eventClass: e.target.value }))}
          >
            {EVENT_CLASSES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Country
          <input
            placeholder="e.g. Ukraine"
            value={filters.country}
            onChange={(e) => setFilters((prev) => ({ ...prev, country: e.target.value }))}
          />
        </label>
        <label>
          Region
          <select
            value={filters.region}
            onChange={(e) => setFilters((prev) => ({ ...prev, region: e.target.value }))}
          >
            <option value="">All Regions</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Feed"}
        </button>
        <button className="theme-toggle" type="button" onClick={onToggleTheme}>
          {theme === "dark" ? "Light" : "Dark"}
        </button>
        {user?.role === "admin" && (
          <button className="ghost-button" type="button" onClick={onManageUsers}>
            Users
          </button>
        )}
        <div className="control-account">
          <div className="account-copy">
            <span className={`role-pill role-${user?.role || "viewer"}`}>{ROLE_LABELS[user?.role] || "Viewer"}</span>
            {/* <span className="mono">{user?.username}</span> */}
          </div>
          <button className="ghost-button" type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
      {user?.role === "admin" && <span className="admin-chip">User and policy controls enabled</span>}
    </section>
  );
}
