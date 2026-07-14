import json
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from app.domain.models import CANONICAL_FIELDS, ExtractedLabel

from .vision_errors import VisionIssueCategory, VisionServiceError

CANONICAL_EXTRACTION_FIELDS = CANONICAL_FIELDS

EXTRACTION_PROMPT = """Extract text from one alcohol beverage label image and sort it into
the correct TTB label fields.

Return exactly these seven canonical fields:
brand_name, class_type, abv, net_contents, producer, country_of_origin, government_warning.

Rules:
- Treat each request as one label image. Batch verification calls this prompt once per
  uploaded image, so never combine information across labels or infer from another item.
- Use only text that is visible in the current image.
- Use null for any field that is absent, unreadable, obscured, ambiguous, or uncertain.
- If the image is blank, mostly blank, not a label, or too poor to identify, return null
  for all seven fields.
- Do not guess, complete, correct, translate, normalize, or standardize missing fields.
- Do not infer values from common alcohol label wording or from the standard warning text.
- Put each visible text value in the most specific matching field:
  brand_name is the product/brand name; class_type is the beverage class/type;
  abv is alcohol by volume or proof text; net_contents is bottle/can volume;
  producer is bottler/producer/importer name and address text; country_of_origin is
  origin text; government_warning is the required warning statement.
- Do not place the same visible text in multiple fields unless the label explicitly repeats it.
- If several candidate values appear for one field and the correct one is unclear, use null.
- Copy government_warning verbatim from the visible label when possible, preserving
  capitalization, punctuation, and wording.
- If the government warning is partly unreadable, return only the visible readable text;
  do not fill gaps from memory.
- For blurry, angled, or glare-heavy images, return partial data rather than failing.
- If the image is not an alcohol label, return null for all seven fields.
"""

STRUCTURED_OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        field: {"type": ["string", "null"]} for field in CANONICAL_EXTRACTION_FIELDS
    },
    "required": list(CANONICAL_EXTRACTION_FIELDS),
    "additionalProperties": False,
}


class StructuredLabelOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: str | None
    class_type: str | None
    abv: str | None
    net_contents: str | None
    producer: str | None
    country_of_origin: str | None
    government_warning: str | None

    @field_validator(
        "brand_name",
        "class_type",
        "abv",
        "net_contents",
        "producer",
        "country_of_origin",
        "government_warning",
        mode="before",
    )
    @classmethod
    def blank_strings_become_null(cls, value: Any) -> Any:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    def to_extracted_label(self) -> ExtractedLabel:
        return ExtractedLabel(**self.model_dump())


def parse_structured_label_payload(payload: object) -> ExtractedLabel:
    try:
        if isinstance(payload, str):
            payload = json.loads(payload)
        structured = StructuredLabelOutput.model_validate(payload)
    except (json.JSONDecodeError, TypeError, ValidationError) as exc:
        raise VisionServiceError(
            "malformed_provider_output",
            "The vision provider returned an unreadable extraction result.",
        ) from exc

    return structured.to_extracted_label()


def extract_response_payload(response: Any) -> object:
    parsed = getattr(response, "output_parsed", None)
    if parsed is not None:
        return parsed

    output_text = getattr(response, "output_text", None)
    if output_text:
        return output_text

    if isinstance(response, dict):
        if response.get("output_parsed") is not None:
            return response["output_parsed"]
        if response.get("output_text"):
            return response["output_text"]

    raise VisionServiceError(
        "malformed_provider_output",
        "The vision provider returned no structured extraction result.",
    )


def category_for_provider_exception(exc: Exception) -> VisionIssueCategory:
    exception_name = exc.__class__.__name__.lower()
    code = str(getattr(exc, "code", "")).lower()
    message = str(getattr(exc, "message", exc)).lower()
    if "timeout" in exception_name:
        return "provider_timeout"
    if (
        "ratelimit" in exception_name
        and ("insufficient_quota" in code or "insufficient_quota" in message)
    ) or "exceeded your current quota" in message:
        return "provider_quota_exceeded"
    return "provider_unavailable"


def safe_provider_message(category: VisionIssueCategory) -> str:
    if category == "provider_timeout":
        return "The vision provider timed out while reading the label."
    if category == "provider_quota_exceeded":
        return (
            "This API call exceeds your current quota. "
            "Please check your OpenAI plan and billing details."
        )
    return "The vision provider is unavailable."
