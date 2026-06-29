import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from .db import get_conn

LOOKBACK_INTERVAL = "30 days"
LINK_THRESHOLD = 0.4
MIN_CAMPAIGN_EVENTS = 3
RELATIONSHIP_TYPE = "automated_campaign"


def _norm(value: Any) -> str:
    return str(value or "").strip().lower()


def _actor_ids(event: Dict[str, Any]) -> Set[int]:
    return {
        actor_id
        for actor_id in (event.get("actor_initiator_id"), event.get("actor_target_id"))
        if actor_id is not None
    }


def _hours_between(left: Optional[datetime], right: Optional[datetime]) -> Optional[float]:
    if not left or not right:
        return None
    if left.tzinfo is None:
        left = left.replace(tzinfo=timezone.utc)
    if right.tzinfo is None:
        right = right.replace(tzinfo=timezone.utc)
    return abs((left - right).total_seconds()) / 3600


def _distance_km(left: Dict[str, Any], right: Dict[str, Any]) -> Optional[float]:
    if left.get("lat") is None or left.get("lon") is None or right.get("lat") is None or right.get("lon") is None:
        return None

    lat1 = math.radians(float(left["lat"]))
    lon1 = math.radians(float(left["lon"]))
    lat2 = math.radians(float(right["lat"]))
    lon2 = math.radians(float(right["lon"]))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371 * (2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _location_score(left: Dict[str, Any], right: Dict[str, Any]) -> float:
    left_city = _norm(left.get("city"))
    right_city = _norm(right.get("city"))
    if left_city and left_city == right_city:
        return 1.0

    left_state = _norm(left.get("state") or left.get("admin1"))
    right_state = _norm(right.get("state") or right.get("admin1"))
    if left_state and left_state == right_state and _norm(left.get("country")) == _norm(right.get("country")):
        return 0.78

    distance = _distance_km(left, right)
    if distance is not None:
        if distance <= 25:
            return 0.9
        if distance <= 100:
            return 0.72
        if distance <= 300:
            return 0.45

    if _norm(left.get("country")) and _norm(left.get("country")) == _norm(right.get("country")):
        return 0.34
    return 0.0


def _weapon_score(left: Dict[str, Any], right: Dict[str, Any]) -> float:
    left_system = _norm(left.get("weapon_system"))
    right_system = _norm(right.get("weapon_system"))
    if left_system and left_system == right_system:
        return 1.0

    left_category = _norm(left.get("weapon_category"))
    right_category = _norm(right.get("weapon_category"))
    if left_category and left_category == right_category:
        return 0.72
    return 0.0


def _time_score(left: Dict[str, Any], right: Dict[str, Any]) -> float:
    hours = _hours_between(left.get("started_at"), right.get("started_at"))
    if hours is None:
        return 0.0
    if hours <= 3:
        return 1.0
    if hours <= 8:
        return 0.82
    if hours <= 16:
        return 0.58
    if hours <= 24:
        return 0.35
    return 0.0


def score_event_pair(left: Dict[str, Any], right: Dict[str, Any]) -> Tuple[float, List[str]]:
    reasons: List[str] = []

    actor_overlap = _actor_ids(left) & _actor_ids(right)
    actor_score = 1.0 if actor_overlap else 0.0
    if actor_overlap:
        reasons.append("shared_actor")

    location_score = _location_score(left, right)
    if location_score:
        reasons.append("location")

    weapon_score = _weapon_score(left, right)
    if weapon_score:
        reasons.append("weapon")

    time_score = _time_score(left, right)
    if time_score:
        reasons.append("time")

    score = (actor_score * 0.34) + (location_score * 0.26) + (weapon_score * 0.22) + (time_score * 0.18)
    return round(min(score, 1.0), 3), reasons


def _connected_components(event_ids: Set[int], edges: List[Tuple[int, int]]) -> List[List[int]]:
    graph: Dict[int, Set[int]] = defaultdict(set)
    for left_id, right_id in edges:
        graph[left_id].add(right_id)
        graph[right_id].add(left_id)

    seen: Set[int] = set()
    components: List[List[int]] = []
    for event_id in event_ids:
        if event_id in seen:
            continue
        stack = [event_id]
        seen.add(event_id)
        component = []
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in graph[current]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        if len(component) > 1:
            components.append(sorted(component))
    return components


def build_campaign_event_links(actor: str = "system") -> Dict[str, Any]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    e.id,
                    e.event_class,
                    e.country,
                    e.admin1,
                    COALESCE(e.state, e.admin1) AS state,
                    e.city,
                    e.started_at,
                    e.actor_initiator_id,
                    e.actor_target_id,
                    e.weapon_system,
                    e.weapon_category,
                    ST_X(e.geom) AS lon,
                    ST_Y(e.geom) AS lat
                FROM events e
                WHERE COALESCE(e.started_at, e.created_at) >= NOW() - %(lookback_interval)s::interval
                ORDER BY COALESCE(e.started_at, e.created_at) DESC, e.id DESC
                """,
                {"lookback_interval": LOOKBACK_INTERVAL},
            )
            events = list(cur.fetchall())

            inserted_links: List[Dict[str, Any]] = []
            qualifying_edges: List[Tuple[int, int]] = []
            for index, left in enumerate(events):
                for right in events[index + 1 :]:
                    confidence, reasons = score_event_pair(left, right)
                    if confidence < LINK_THRESHOLD:
                        continue

                    left_id, right_id = sorted((left["id"], right["id"]))
                    qualifying_edges.append((left_id, right_id))
                    cur.execute(
                        """
                        INSERT INTO event_links (
                            event_id_1,
                            event_id_2,
                            relationship_type,
                            link_confidence,
                            created_by,
                            status,
                            notes
                        )
                        VALUES (
                            %(event_id_1)s,
                            %(event_id_2)s,
                            %(relationship_type)s,
                            %(link_confidence)s,
                            %(created_by)s,
                            'proposed',
                            %(notes)s
                        )
                        ON CONFLICT (event_id_1, event_id_2, relationship_type)
                        DO UPDATE SET
                            link_confidence = GREATEST(event_links.link_confidence, EXCLUDED.link_confidence),
                            notes = EXCLUDED.notes
                        RETURNING id
                        """,
                        {
                            "event_id_1": left_id,
                            "event_id_2": right_id,
                            "relationship_type": RELATIONSHIP_TYPE,
                            "link_confidence": confidence,
                            "created_by": actor,
                            "notes": f"auto_score={confidence}; factors={','.join(reasons)}",
                        },
                    )
                    link_row = cur.fetchone()
                    inserted_links.append(
                        {
                            "id": link_row["id"],
                            "event_id_1": left_id,
                            "event_id_2": right_id,
                            "link_confidence": confidence,
                            "factors": reasons,
                        }
                    )

            event_ids = {event["id"] for event in events}
            components = [
                component
                for component in _connected_components(event_ids, qualifying_edges)
                if len(component) >= MIN_CAMPAIGN_EVENTS
            ]

            campaign_assignments: List[Dict[str, Any]] = []
            for component in components:
                cur.execute(
                    """
                    SELECT campaign_id
                    FROM campaign_events
                    WHERE event_id = ANY(%(event_ids)s)
                    ORDER BY campaign_id
                    LIMIT 1
                    """,
                    {"event_ids": component},
                )
                campaign_row = cur.fetchone()

                if campaign_row:
                    campaign_id = campaign_row["campaign_id"]
                    created = False
                else:
                    cur.execute(
                        """
                        INSERT INTO campaigns (name, description, status)
                        VALUES (%(name)s, %(description)s, 'active')
                        RETURNING id
                        """,
                        {
                            "name": f"Auto Campaign {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
                            "description": f"Automated campaign cluster from {len(component)} linked events in the last {LOOKBACK_INTERVAL}.",
                        },
                    )
                    campaign_id = cur.fetchone()["id"]
                    created = True

                for event_id in component:
                    cur.execute(
                        """
                        INSERT INTO campaign_events (campaign_id, event_id)
                        VALUES (%(campaign_id)s, %(event_id)s)
                        ON CONFLICT DO NOTHING
                        """,
                        {"campaign_id": campaign_id, "event_id": event_id},
                    )

                campaign_assignments.append(
                    {
                        "campaign_id": campaign_id,
                        "created": created,
                        "event_ids": component,
                    }
                )

            cur.execute(
                """
                INSERT INTO audit_log (entity_type, entity_id, action, actor, details)
                VALUES ('campaign', 0, 'campaign_linking_run', %(actor)s, %(details)s)
                """,
                {
                    "actor": actor,
                    "details": (
                        f"events={len(events)}; links={len(inserted_links)}; "
                        f"campaign_clusters={len(campaign_assignments)}"
                    ),
                },
            )

        conn.commit()

    return {
        "events_considered": len(events),
        "lookback_interval": LOOKBACK_INTERVAL,
        "links_upserted": len(inserted_links),
        "campaign_clusters": len(campaign_assignments),
        "links": inserted_links,
        "campaigns": campaign_assignments,
    }
