from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class EventLinkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    related_event_id: int
    relationship_type: str = Field(default="sequential")
    link_confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    created_by: str = "analyst"
    status: Literal["proposed", "confirmed", "rejected"] = "proposed"
    notes: Optional[str] = None


class EventReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: int
    status: Literal["pending_review", "confirmed", "discarded"]
    analyst: str
    notes: Optional[str] = None


class EventStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending_review", "confirmed", "discarded"]
    notes: Optional[str] = None


class EventEditUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_class: Optional[str] = Field(default=None, max_length=120)
    event_subclass: Optional[str] = Field(default=None, max_length=160)
    description: Optional[str] = None
    country: Optional[str] = Field(default=None, max_length=120)
    admin1: Optional[str] = Field(default=None, max_length=160)
    state: Optional[str] = Field(default=None, max_length=160)
    city: Optional[str] = Field(default=None, max_length=160)
    started_at: Optional[datetime] = None
    started_at_original: Optional[str] = Field(default=None, max_length=240)
    ai_confidence: Optional[str] = Field(default=None, max_length=40)
    weapon_system: Optional[str] = Field(default=None, max_length=180)
    weapon_category: Optional[str] = Field(default=None, max_length=120)
    casualties_confidence: Optional[str] = Field(default=None, max_length=40)
    severity: Optional[int] = Field(default=None, ge=1, le=5)
    escalation_potential: Optional[str] = Field(default=None, max_length=40)
    strategic_impact: Optional[str] = Field(default=None, max_length=40)
    event_phase: Optional[str] = Field(default=None, max_length=60)
    intelligence_gaps: Optional[List[str]] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class EventLinkStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["proposed", "confirmed", "rejected"]
    notes: Optional[str] = None


class EventMapInterestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: Optional[str] = None


class PortalIngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, max_length=240)
    contentSnippet: str = Field(min_length=10, max_length=15000)
    link: Optional[str] = Field(default=None, max_length=1000)
    isoDate: Optional[datetime] = None
    source_rating: Optional[Literal["A", "B", "C", "D", "E", "F"]] = "B"
    source_tier: int = Field(default=3, ge=1, le=5)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)
    workspace: Literal["dashboard", "portal"] = "dashboard"


class AuthUser(BaseModel):
    username: str
    role: Literal["admin", "analyst", "viewer", "submitter"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: AuthUser


class ManagedUser(BaseModel):
    id: int
    username: str
    role: Literal["admin", "analyst", "viewer", "submitter"]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ManagedUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=2, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=200)
    role: Literal["admin", "analyst", "viewer", "submitter"]
    is_active: bool = True


class ManagedUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: Optional[str] = Field(default=None, min_length=8, max_length=200)
    role: Optional[Literal["admin", "analyst", "viewer", "submitter"]] = None
    is_active: Optional[bool] = None


class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: List[float]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    geometry: Optional[GeoJSONGeometry] = None
    properties: Dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: str = "FeatureCollection"
    features: List[GeoJSONFeature]


class EventSource(BaseModel):
    id: int
    source_url: Optional[str]
    source_handle: Optional[str] = None
    source_rating: Optional[str]
    source_tier: Optional[int]
    posted_at: Optional[datetime] = None
    ingested_at: Optional[datetime] = None


class EventLinkDetail(BaseModel):
    id: int
    related_event_id: int
    related_event_class: Optional[str] = None
    related_country: Optional[str] = None
    related_started_at: Optional[datetime] = None
    relationship_type: Optional[str] = None
    link_confidence: Optional[float] = None
    status: str
    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class EventDetail(BaseModel):
    id: int
    event_class: str
    event_subclass: Optional[str]
    description: Optional[str]
    country: Optional[str]
    admin1: Optional[str]
    state: Optional[str] = None
    city: Optional[str] = None
    started_at: Optional[datetime]
    started_at_original: Optional[str] = None
    ai_confidence: Optional[str]
    status: str
    weapon_system: Optional[str]
    weapon_category: Optional[str] = None
    casualties_confidence: Optional[str] = None
    severity: Optional[int] = None
    escalation_potential: Optional[str] = None
    strategic_impact: Optional[str] = None
    event_phase: Optional[str] = None
    intelligence_gaps: Optional[List[str]] = None
    classification_metadata: Optional[Dict[str, Any]] = None
    is_marked_interest: bool = False
    map_removed_at: Optional[datetime] = None
    actor_initiator_id: Optional[int]
    actor_target_id: Optional[int]
    actor_initiator_name: Optional[str]
    actor_target_name: Optional[str]
    osint_source_id: Optional[int]
    source_url: Optional[str]
    source_rating: Optional[str]
    source_tier: Optional[int]
    sources: List[EventSource] = Field(default_factory=list)
    proposed_links: List[EventLinkDetail] = Field(default_factory=list)
    raw_text: Optional[str]
    clean_text: Optional[str]
    translated_text: Optional[str]
    longitude: Optional[float]
    latitude: Optional[float]


class ClassifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=10, max_length=15000)
    source_url: Optional[str] = None
    source_rating: Optional[Literal["A", "B", "C", "D", "E", "F"]] = None
    language: Optional[str] = None


class CasualtiesEstimate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: Optional[int] = Field(default=None, ge=0)
    max: Optional[int] = Field(default=None, ge=0)
    approx: Optional[int] = Field(default=None, ge=0)


class ClassifyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_class: Literal[
        "political",
        "military_kinetic",
        "economic",
        "socio_cultural",
        "cyber_information",
        "indicator_warning",
        "other",
    ]
    event_subclass: str
    country: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    actor_initiator: Optional[str] = None
    actor_target: Optional[str] = None
    weapon_system: Optional[str] = None
    casualties_estimate: CasualtiesEstimate
    intent_assessment: Literal[
        "coercion",
        "probe",
        "preparation",
        "show_of_force",
        "false_flag",
        "unknown",
    ]
    confidence: Literal["high", "medium", "low"]
    iw_flag: bool
    tags: List[str]
    rationale: str
    classification_version: int = 1
    model: str
