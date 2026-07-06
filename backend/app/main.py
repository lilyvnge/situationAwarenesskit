import json
import time
import urllib.parse
import urllib.error
import urllib.request
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .auth import authenticate_user, create_access_token, get_current_user, hash_password, require_roles, seed_configured_users
from .campaign_linker import build_campaign_event_links
from .classifier import classification_schema, classify
from .config import settings
from .db import execute, fetch_all, fetch_one
from .linking_rules import IGNORED_SHARED_ACTOR_NAMES, IGNORED_SHARED_WEAPON_NAMES
from .models import (
    AuthUser,
    ClassifyRequest,
    ClassifyResponse,
    EventDetail,
    EventEditUpdate,
    EventLinkCreate,
    EventLinkStatusUpdate,
    EventMapInterestUpdate,
    EventReviewRequest,
    EventStatusUpdate,
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONGeometry,
    LoginRequest,
    ManagedUser,
    ManagedUserCreate,
    ManagedUserUpdate,
    PortalIngestRequest,
    TokenResponse,
)

app = FastAPI(title=settings.app_name, version="0.1.0")
IGNORED_SHARED_ACTOR_NAMES_PARAM = sorted(IGNORED_SHARED_ACTOR_NAMES)
IGNORED_SHARED_WEAPON_NAMES_PARAM = sorted(IGNORED_SHARED_WEAPON_NAMES)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGION_COUNTRIES = {
    "North Africa": ["Algeria", "Egypt", "Libya", "Morocco", "Sudan", "Tunisia", "Western Sahara"],
    "West Africa": [
        "Benin",
        "Burkina Faso",
        "Cape Verde",
        "Cabo Verde",
        "Cote d'Ivoire",
        "Côte d’Ivoire",
        "Gambia",
        "Ghana",
        "Guinea",
        "Guinea-Bissau",
        "Liberia",
        "Mali",
        "Mauritania",
        "Niger",
        "Nigeria",
        "Saint Helena",
        "Senegal",
        "Sierra Leone",
        "Togo",
    ],
    "Central Africa": [
        "Angola",
        "Cameroon",
        "Central African Republic",
        "Chad",
        "Congo",
        "Republic of the Congo",
        "Democratic Republic of the Congo",
        "DR Congo",
        "Equatorial Guinea",
        "Gabon",
        "Sao Tome and Principe",
        "São Tomé and Príncipe",
    ],
    "East Africa": [
        "Burundi",
        "Comoros",
        "Djibouti",
        "Eritrea",
        "Ethiopia",
        "Kenya",
        "Madagascar",
        "Malawi",
        "Mauritius",
        "Mayotte",
        "Mozambique",
        "Rwanda",
        "Reunion",
        "Réunion",
        "Seychelles",
        "Somalia",
        "South Sudan",
        "Tanzania",
        "Uganda",
        "Zambia",
        "Zimbabwe",
    ],
    "Southern Africa": ["Botswana", "Eswatini", "Lesotho", "Namibia", "South Africa"],
    "Western Asia (Middle East)": [
        "Armenia",
        "Azerbaijan",
        "Bahrain",
        "Cyprus",
        "Georgia",
        "Iran",
        "Iraq",
        "Israel",
        "Jordan",
        "Kuwait",
        "Lebanon",
        "Oman",
        "Palestine",
        "Qatar",
        "Saudi Arabia",
        "Syria",
        "Turkey",
        "Türkiye",
        "United Arab Emirates",
        "UAE",
        "Yemen",
    ],
    "Central Asia": ["Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan", "Uzbekistan"],
    "South Asia": ["Afghanistan", "Bangladesh", "Bhutan", "India", "Iran", "Maldives", "Nepal", "Pakistan", "Sri Lanka"],
    "East Asia": ["China", "Hong Kong", "Japan", "Macau", "Macao", "Mongolia", "North Korea", "South Korea", "Taiwan"],
    "Southeast Asia": [
        "Brunei",
        "Cambodia",
        "Indonesia",
        "Laos",
        "Malaysia",
        "Myanmar",
        "Burma",
        "Philippines",
        "Singapore",
        "Thailand",
        "Timor-Leste",
        "East Timor",
        "Vietnam",
    ],
    "Northern Europe": [
        "Denmark",
        "Estonia",
        "Faroe Islands",
        "Finland",
        "Iceland",
        "Ireland",
        "Latvia",
        "Lithuania",
        "Norway",
        "Sweden",
        "United Kingdom",
        "UK",
    ],
    "Western Europe": ["Austria", "Belgium", "France", "Germany", "Liechtenstein", "Luxembourg", "Monaco", "Netherlands", "Switzerland"],
    "Eastern Europe": ["Belarus", "Bulgaria", "Czechia", "Czech Republic", "Hungary", "Moldova", "Poland", "Romania", "Russia", "Slovakia", "Ukraine"],
    "Southern Europe": [
        "Albania",
        "Andorra",
        "Bosnia and Herzegovina",
        "Croatia",
        "Greece",
        "Holy See",
        "Italy",
        "Malta",
        "Montenegro",
        "North Macedonia",
        "Portugal",
        "San Marino",
        "Serbia",
        "Slovenia",
        "Spain",
    ],
    "Northern America": ["Bermuda", "Canada", "Greenland", "Saint Pierre and Miquelon", "United States", "USA", "US"],
    "Central America": ["Belize", "Costa Rica", "El Salvador", "Guatemala", "Honduras", "Mexico", "Nicaragua", "Panama"],
    "Caribbean": [
        "Anguilla",
        "Antigua and Barbuda",
        "Aruba",
        "Bahamas",
        "Barbados",
        "British Virgin Islands",
        "Cayman Islands",
        "Cuba",
        "Curacao",
        "Curaçao",
        "Dominica",
        "Dominican Republic",
        "Grenada",
        "Guadeloupe",
        "Haiti",
        "Jamaica",
        "Martinique",
        "Montserrat",
        "Puerto Rico",
        "Saint Barthelemy",
        "Saint Barthélemy",
        "Saint Kitts and Nevis",
        "Saint Lucia",
        "Saint Martin",
        "Saint Vincent and the Grenadines",
        "Sint Maarten",
        "Trinidad and Tobago",
        "Turks and Caicos Islands",
        "US Virgin Islands",
    ],
    "South America": [
        "Argentina",
        "Bolivia",
        "Brazil",
        "Chile",
        "Colombia",
        "Ecuador",
        "Falkland Islands",
        "French Guiana",
        "Guyana",
        "Paraguay",
        "Peru",
        "Suriname",
        "Uruguay",
        "Venezuela",
    ],
    "Australia & New Zealand": ["Australia", "New Zealand", "Norfolk Island"],
    "Melanesia": ["Fiji", "New Caledonia", "Papua New Guinea", "Solomon Islands", "Vanuatu"],
    "Micronesia & Polynesia": [
        "American Samoa",
        "Cook Islands",
        "French Polynesia",
        "Guam",
        "Kiribati",
        "Marshall Islands",
        "Micronesia",
        "Nauru",
        "Niue",
        "Northern Mariana Islands",
        "Palau",
        "Pitcairn",
        "Samoa",
        "Tokelau",
        "Tonga",
        "Tuvalu",
        "Wallis and Futuna",
    ],
}

