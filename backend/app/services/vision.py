import base64
import json
import logging
from time import perf_counter
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from app.domain.models import ExtractedLabel
from app.services.image_preprocess import PreprocessedImage
from app.use_cases.timing import elapsed_ms

DEFAULT_OPENAI_VISION_MODEL = "gpt-4.1-mini"
DEFAULT_OPENAI_TIMEOUT_SECONDS = 4.5
DEFAULT_OPENAI_IMAGE_DETAIL = "high"

logger = logging.getLogger(__name__)

CANONICAL_EXTRACTION_FIELDS = (
    "brand_name",
    "class_type",
    "abv",
    "net_contents",
    "producer",
    "country_of_origin",
    "government_warning",
)

VisionIssueCategory = Literal[
    "non_label_image",
    "blurry_image",
    "angled_image",
    "glare_heavy_image",
    "partial_extraction",
    "malformed_provider_output",
    "provider_timeout",
    "provider_quota_exceeded",
    "provider_unavailable",
    "provider_not_configured",
    "extraction_failed",
]

EXTRACTION_PROMPT = """Extract alcohol beverage label data from the image.

Return exactly these seven canonical fields:
brand_name, class_type, abv, net_contents, producer, country_of_origin, government_warning.

Rules:
- Use null for any field that is absent, unreadable, obscured, ambiguous, or uncertain.
- Do not guess missing fields.
- Do not infer values from common alcohol label wording or from the standard warning text.
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


class VisionService(Protocol):
    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        """Extract canonical label fields from a preprocessed image."""


class VisionServiceError(Exception):
    def __init__(self, category: VisionIssueCategory, message: str) -> None:
        super().__init__(message)
        self.category = category
        self.message = message


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


class OpenAIVisionService:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = DEFAULT_OPENAI_TIMEOUT_SECONDS,
        image_detail: str = DEFAULT_OPENAI_IMAGE_DETAIL,
        client: Any | None = None,
    ) -> None:
        self._model = model or DEFAULT_OPENAI_VISION_MODEL
        self._timeout_seconds = timeout_seconds
        self._image_detail = image_detail
        self._client = client
        self._api_key = api_key

    @classmethod
    def from_settings(cls, settings: Any) -> "OpenAIVisionService":
        return cls(
            api_key=settings.openai_api_key,
            model=settings.vision_model or DEFAULT_OPENAI_VISION_MODEL,
            timeout_seconds=settings.openai_timeout_seconds,
        )

    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        client = self._client or self._build_client()
        encode_start = perf_counter()
        image_data_url = _image_data_url(image)
        image_encode_ms = elapsed_ms(encode_start)

        try:
            provider_start = perf_counter()
            response = await client.responses.create(
                model=self._model,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": EXTRACTION_PROMPT},
                            {
                                "type": "input_image",
                                "image_url": image_data_url,
                                "detail": self._image_detail,
                            },
                        ],
                    }
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "ttb_label_extraction",
                        "strict": True,
                        "schema": STRUCTURED_OUTPUT_SCHEMA,
                    }
                },
                store=False,
            )
            provider_call_ms = elapsed_ms(provider_start)
        except TimeoutError as exc:
            raise VisionServiceError(
                "provider_timeout",
                "The vision provider timed out while reading the label.",
            ) from exc
        except Exception as exc:
            category = _category_for_provider_exception(exc)
            raise VisionServiceError(category, _safe_provider_message(category)) from exc

        payload_start = perf_counter()
        payload = _extract_response_payload(response)
        payload_extract_ms = elapsed_ms(payload_start)

        parse_start = perf_counter()
        extracted_label = parse_structured_label_payload(payload)
        payload_parse_ms = elapsed_ms(parse_start)
        total_provider_ms = image_encode_ms + provider_call_ms + payload_extract_ms + payload_parse_ms
        logger.info(
            (
                "openai_vision_timing image_encode_ms=%s provider_call_ms=%s "
                "payload_extract_ms=%s payload_parse_ms=%s total_provider_ms=%s "
                "original_size_bytes=%s processed_size_bytes=%s original_pixels=%sx%s "
                "processed_pixels=%sx%s model=%s image_detail=%s"
            ),
            image_encode_ms,
            provider_call_ms,
            payload_extract_ms,
            payload_parse_ms,
            total_provider_ms,
            image.original_size_bytes,
            image.processed_size_bytes,
            image.original_width,
            image.original_height,
            image.processed_width,
            image.processed_height,
            self._model,
            self._image_detail,
            extra={
                "image_encode_ms": image_encode_ms,
                "provider_call_ms": provider_call_ms,
                "payload_extract_ms": payload_extract_ms,
                "payload_parse_ms": payload_parse_ms,
                "total_provider_ms": total_provider_ms,
                "original_size_bytes": image.original_size_bytes,
                "processed_size_bytes": image.processed_size_bytes,
                "original_width": image.original_width,
                "original_height": image.original_height,
                "processed_width": image.processed_width,
                "processed_height": image.processed_height,
                "model": self._model,
                "image_detail": self._image_detail,
            },
        )
        return extracted_label

    def _build_client(self) -> Any:
        if not self._api_key:
            raise VisionServiceError(
                "provider_not_configured",
                "The vision provider is not configured.",
            )

        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise VisionServiceError(
                "provider_unavailable",
                "The OpenAI client library is not installed.",
            ) from exc

        self._client = AsyncOpenAI(api_key=self._api_key, timeout=self._timeout_seconds)
        return self._client


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


def classify_extraction_issue(extracted_label: ExtractedLabel) -> VisionIssueCategory | None:
    values = [getattr(extracted_label, field) for field in CANONICAL_EXTRACTION_FIELDS]
    populated_count = sum(value is not None for value in values)
    if populated_count == 0:
        return "non_label_image"
    if populated_count < len(CANONICAL_EXTRACTION_FIELDS):
        return "partial_extraction"
    return None


def _image_data_url(image: PreprocessedImage) -> str:
    encoded = base64.b64encode(image.content).decode("ascii")
    return f"data:{image.content_type};base64,{encoded}"


def _extract_response_payload(response: Any) -> object:
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


def _category_for_provider_exception(exc: Exception) -> VisionIssueCategory:
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


def _safe_provider_message(category: VisionIssueCategory) -> str:
    if category == "provider_timeout":
        return "The vision provider timed out while reading the label."
    if category == "provider_quota_exceeded":
        return (
            "This API call exceeds your current quota. "
            "Please check your OpenAI plan and billing details."
        )
    return "The vision provider is unavailable."
