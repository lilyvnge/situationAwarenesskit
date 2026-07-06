from typing import Any


IGNORED_SHARED_ACTOR_NAMES = {
    "civilian",
    "civilians",
    "civilian population",
    "local civilians",
    "residents",
    "local residents",
    "population",
    "local population",
    "unknown",
    "unknown actor",
    "unknown actors",
}


IGNORED_SHARED_WEAPON_NAMES = {
    "firearm",
    "firearms",
    "gun",
    "guns",
    "small arms",
    "small_arms",
}


def normalize_actor_name(value: Any) -> str:
    return str(value or "").strip().lower()


def is_linkable_actor_name(value: Any) -> bool:
    normalized = normalize_actor_name(value)
    return bool(normalized) and normalized not in IGNORED_SHARED_ACTOR_NAMES


def normalize_weapon_name(value: Any) -> str:
    return str(value or "").strip().lower()


def is_linkable_weapon_name(value: Any) -> bool:
    normalized = normalize_weapon_name(value)
    return bool(normalized) and normalized not in IGNORED_SHARED_WEAPON_NAMES