REGION_COUNTRY_LOOKUP = {region: [country.lower() for country in countries] for region, countries in REGION_COUNTRIES.items()}


@app.on_event("startup")
def seed_auth_users() -> None:
    seed_configured_users()


def _validate_bbox(bbox: str) -> str:
    parts = [part.strip() for part in bbox.split(",")]
    if len(parts) != 4:
        raise HTTPException(status_code=422, detail="bbox must be lon1,lat1,lon2,lat2")
    try:
        lon1, lat1, lon2, lat2 = [float(part) for part in parts]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="bbox must contain numeric coordinates") from exc
    if not (-180 <= lon1 <= 180 and -180 <= lon2 <= 180 and -90 <= lat1 <= 90 and -90 <= lat2 <= 90):
        raise HTTPException(status_code=422, detail="bbox coordinates are outside valid lon/lat ranges")
    if lon1 >= lon2 or lat1 >= lat2:
        raise HTTPException(status_code=422, detail="bbox must be ordered as minLon,minLat,maxLon,maxLat")
    return ",".join(str(value) for value in (lon1, lat1, lon2, lat2))


def _validate_iso_date(value: str, field_name: str) -> str:
    if not value:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    if not value.endswith("Z"):
        raise HTTPException(status_code=422, detail=f"{field_name} must be an ISO UTC timestamp ending with Z")
    return value


def _read_maxar_error(error: urllib.error.HTTPError) -> str:
    try:
        body = error.read().decode("utf-8")[:600]
        if body:
            if "<HTML" in body.upper() or "<!DOCTYPE" in body.upper():
                return (
                    f"Maxar catalog request was rejected upstream ({error.code}). "
                    "Check the API key, endpoint access, account entitlement, or network allowlisting."
                )
            return body
    except Exception:
        pass
    return error.reason or "Maxar catalog search failed"


def _maxar_headers() -> Dict[str, str]:
    return {
        "Accept": "application/json",
        "User-Agent": "IntelCOP/0.1 MaxarCatalogProxy",
    }


@app.get("/health")
def health() -> Dict[str, str]:
    row = fetch_one("SELECT NOW() AS now")
    return {"status": "ok", "time": str(row["now"])}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    user = authenticate_user(payload.username, payload.password)
    workspace_roles = {
        "dashboard": {"admin", "analyst", "viewer"},
        "portal": {"submitter"},
    }
    if user.role not in workspace_roles[payload.workspace]:
        raise HTTPException(status_code=403, detail="Account is not assigned to this login")
    token = create_access_token(user)
    return TokenResponse(access_token=token, expires_in=settings.jwt_expires_minutes * 60, user=user)


