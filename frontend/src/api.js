const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const TOKEN_STORAGE_PREFIX = "intel_auth_token";

export function getCurrentWorkspace() {
  return window.location.pathname === "/portal" ? "portal" : "dashboard";
}

function tokenStorageKey(workspace = getCurrentWorkspace()) {
  return `${TOKEN_STORAGE_PREFIX}_${workspace}`;
}

export function getStoredToken(workspace = getCurrentWorkspace()) {
  return localStorage.getItem(tokenStorageKey(workspace));
}

export function storeToken(token, workspace = getCurrentWorkspace()) {
  localStorage.setItem(tokenStorageKey(workspace), token);
}

export function clearStoredToken(workspace = getCurrentWorkspace()) {
  localStorage.removeItem(tokenStorageKey(workspace));
}

async function apiRequest(path, options = {}) {
  const { workspace: requestedWorkspace, ...fetchOptions } = options;
  const workspace = requestedWorkspace || getCurrentWorkspace();
  const token = getStoredToken(workspace);
  const headers = {
    ...(fetchOptions.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers
  });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = errorBody.detail || `API error ${res.status} for ${path}`;
    if (res.status === 401) {
      clearStoredToken(workspace);
      window.dispatchEvent(new CustomEvent("auth:expired", { detail: { workspace } }));
    }
    throw new Error(message);
  }
  return res.json();
}

async function apiGet(path) {
  return apiRequest(path);
}

export async function login(username, password, workspace = "dashboard") {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    workspace,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, workspace })
  });
  storeToken(data.access_token, workspace);
  return data;
}

export async function fetchCurrentUser(workspace = getCurrentWorkspace()) {
  return apiRequest("/auth/me", { workspace });
}

export async function fetchEvents(filters = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit || 500));
  if (filters.eventClass) params.set("event_class", filters.eventClass);
  if (filters.country) params.set("country", filters.country);
  if (filters.region) params.set("region", filters.region);
  if (filters.status) params.set("status", filters.status);
  return apiGet(`/events?${params.toString()}`);
}

export async function fetchEventDetail(eventId) {
  return apiGet(`/events/${eventId}`);
}

export async function fetchNetwork(eventId) {
  const suffix = eventId ? `?event_id=${eventId}&limit=300` : "?limit=300";
  return apiGet(`/events/network${suffix}`);
}

export async function fetchCampaigns() {
  return apiGet("/campaigns?limit=100");
}

export async function fetchCampaignEvents(campaignId) {
  return apiGet(`/campaigns/${campaignId}/events`);
}

export async function fetchCampaignNetwork(campaignId) {
  return apiGet(`/campaigns/${campaignId}/network`);
}

export async function runEventLinking() {
  return apiRequest("/campaigns/link-events", {
    method: "POST"
  });
}

export async function searchMaxarImages({ bbox, startDate, endDate, limit = 10 }) {
  const params = new URLSearchParams();
  params.set("bbox", bbox);
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  params.set("limit", String(limit));
  return apiGet(`/api/maxar/images/search?${params.toString()}`);
}

export async function fetchUsers() {
  return apiGet("/admin/users");
}

export async function createUser(payload) {
  return apiRequest("/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateUser(username, payload) {
  return apiRequest(`/admin/users/${encodeURIComponent(username)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deleteUser(username) {
  return apiRequest(`/admin/users/${encodeURIComponent(username)}`, {
    method: "DELETE"
  });
}

export async function updateEventStatus(eventId, status, notes = "") {
  return apiRequest(`/events/${eventId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, notes })
  });
}

export async function updateEventDetails(eventId, payload) {
  return apiRequest(`/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function markEventAsInterest(eventId, notes = "") {
  return apiRequest(`/events/${eventId}/map-interest`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes })
  });
}

export async function removeEventFromMap(eventId, notes = "") {
  return apiRequest(`/events/${eventId}/map-remove`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes })
  });
}

export async function updateEventLinkStatus(eventId, linkId, status, notes = "") {
  return apiRequest(`/events/${eventId}/links/${linkId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, notes })
  });
}

export async function submitPortalObservation(payload) {
  return apiRequest("/portal/int-ingestion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}
