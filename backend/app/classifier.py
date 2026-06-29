import re
from typing import Dict, List, Tuple

from .models import CasualtiesEstimate, ClassifyRequest, ClassifyResponse

_CLASS_RULES: List[Tuple[str, List[str], str]] = [
    ("military_kinetic", ["airstrike", "artillery", "troop", "missile", "drone", "incursion"], "kinetic_activity"),
    ("cyber_information", ["ddos", "cyber", "phishing", "malware", "propaganda", "botnet"], "cyber_activity"),
    ("political", ["coup", "election", "sanction", "diplomatic", "parliament", "minister"], "political_shift"),
    ("economic", ["port blockade", "commodity", "export ban", "asset seizure", "supply chain"], "economic_disruption"),
    ("socio_cultural", ["protest", "riot", "communal", "displacement", "demonstration"], "civil_unrest"),
    (
        "indicator_warning",
        ["electronic warfare", "radar active", "logistics purchases", "mobilization", "unusual activity"],
        "iw_signal",
    ),
]

_WEAPON_PATTERNS: List[Tuple[str, str]] = [
    (r"\bshahed[-\s]?136\b", "Shahed-136 UAS"),
    (r"\biskander\b", "Iskander"),
    (r"\bartillery\b", "Artillery"),
    (r"\bdrone\b", "UAS/Drone"),
    (r"\bmissile\b", "Missile"),
]

_COUNTRIES = [
    "ukraine",
    "russia",
    "syria",
    "israel",
    "iran",
    "saudi arabia",
    "yemen",
    "china",
    "taiwan",
    "india",
    "pakistan",
]

_ACTOR_ENTITY = (
    r"(?:[A-Z][A-Za-z0-9\\-]{1,24})"
    r"(?:\\s+(?:[A-Z][A-Za-z0-9\\-]{1,24}|\\d{1,3}(?:st|nd|rd|th)?)){0,5}"
    r"(?:\\s+(?:Forces?|Army|Brigade|Unit|Group))?"
)


def _normalize_actor(actor: str | None) -> str | None:
    if not actor:
        return None
    cleaned = re.sub(r"[\\.,;:]+$", "", actor).strip()
    if not cleaned:
        return None
    lower = cleaned.lower()
    if len(cleaned) < 4:
        return None
    if re.fullmatch(r"\\d+(?:st|nd|rd|th)", lower):
        return None
    if lower in {"ukrainian", "russian", "iranian", "israeli", "houthi"}:
        return f"{cleaned} Forces"
    if lower in {
        "local reports",
        "officials",
        "sources",
        "military",
        "forces",
        "force",
        "army",
        "brigade",
        "unit",
        "group",
    }:
        return None
    return cleaned


def _extract_actors(text: str, text_lower: str) -> Tuple[str | None, str | None]:
    def fallback_initiator(lower_text: str) -> str | None:
        fallback_actor_map = [
            ("russian", "Russian Forces"),
            ("ukrainian", "Ukrainian Forces"),
            ("houthi", "Houthi Forces"),
            ("idf", "Israel Defense Forces"),
            ("iranian", "Iranian Forces"),
        ]
        for key, label in fallback_actor_map:
            if key in lower_text:
                return label
        return None

    attack_verbs = r"(?i:attacked|struck|targeted|launched|hit)"
    patterns = [
        re.compile(
            rf"(?P<initiator>{_ACTOR_ENTITY})\s+{attack_verbs}\s+(?P<target>{_ACTOR_ENTITY})",
        ),
        re.compile(
            rf"(?P<target>{_ACTOR_ENTITY})\s+(?i:was)\s+{attack_verbs}\s+(?i:by)\s+(?P<initiator>{_ACTOR_ENTITY})",
        ),
    ]
    for pattern in patterns:
        m = pattern.search(text)
        if m:
            initiator = _normalize_actor(m.group("initiator"))
            target = _normalize_actor(m.group("target"))
            if not initiator:
                initiator = fallback_initiator(text_lower)
            return initiator, target

    return fallback_initiator(text_lower), None


def _extract_casualties(text: str) -> CasualtiesEstimate:
    matches = re.findall(r"\b(\d{1,5})\s+(?:killed|dead|casualties|injured|wounded)\b", text, flags=re.IGNORECASE)
    if not matches:
        return CasualtiesEstimate(min=None, max=None, approx=None)
    values = [int(x) for x in matches]
    return CasualtiesEstimate(min=min(values), max=max(values), approx=round(sum(values) / len(values)))


def _detect_country(text_lower: str) -> str | None:
    for country in _COUNTRIES:
        if country in text_lower:
            return country.title()
    return None


def _detect_class(text_lower: str) -> Tuple[str, str]:
    for event_class, keywords, subclass in _CLASS_RULES:
        if any(keyword in text_lower for keyword in keywords):
            return event_class, subclass
    return "other", "unclassified"


def _detect_weapon(text_lower: str) -> str | None:
    for pattern, label in _WEAPON_PATTERNS:
        if re.search(pattern, text_lower):
            return label
    return None


def _assess_intent(text_lower: str, event_class: str) -> str:
    if any(x in text_lower for x in ["exercise", "mobilization", "buildup", "staging"]):
        return "preparation"
    if any(x in text_lower for x in ["probe", "test response", "reconnaissance"]):
        return "probe"
    if any(x in text_lower for x in ["show of force", "warning shot", "deterrence"]):
        return "show_of_force"
    if any(x in text_lower for x in ["false flag", "staged incident"]):
        return "false_flag"
    if event_class in {"military_kinetic", "economic", "cyber_information"}:
        return "coercion"
    return "unknown"


def _confidence(text_lower: str, source_rating: str | None) -> str:
    if source_rating in {"A", "B"} and len(text_lower) > 120:
        return "high"
    if source_rating in {"C", "D"}:
        return "medium"
    if source_rating in {"E", "F"}:
        return "low"
    return "medium"


def classify(payload: ClassifyRequest) -> ClassifyResponse:
    text = payload.text.strip()
    text_lower = text.lower()
    event_class, event_subclass = _detect_class(text_lower)
    country = _detect_country(text_lower)
    weapon_system = _detect_weapon(text_lower)
    intent = _assess_intent(text_lower, event_class)
    confidence = _confidence(text_lower, payload.source_rating)
    casualties = _extract_casualties(text)
    actor_initiator, actor_target = _extract_actors(text, text_lower)
    iw_flag = event_class == "indicator_warning"

    tags: List[str] = [event_class, event_subclass]
    if country:
        tags.append(country.lower().replace(" ", "_"))
    if weapon_system:
        tags.append("weapon_system")
    if iw_flag:
        tags.append("iw_flag")
    tags = sorted(set(tags))

    rationale_parts = [
        f"classified as {event_class} via keyword rule",
        f"intent set to {intent}",
        f"confidence set to {confidence}",
    ]
    if payload.source_rating:
        rationale_parts.append(f"source_rating={payload.source_rating}")
    rationale = "; ".join(rationale_parts)

    return ClassifyResponse(
        event_class=event_class,
        event_subclass=event_subclass,
        country=country,
        location_name=None,
        latitude=None,
        longitude=None,
        actor_initiator=actor_initiator,
        actor_target=actor_target,
        weapon_system=weapon_system,
        casualties_estimate=casualties,
        intent_assessment=intent,
        confidence=confidence,
        iw_flag=iw_flag,
        tags=tags,
        rationale=rationale,
        classification_version=1,
        model="rule-based-v1",
    )


def classification_schema() -> Dict:
    return ClassifyResponse.model_json_schema()