@app.get("/auth/me", response_model=AuthUser)
def get_me(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    return user


@app.get("/api/maxar/images/search")
def search_maxar_images(
    bbox: str = Query(..., description="lon1,lat1,lon2,lat2"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    _: AuthUser = Depends(require_roles("admin", "analyst", "viewer")),
) -> Dict:
    if not settings.maxar_api_key:
        raise HTTPException(status_code=503, detail="MAXAR_API_KEY is not configured on the backend")

    validated_bbox = _validate_bbox(bbox)
    validated_start = _validate_iso_date(start_date, "start_date") if start_date else None
    validated_end = _validate_iso_date(end_date, "end_date") if end_date else None
    if bool(validated_start) != bool(validated_end):
        raise HTTPException(status_code=422, detail="start_date and end_date must be supplied together")
    upstream_params = {
        "bbox": validated_bbox,
        "limit": limit,
        "maxar_api_key": settings.maxar_api_key,
    }
    if validated_start and validated_end:
        upstream_params["datetime"] = f"{validated_start}/{validated_end}"
    query = urllib.parse.urlencode(
        upstream_params
    )
    url = f"{settings.maxar_catalog_search_url}?{query}"
    request = urllib.request.Request(
        url,
        headers=_maxar_headers(),
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=18) as response:
            payload = response.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        if exc.code in {403, 405}:
            post_headers = _maxar_headers()
            post_headers["Content-Type"] = "application/json"
            post_request = urllib.request.Request(
                settings.maxar_catalog_search_url,
                data=json.dumps(upstream_params).encode("utf-8"),
                headers=post_headers,
                method="POST",
            )
            try:
                with urllib.request.urlopen(post_request, timeout=18) as response:
                    payload = response.read().decode("utf-8")
                    return json.loads(payload) if payload else {}
            except urllib.error.HTTPError as post_exc:
                raise HTTPException(status_code=post_exc.code, detail=_read_maxar_error(post_exc)) from post_exc
        raise HTTPException(status_code=exc.code, detail=_read_maxar_error(exc)) from exc
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"Unable to reach Maxar catalog: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Maxar catalog returned invalid JSON") from exc


@app.get("/admin/users", response_model=List[ManagedUser])
def list_managed_users(_: AuthUser = Depends(require_roles("admin"))) -> List[ManagedUser]:
    return fetch_all(
        """
        SELECT id, username, role, is_active, created_at, updated_at
        FROM app_users
        ORDER BY
            CASE role
                WHEN 'admin' THEN 1
                WHEN 'analyst' THEN 2
                WHEN 'viewer' THEN 3
                ELSE 4
            END,
            username
        """
    )


@app.post("/admin/users", response_model=ManagedUser, status_code=201)
def create_managed_user(
    payload: ManagedUserCreate,
    user: AuthUser = Depends(require_roles("admin")),
) -> ManagedUser:
    existing = fetch_one("SELECT id FROM app_users WHERE username = %(username)s", {"username": payload.username})
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    execute(
        """
        INSERT INTO app_users (username, password_hash, role, is_active)
        VALUES (%(username)s, %(password_hash)s, %(role)s, %(is_active)s)
        """,
        {
            "username": payload.username,
            "password_hash": hash_password(payload.password),
            "role": payload.role,
            "is_active": payload.is_active,
        },
    )
    created = fetch_one(
        """
        SELECT id, username, role, is_active, created_at, updated_at
        FROM app_users
        WHERE username = %(username)s
        """,
        {"username": payload.username},
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('user', %(entity_id)s, 'user_created', %(actor)s, %(details)s)
        """,
        {"entity_id": created["id"], "actor": user.username, "details": f"username={payload.username}; role={payload.role}"},
    )
    return ManagedUser(**created)


@app.patch("/admin/users/{username}", response_model=ManagedUser)
def update_managed_user(
    username: str,
    payload: ManagedUserUpdate,
    user: AuthUser = Depends(require_roles("admin")),
) -> ManagedUser:
    existing = fetch_one(
        "SELECT id, username, role, is_active FROM app_users WHERE username = %(username)s",
        {"username": username},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if username == user.username and payload.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    if username == user.username and payload.role and payload.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")

    assignments = ["updated_at = NOW()"]
    params: Dict[str, object] = {"username": username}
    changed = []
    if payload.password:
        assignments.append("password_hash = %(password_hash)s")
        params["password_hash"] = hash_password(payload.password)
        changed.append("password")
    if payload.role is not None:
        assignments.append("role = %(role)s")
        params["role"] = payload.role
        changed.append("role")
    if payload.is_active is not None:
        assignments.append("is_active = %(is_active)s")
        params["is_active"] = payload.is_active
        changed.append("is_active")

    execute(
        f"""
        UPDATE app_users
        SET {", ".join(assignments)}
        WHERE username = %(username)s
        """,
        params,
    )
    updated = fetch_one(
        """
        SELECT id, username, role, is_active, created_at, updated_at
        FROM app_users
        WHERE username = %(username)s
        """,
        {"username": username},
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('user', %(entity_id)s, 'user_updated', %(actor)s, %(details)s)
        """,
        {"entity_id": updated["id"], "actor": user.username, "details": ", ".join(changed) or "metadata"},
    )
    return ManagedUser(**updated)


@app.delete("/admin/users/{username}")
def delete_managed_user(
    username: str,
    user: AuthUser = Depends(require_roles("admin")),
) -> Dict[str, object]:
    existing = fetch_one(
        "SELECT id, username FROM app_users WHERE username = %(username)s",
        {"username": username},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if username == user.username:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")

    execute("DELETE FROM app_users WHERE username = %(username)s", {"username": username})
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('user', %(entity_id)s, 'user_deleted', %(actor)s, %(details)s)
        """,
        {"entity_id": existing["id"], "actor": user.username, "details": f"username={username}"},
    )
    return {"message": "User deleted", "username": username}


@app.get("/classify/schema")
def get_classify_schema(_: AuthUser = Depends(require_roles("admin", "analyst", "viewer"))) -> Dict[str, object]:
    return classification_schema()


@app.post("/classify", response_model=ClassifyResponse)
def classify_observation(
    payload: ClassifyRequest,
    _: AuthUser = Depends(require_roles("admin", "analyst")),
) -> ClassifyResponse:
    return classify(payload)


@app.post("/portal/int-ingestion")
def submit_portal_observation(
    payload: PortalIngestRequest,
    user: AuthUser = Depends(require_roles("submitter")),
) -> Dict[str, object]:
    source_url = payload.link or f"portal://{user.username}/{int(time.time() * 1000)}"
    body = {
        "title": payload.title,
        "contentSnippet": payload.contentSnippet,
        "link": source_url,
        "isoDate": payload.isoDate.isoformat() if payload.isoDate else None,
        "source_rating": payload.source_rating,
        "source_tier": payload.source_tier,
        "submitted_by": user.username,
    }
    request = urllib.request.Request(
        settings.n8n_ingest_webhook_url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response_body = response.read().decode("utf-8")
            try:
                n8n_response = json.loads(response_body) if response_body else {}
            except json.JSONDecodeError:
                n8n_response = {"raw": response_body}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"n8n ingestion webhook failed: {detail}")
    except urllib.error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"n8n ingestion webhook unavailable: {exc.reason}")

    source_row = None
    for _ in range(20):
        source_row = fetch_one(
            """
            SELECT id, source_url, ingested_at
            FROM osint_sources
            WHERE source_url = %(source_url)s
            ORDER BY id DESC
            LIMIT 1
            """,
            {"source_url": source_url},
        )
        if source_row:
            break
        time.sleep(0.25)

    return {
        "message": "Observation submitted to INT ingestion",
        "processed": bool(source_row),
        "source_url": source_url,
        "source_id": source_row["id"] if source_row else None,
        "n8n": n8n_response,
    }


@app.get("/events", response_model=GeoJSONFeatureCollection)
def list_events(
    event_class: Optional[str] = Query(default=None),
    country: Optional[str] = Query(default=None),
    region: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    _: AuthUser = Depends(require_roles("admin", "analyst", "viewer")),
) -> GeoJSONFeatureCollection:
    where = [
        "e.map_removed_at IS NULL",
        "(e.is_marked_interest IS TRUE OR e.created_at >= NOW() - INTERVAL '24 hours')",
    ]
    params: Dict[str, object] = {"limit": limit, "offset": offset}

    if event_class:
        where.append("e.event_class = %(event_class)s")
        params["event_class"] = event_class
    if country:
        where.append("e.country = %(country)s")
        params["country"] = country
    if region:
        region_countries = REGION_COUNTRY_LOOKUP.get(region)
        if region_countries is None:
            raise HTTPException(status_code=422, detail="Unsupported region filter")
        where.append("LOWER(e.country) = ANY(%(region_countries)s)")
        params["region_countries"] = region_countries
    if status:
        where.append("e.status = %(status)s")
        params["status"] = status

    where_sql = "WHERE " + " AND ".join(where) if where else ""
    query = f"""
        SELECT
            e.id,
            e.event_class,
            e.event_subclass,
            e.description,
            e.country,
            e.admin1,
            COALESCE(e.state, e.admin1) AS state,
            e.city,
            e.started_at,
            e.started_at_original,
            e.created_at,
            e.ai_confidence,
            e.status,
            e.weapon_system,
            e.weapon_category,
            e.casualties_confidence,
            e.severity,
            e.escalation_potential,
            e.strategic_impact,
            e.event_phase,
            e.intelligence_gaps,
            e.classification_metadata,
            e.is_marked_interest,
            e.map_removed_at,
            e.actor_initiator_id,
            e.actor_target_id,
            ST_X(e.geom) AS lon,
            ST_Y(e.geom) AS lat
        FROM events e
        {where_sql}
        ORDER BY e.created_at DESC, e.started_at DESC NULLS LAST, e.id DESC
        LIMIT %(limit)s
        OFFSET %(offset)s
    """
    rows = fetch_all(query, params)

    features: List[GeoJSONFeature] = []
    for row in rows:
        geometry = None
        if row["lon"] is not None and row["lat"] is not None:
            geometry = GeoJSONGeometry(type="Point", coordinates=[row["lon"], row["lat"]])
        properties = {k: v for k, v in row.items() if k not in {"lon", "lat"}}
        country_name = str(properties.get("country") or "").lower()
        properties["region"] = next(
            (region_name for region_name, countries in REGION_COUNTRY_LOOKUP.items() if country_name in countries),
            None,
        )
        features.append(GeoJSONFeature(geometry=geometry, properties=properties))

    return GeoJSONFeatureCollection(features=features)


@app.get("/events/network")
def event_network(
    event_id: Optional[int] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    _: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, List[Dict[str, object]]]:
    if event_id is not None:
        links_query = """
            SELECT
                el.id,
                el.event_id_1,
                el.event_id_2,
                el.relationship_type,
                el.link_confidence,
                el.status
            FROM event_links el
            WHERE el.event_id_1 = %(event_id)s OR el.event_id_2 = %(event_id)s
            ORDER BY el.created_at DESC
            LIMIT %(limit)s
        """
        links = fetch_all(links_query, {"event_id": event_id, "limit": limit})
    else:
        links_query = """
            SELECT
                el.id,
                el.event_id_1,
                el.event_id_2,
                el.relationship_type,
                el.link_confidence,
                el.status
            FROM event_links el
            ORDER BY el.created_at DESC
            LIMIT %(limit)s
        """
        links = fetch_all(links_query, {"limit": limit})

    node_ids = set()
    for link in links:
        node_ids.add(link["event_id_1"])
        node_ids.add(link["event_id_2"])

    if not node_ids:
        return {"nodes": [], "edges": []}

    node_query = """
        SELECT
            e.id,
            e.event_class,
            e.country,
            e.started_at,
            e.ai_confidence
        FROM events e
        WHERE e.id = ANY(%(node_ids)s)
    """
    nodes = fetch_all(node_query, {"node_ids": list(node_ids)})

    return {"nodes": nodes, "edges": links}


@app.post("/campaigns/link-events")
def link_events_into_campaigns(
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    return build_campaign_event_links(actor=user.username)


@app.get("/campaigns")
def list_campaigns(
    limit: int = Query(default=50, ge=1, le=200),
    _: AuthUser = Depends(require_roles("admin", "analyst")),
) -> List[Dict[str, object]]:
    return fetch_all(
        """
        WITH campaign_rows AS (
            SELECT
                c.id,
                c.name,
                c.description,
                c.status,
                c.created_at,
                e.id AS event_id,
                COALESCE(e.started_at, e.created_at) AS event_time,
                e.event_class,
                e.country,
                COALESCE(NULLIF(e.city, ''), NULLIF(COALESCE(e.state, e.admin1), ''), NULLIF(e.country, '')) AS location_name,
                e.weapon_system,
                e.weapon_category,
                e.severity,
                ai.name AS initiator_name,
                at.name AS target_name
            FROM campaigns c
            LEFT JOIN campaign_events ce ON ce.campaign_id = c.id
            LEFT JOIN events e ON e.id = ce.event_id
            LEFT JOIN actors ai ON ai.id = e.actor_initiator_id
            LEFT JOIN actors at ON at.id = e.actor_target_id
        )
        SELECT
            id,
            name,
            description,
            status,
            created_at,
            COUNT(event_id)::int AS event_count,
            ARRAY_REMOVE(ARRAY_AGG(event_id ORDER BY event_time DESC NULLS LAST, event_id DESC), NULL) AS event_ids,
            MIN(event_time) AS first_event_at,
            MAX(event_time) AS latest_event_at,
            MAX(severity) AS max_severity,
            ROUND(AVG(severity)::numeric, 1)::float AS average_severity,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT event_class), NULL) AS event_classes,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT country), NULL) AS countries,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT location_name), NULL) AS locations,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT weapon_system), NULL) AS weapon_systems,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT weapon_category), NULL) AS weapon_categories,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT initiator_name), NULL) AS initiator_names,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT target_name), NULL) AS target_names
        FROM campaign_rows
        GROUP BY id, name, description, status, created_at
        ORDER BY latest_event_at DESC NULLS LAST, created_at DESC
        LIMIT %(limit)s
        """,
        {"limit": limit},
    )


@app.get("/campaigns/{campaign_id}/events", response_model=GeoJSONFeatureCollection)
def get_campaign_events(
    campaign_id: int,
    _: AuthUser = Depends(require_roles("admin", "analyst")),
) -> GeoJSONFeatureCollection:
    rows = fetch_all(
        """
        SELECT
            e.id,
            e.event_class,
            e.event_subclass,
            e.description,
            e.country,
            e.admin1,
            COALESCE(e.state, e.admin1) AS state,
            e.city,
            e.started_at,
            e.ai_confidence,
            e.status,
            e.weapon_system,
            e.weapon_category,
            e.severity,
            e.is_marked_interest,
            ai.name AS actor_initiator_name,
            at.name AS actor_target_name,
            ST_X(e.geom) AS lon,
            ST_Y(e.geom) AS lat
        FROM campaign_events ce
        JOIN events e ON e.id = ce.event_id
        LEFT JOIN actors ai ON ai.id = e.actor_initiator_id
        LEFT JOIN actors at ON at.id = e.actor_target_id
        WHERE ce.campaign_id = %(campaign_id)s
        ORDER BY COALESCE(e.started_at, e.created_at) DESC, e.id DESC
        """,
        {"campaign_id": campaign_id},
    )

    features: List[GeoJSONFeature] = []
    for row in rows:
        geometry = None
        if row["lon"] is not None and row["lat"] is not None:
            geometry = GeoJSONGeometry(type="Point", coordinates=[row["lon"], row["lat"]])
        properties = {k: v for k, v in row.items() if k not in {"lon", "lat"}}
        properties["campaign_id"] = campaign_id
        features.append(GeoJSONFeature(geometry=geometry, properties=properties))

    return GeoJSONFeatureCollection(features=features)


@app.get("/campaigns/{campaign_id}/network")
def get_campaign_network(
    campaign_id: int,
    _: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, List[Dict[str, object]]]:
    event_rows = fetch_all(
        """
        SELECT event_id
        FROM campaign_events
        WHERE campaign_id = %(campaign_id)s
        """,
        {"campaign_id": campaign_id},
    )
    event_ids = [row["event_id"] for row in event_rows]
    if not event_ids:
        return {"nodes": [], "edges": []}

    links = fetch_all(
        """
        SELECT
            el.id,
            el.event_id_1,
            el.event_id_2,
            el.relationship_type,
            el.link_confidence,
            el.status,
            el.notes,
            el.created_by,
            el.created_at,
            CASE
                WHEN POSITION('factors=' IN COALESCE(el.notes, '')) > 0
                    THEN string_to_array(split_part(split_part(el.notes, 'factors=', 2), ';', 1), ',')
                ELSE ARRAY[]::text[]
            END AS link_factors,
            CASE
                WHEN e1.geom IS NOT NULL AND e2.geom IS NOT NULL
                    THEN ROUND((ST_Distance(e1.geom::geography, e2.geom::geography) / 1000.0)::numeric, 1)::float
                ELSE NULL
            END AS distance_km,
            CASE
                WHEN e1.started_at IS NOT NULL AND e2.started_at IS NOT NULL
                    THEN ROUND((ABS(EXTRACT(EPOCH FROM (e1.started_at - e2.started_at))) / 3600.0)::numeric, 1)::float
                ELSE NULL
            END AS time_delta_hours,
            CASE
                WHEN NULLIF(e1.city, '') IS NOT NULL
                 AND LOWER(e1.city) = LOWER(e2.city)
                    THEN e1.city
                WHEN NULLIF(COALESCE(e1.state, e1.admin1), '') IS NOT NULL
                 AND (NULLIF(e1.city, '') IS NULL OR NULLIF(e2.city, '') IS NULL)
                 AND LOWER(COALESCE(e1.state, e1.admin1)) = LOWER(COALESCE(e2.state, e2.admin1))
                    THEN COALESCE(e1.state, e1.admin1)
                ELSE NULL
            END AS shared_location_name,
            CASE
                WHEN NULLIF(e1.weapon_system, '') IS NOT NULL
                 AND LOWER(e1.weapon_system) = LOWER(e2.weapon_system)
                 AND NOT (LOWER(TRIM(e1.weapon_system)) = ANY(%(ignored_shared_weapon_names)s))
                    THEN e1.weapon_system
                WHEN NULLIF(e1.weapon_category, '') IS NOT NULL
                 AND LOWER(e1.weapon_category) = LOWER(e2.weapon_category)
                 AND NOT (LOWER(TRIM(e1.weapon_category)) = ANY(%(ignored_shared_weapon_names)s))
                    THEN e1.weapon_category
                ELSE NULL
            END AS shared_weapon,
            ARRAY(
                SELECT DISTINCT shared_actor_name
                FROM (
                    VALUES
                        (CASE WHEN e1.actor_initiator_id IS NOT NULL AND e1.actor_initiator_id IN (e2.actor_initiator_id, e2.actor_target_id) THEN e1_initiator.name END),
                        (CASE WHEN e1.actor_target_id IS NOT NULL AND e1.actor_target_id IN (e2.actor_initiator_id, e2.actor_target_id) THEN e1_target.name END)
                ) AS shared(shared_actor_name)
                WHERE shared_actor_name IS NOT NULL
                  AND NOT (LOWER(TRIM(shared_actor_name)) = ANY(%(ignored_shared_actor_names)s))
            ) AS shared_actor_names
        FROM event_links el
        JOIN events e1 ON e1.id = el.event_id_1
        JOIN events e2 ON e2.id = el.event_id_2
        LEFT JOIN actors e1_initiator ON e1_initiator.id = e1.actor_initiator_id
        LEFT JOIN actors e1_target ON e1_target.id = e1.actor_target_id
        WHERE el.event_id_1 = ANY(%(event_ids)s)
          AND el.event_id_2 = ANY(%(event_ids)s)
        ORDER BY el.link_confidence DESC NULLS LAST, el.created_at DESC
        """,
        {
            "event_ids": event_ids,
            "ignored_shared_actor_names": IGNORED_SHARED_ACTOR_NAMES_PARAM,
            "ignored_shared_weapon_names": IGNORED_SHARED_WEAPON_NAMES_PARAM,
        },
    )
    nodes = fetch_all(
        """
        SELECT
            e.id,
            e.event_class,
            e.event_subclass,
            e.country,
            e.admin1,
            COALESCE(e.state, e.admin1) AS state,
            e.city,
            COALESCE(NULLIF(e.city, ''), NULLIF(COALESCE(e.state, e.admin1), ''), NULLIF(e.country, '')) AS location_name,
            e.started_at,
            e.ai_confidence,
            e.status,
            e.weapon_system,
            e.weapon_category,
            e.severity,
            e.escalation_potential,
            e.strategic_impact,
            e.event_phase,
            ai.name AS actor_initiator_name,
            at.name AS actor_target_name,
            ST_X(e.geom) AS longitude,
            ST_Y(e.geom) AS latitude
        FROM events e
        LEFT JOIN actors ai ON ai.id = e.actor_initiator_id
        LEFT JOIN actors at ON at.id = e.actor_target_id
        WHERE e.id = ANY(%(event_ids)s)
        """,
        {"event_ids": event_ids},
    )
    return {"nodes": nodes, "edges": links}


@app.get("/events/{event_id}", response_model=EventDetail)
def get_event(event_id: int, _: AuthUser = Depends(require_roles("admin", "analyst", "viewer"))) -> EventDetail:
    query = """
        SELECT
            e.id,
            e.event_class,
            e.event_subclass,
            e.description,
            e.country,
            e.admin1,
            COALESCE(e.state, e.admin1) AS state,
            e.city,
            e.started_at,
            e.started_at_original,
            e.ai_confidence,
            e.status,
            e.weapon_system,
            e.weapon_category,
            e.casualties_confidence,
            e.severity,
            e.escalation_potential,
            e.strategic_impact,
            e.event_phase,
            e.intelligence_gaps,
            e.classification_metadata,
            e.is_marked_interest,
            e.map_removed_at,
            e.actor_initiator_id,
            e.actor_target_id,
            ai.name AS actor_initiator_name,
            at.name AS actor_target_name,
            e.osint_source_id,
            s.source_url,
            s.source_rating,
            s.source_tier,
            s.raw_text,
            s.clean_text,
            s.translated_text,
            ST_X(e.geom) AS longitude,
            ST_Y(e.geom) AS latitude
        FROM events e
        LEFT JOIN actors ai ON ai.id = e.actor_initiator_id
        LEFT JOIN actors at ON at.id = e.actor_target_id
        LEFT JOIN osint_sources s ON s.id = e.osint_source_id
        WHERE e.id = %(event_id)s
    """
    row = fetch_one(query, {"event_id": event_id})
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")

    sources = fetch_all(
        """
        SELECT
            s.id,
            s.source_url,
            s.source_handle,
            s.source_rating,
            s.source_tier,
            s.posted_at,
            s.ingested_at
        FROM osint_sources s
        JOIN events e ON e.osint_source_id = s.id
        WHERE e.id = %(event_id)s
        ORDER BY s.source_tier ASC NULLS LAST, s.ingested_at DESC NULLS LAST
        """,
        {"event_id": event_id},
    )

    proposed_links = fetch_all(
        """
        SELECT
            el.id,
            CASE WHEN el.event_id_1 = %(event_id)s THEN el.event_id_2 ELSE el.event_id_1 END AS related_event_id,
            related.event_class AS related_event_class,
            related.event_subclass AS related_event_subclass,
            related.country AS related_country,
            related.admin1 AS related_admin1,
            COALESCE(related.state, related.admin1) AS related_state,
            related.city AS related_city,
            COALESCE(NULLIF(related.city, ''), NULLIF(COALESCE(related.state, related.admin1), ''), NULLIF(related.country, '')) AS related_location_name,
            related.started_at AS related_started_at,
            related.description AS related_description,
            related.weapon_system AS related_weapon_system,
            related.weapon_category AS related_weapon_category,
            ARRAY(
                SELECT DISTINCT shared_actor_name
                FROM (
                    VALUES
                        (CASE WHEN current_event.actor_initiator_id IS NOT NULL AND current_event.actor_initiator_id IN (related.actor_initiator_id, related.actor_target_id) THEN current_initiator.name END),
                        (CASE WHEN current_event.actor_target_id IS NOT NULL AND current_event.actor_target_id IN (related.actor_initiator_id, related.actor_target_id) THEN current_target.name END)
                ) AS shared(shared_actor_name)
                WHERE shared_actor_name IS NOT NULL
                  AND NOT (LOWER(TRIM(shared_actor_name)) = ANY(%(ignored_shared_actor_names)s))
            ) AS shared_actor_names,
            CASE
                WHEN NULLIF(current_event.city, '') IS NOT NULL
                 AND LOWER(current_event.city) = LOWER(related.city)
                    THEN related.city
                WHEN NULLIF(COALESCE(current_event.state, current_event.admin1), '') IS NOT NULL
                 AND (NULLIF(current_event.city, '') IS NULL OR NULLIF(related.city, '') IS NULL)
                 AND LOWER(COALESCE(current_event.state, current_event.admin1)) = LOWER(COALESCE(related.state, related.admin1))
                    THEN COALESCE(related.state, related.admin1)
                ELSE NULL
            END AS shared_location_name,
            CASE
                WHEN NULLIF(current_event.weapon_system, '') IS NOT NULL
                 AND LOWER(current_event.weapon_system) = LOWER(related.weapon_system)
                 AND NOT (LOWER(TRIM(current_event.weapon_system)) = ANY(%(ignored_shared_weapon_names)s))
                    THEN related.weapon_system
                WHEN NULLIF(current_event.weapon_category, '') IS NOT NULL
                 AND LOWER(current_event.weapon_category) = LOWER(related.weapon_category)
                 AND NOT (LOWER(TRIM(current_event.weapon_category)) = ANY(%(ignored_shared_weapon_names)s))
                    THEN related.weapon_category
                ELSE NULL
            END AS shared_weapon,
            CASE
                WHEN current_event.geom IS NOT NULL AND related.geom IS NOT NULL
                    THEN ROUND((ST_Distance(current_event.geom::geography, related.geom::geography) / 1000.0)::numeric, 1)::float
                ELSE NULL
            END AS distance_km,
            CASE
                WHEN current_event.started_at IS NOT NULL AND related.started_at IS NOT NULL
                    THEN ROUND((ABS(EXTRACT(EPOCH FROM (current_event.started_at - related.started_at))) / 3600.0)::numeric, 1)::float
                ELSE NULL
            END AS time_delta_hours,
            CASE
                WHEN POSITION('factors=' IN COALESCE(el.notes, '')) > 0
                    THEN string_to_array(split_part(split_part(el.notes, 'factors=', 2), ';', 1), ',')
                ELSE ARRAY[]::text[]
            END AS link_factors,
            el.relationship_type,
            el.link_confidence,
            el.status,
            el.notes,
            el.created_by,
            el.created_at
        FROM event_links el
        JOIN events current_event
          ON current_event.id = %(event_id)s
        JOIN events related
          ON related.id = CASE WHEN el.event_id_1 = %(event_id)s THEN el.event_id_2 ELSE el.event_id_1 END
        LEFT JOIN actors current_initiator ON current_initiator.id = current_event.actor_initiator_id
        LEFT JOIN actors current_target ON current_target.id = current_event.actor_target_id
        WHERE el.event_id_1 = %(event_id)s OR el.event_id_2 = %(event_id)s
        ORDER BY
            CASE el.status
                WHEN 'proposed' THEN 1
                WHEN 'confirmed' THEN 2
                ELSE 3
            END,
            el.link_confidence DESC NULLS LAST,
            el.created_at DESC
        """,
        {
            "event_id": event_id,
            "ignored_shared_actor_names": IGNORED_SHARED_ACTOR_NAMES_PARAM,
            "ignored_shared_weapon_names": IGNORED_SHARED_WEAPON_NAMES_PARAM,
        },
    )

    return EventDetail(**row, sources=sources, proposed_links=proposed_links)


@app.patch("/events/{event_id}", response_model=EventDetail)
def update_event_details(
    event_id: int,
    payload: EventEditUpdate,
    user: AuthUser = Depends(require_roles("admin")),
) -> EventDetail:
    event_exists = fetch_one("SELECT id FROM events WHERE id = %(event_id)s", {"event_id": event_id})
    if not event_exists:
        raise HTTPException(status_code=404, detail="Event not found")

    data = payload.model_dump(exclude_unset=True)
    lat_provided = "latitude" in data
    lon_provided = "longitude" in data
    latitude = data.pop("latitude", None)
    longitude = data.pop("longitude", None)

    assignments = []
    params: Dict[str, object] = {"event_id": event_id}
    editable_columns = {
        "event_class",
        "event_subclass",
        "description",
        "country",
        "admin1",
        "state",
        "city",
        "started_at",
        "started_at_original",
        "ai_confidence",
        "weapon_system",
        "weapon_category",
        "casualties_confidence",
        "severity",
        "escalation_potential",
        "strategic_impact",
        "event_phase",
        "intelligence_gaps",
    }

    for column, value in data.items():
        if column not in editable_columns:
            continue
        assignments.append(f"{column} = %({column})s")
        params[column] = value

    if lat_provided or lon_provided:
        if latitude is None and longitude is None:
            assignments.append("geom = NULL")
        elif latitude is not None and longitude is not None:
            assignments.append("geom = ST_SetSRID(ST_MakePoint(%(longitude)s, %(latitude)s), 4326)")
            params["latitude"] = latitude
            params["longitude"] = longitude
        else:
            raise HTTPException(status_code=422, detail="Latitude and longitude must be provided together")

    if not assignments:
        return get_event(event_id, user)

    execute(
        f"""
        UPDATE events
        SET {", ".join(assignments)}
        WHERE id = %(event_id)s
        """,
        params,
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('event', %(event_id)s, 'details_update', %(analyst)s, %(details)s)
        """,
        {
            "event_id": event_id,
            "analyst": user.username,
            "details": ", ".join([key for key in payload.model_fields_set]),
        },
    )
    return get_event(event_id, user)


