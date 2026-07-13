from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CanonicalField = Literal[
    "brand_name",
    "class_type",
    "abv",
    "net_contents",
    "producer",
    "country_of_origin",
    "government_warning",
]
MatchType = Literal["fuzzy", "numeric", "unit", "synonym", "exact"]
FieldStatus = Literal["PASS", "FAIL"]
OverallVerdict = Literal["APPROVED", "NEEDS_REVIEW"]
ReviewerDecision = Literal["pass", "fail"]
CANONICAL_FIELDS: tuple[CanonicalField, ...] = (
    "brand_name",
    "class_type",
    "abv",
    "net_contents",
    "producer",
    "country_of_origin",
    "government_warning",
)


class ApplicationData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: str
    class_type: str
    abv: str
    net_contents: str
    producer: str
    country_of_origin: str
    government_warning: str


class ExtractedLabel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: str | None = None
    class_type: str | None = None
    abv: str | None = None
    net_contents: str | None = None
    producer: str | None = None
    country_of_origin: str | None = None
    government_warning: str | None = None
    raw_text: str | None = None
    extraction_confidence: float | None = Field(default=None, ge=0, le=1)


class FieldResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: CanonicalField
    match_type: MatchType
    expected: str
    found: str | None
    status: FieldStatus
    message: str


class VerificationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    results: list[FieldResult]
    overall_verdict: OverallVerdict
    latency_ms: int | None = None


class BatchSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passed: int
    needs_review: int
    total: int


class BatchItemError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)


class BatchItemResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int
    result: VerificationResult | None = None
    error: BatchItemError | None = None


class BatchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[BatchItemResult]
    summary: BatchSummary