@app.patch("/events/{event_id}/status")
def update_event_status(
    event_id: int,
    payload: EventStatusUpdate,
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    event_exists = fetch_one("SELECT id FROM events WHERE id = %(event_id)s", {"event_id": event_id})
    if not event_exists:
        raise HTTPException(status_code=404, detail="Event not found")

    execute(
        """
        UPDATE events
        SET status = %(status)s
        WHERE id = %(event_id)s
        """,
        {"status": payload.status, "event_id": event_id},
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('event', %(event_id)s, 'status_update', %(analyst)s, %(notes)s)
        """,
        {"event_id": event_id, "analyst": user.username, "notes": payload.notes},
    )
    return {"message": "Event status updated", "event_id": event_id, "status": payload.status}


@app.patch("/events/{event_id}/map-interest")
def mark_event_as_interest(
    event_id: int,
    payload: EventMapInterestUpdate,
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    event_exists = fetch_one("SELECT id FROM events WHERE id = %(event_id)s", {"event_id": event_id})
    if not event_exists:
        raise HTTPException(status_code=404, detail="Event not found")

    execute(
        """
        UPDATE events
        SET is_marked_interest = TRUE,
            map_removed_at = NULL
        WHERE id = %(event_id)s
        """,
        {"event_id": event_id},
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('event', %(event_id)s, 'map_interest_marked', %(analyst)s, %(notes)s)
        """,
        {"event_id": event_id, "analyst": user.username, "notes": payload.notes},
    )
    return {"message": "Event marked as interest", "event_id": event_id, "is_marked_interest": True}


@app.patch("/events/{event_id}/map-remove")
def remove_event_from_map(
    event_id: int,
    payload: EventMapInterestUpdate,
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    event_exists = fetch_one("SELECT id FROM events WHERE id = %(event_id)s", {"event_id": event_id})
    if not event_exists:
        raise HTTPException(status_code=404, detail="Event not found")

    execute(
        """
        UPDATE events
        SET is_marked_interest = FALSE,
            map_removed_at = NOW()
        WHERE id = %(event_id)s
        """,
        {"event_id": event_id},
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('event', %(event_id)s, 'map_removed', %(analyst)s, %(notes)s)
        """,
        {"event_id": event_id, "analyst": user.username, "notes": payload.notes},
    )
    return {"message": "Event removed from map", "event_id": event_id, "is_marked_interest": False}


@app.patch("/events/{event_id}/links/{link_id}")
def update_event_link_status(
    event_id: int,
    link_id: int,
    payload: EventLinkStatusUpdate,
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    link = fetch_one(
        """
        SELECT id, event_id_1, event_id_2
        FROM event_links
        WHERE id = %(link_id)s
          AND (event_id_1 = %(event_id)s OR event_id_2 = %(event_id)s)
        """,
        {"event_id": event_id, "link_id": link_id},
    )
    if not link:
        raise HTTPException(status_code=404, detail="Event link not found")

    execute(
        """
        UPDATE event_links
        SET
            status = %(status)s,
            notes = CASE
                WHEN NULLIF(%(notes)s, '') IS NULL THEN notes
                WHEN notes IS NULL OR notes = '' THEN CONCAT('analyst_note=', %(notes)s)
                ELSE CONCAT(notes, '; analyst_note=', %(notes)s)
            END
        WHERE id = %(link_id)s
        """,
        {"status": payload.status, "notes": payload.notes, "link_id": link_id},
    )
    execute(
        """
        INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
        VALUES ('event_link', %(link_id)s, %(action)s, %(analyst)s, %(notes)s)
        """,
        {
            "link_id": link_id,
            "action": f"link_{payload.status}",
            "analyst": user.username,
            "notes": payload.notes,
        },
    )
    return {"message": "Event link updated", "event_id": event_id, "link_id": link_id, "status": payload.status}


@app.post("/events/{event_id}/links")
def create_link(
    event_id: int,
    payload: EventLinkCreate,
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    if payload.related_event_id == event_id:
        raise HTTPException(status_code=400, detail="Cannot link an event to itself")

    event_exists = fetch_one("SELECT id FROM events WHERE id = %(event_id)s", {"event_id": event_id})
    related_exists = fetch_one(
        "SELECT id FROM events WHERE id = %(event_id)s", {"event_id": payload.related_event_id}
    )
    if not event_exists or not related_exists:
        raise HTTPException(status_code=404, detail="One or both events do not exist")

    event_1 = min(event_id, payload.related_event_id)
    event_2 = max(event_id, payload.related_event_id)

    query = """
        INSERT INTO event_links (
            event_id_1,
            event_id_2,
            relationship_type,
            link_confidence,
            created_by,
            status,
            notes
        ) VALUES (
            %(event_id_1)s,
            %(event_id_2)s,
            %(relationship_type)s,
            %(link_confidence)s,
            %(created_by)s,
            %(status)s,
            %(notes)s
        )
        ON CONFLICT (event_id_1, event_id_2, relationship_type)
        DO UPDATE SET
            link_confidence = EXCLUDED.link_confidence,
            status = EXCLUDED.status,
            notes = EXCLUDED.notes
    """

    params = {
        "event_id_1": event_1,
        "event_id_2": event_2,
        "relationship_type": payload.relationship_type,
        "link_confidence": payload.link_confidence,
        "created_by": user.username,
        "status": payload.status,
        "notes": payload.notes,
    }
    execute(query, params)

    return {
        "message": "Link upserted",
        "event_id_1": event_1,
        "event_id_2": event_2,
        "relationship_type": payload.relationship_type,
    }


@app.post("/analyst/review")
def review_event(
    payload: EventReviewRequest,
    user: AuthUser = Depends(require_roles("admin", "analyst")),
) -> Dict[str, object]:
    event_exists = fetch_one("SELECT id FROM events WHERE id = %(event_id)s", {"event_id": payload.event_id})
    if not event_exists:
        raise HTTPException(status_code=404, detail="Event not found")

    execute(
        """
        UPDATE events
        SET status = %(status)s
        WHERE id = %(event_id)s
        """,
        {"status": payload.status, "event_id": payload.event_id},
    )

    execute(
        """
        INSERT INTO audit_log (
            entity_type,
            entity_id,
            action,
            actor,
            details
        ) VALUES (
            'event',
            %(event_id)s,
            'review_status_update',
            %(analyst)s,
            %(notes)s
        )
        """,
        {"event_id": payload.event_id, "analyst": user.username, "notes": payload.notes},
    )

    return {"message": "Event review updated", "event_id": payload.event_id, "status": payload.status}
