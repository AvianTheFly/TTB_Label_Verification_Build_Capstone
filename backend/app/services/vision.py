import base64
import logging
from time import perf_counter
from typing import Any, Protocol

from app.domain.models import ExtractedLabel
from app.services.image_preprocess import PreprocessedImage
from app.services.openai_extraction import (
    CANONICAL_EXTRACTION_FIELDS,
    EXTRACTION_PROMPT,
    STRUCTURED_OUTPUT_SCHEMA,
    WARNING_STYLE_FIELD,
    category_for_provider_exception,
    extract_response_payload,
    parse_structured_label_payload,
    safe_provider_message,
)
from app.services.vision_errors import VisionIssueCategory, VisionServiceError
from app.use_cases.timeout import run_with_timeout
from app.use_cases.timing import elapsed_ms

DEFAULT_OPENAI_VISION_MODEL = "gpt-5.4-nano"
DEFAULT_OPENAI_TIMEOUT_SECONDS = 30.0
DEFAULT_OPENAI_IMAGE_DETAIL = "low"
DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 500

logger = logging.getLogger(__name__)

__all__ = [
    "CANONICAL_EXTRACTION_FIELDS",
    "DEFAULT_OPENAI_IMAGE_DETAIL",
    "DEFAULT_OPENAI_MAX_OUTPUT_TOKENS",
    "DEFAULT_OPENAI_TIMEOUT_SECONDS",
    "DEFAULT_OPENAI_VISION_MODEL",
    "EXTRACTION_PROMPT",
    "STRUCTURED_OUTPUT_SCHEMA",
    "WARNING_STYLE_FIELD",
    "OpenAIVisionService",
    "VisionIssueCategory",
    "VisionService",
    "VisionServiceError",
    "parse_structured_label_payload",
]


class VisionService(Protocol):
    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        """Extract canonical label fields from a preprocessed image."""


class OpenAIVisionService:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        timeout_seconds: float = DEFAULT_OPENAI_TIMEOUT_SECONDS,
        image_detail: str = DEFAULT_OPENAI_IMAGE_DETAIL,
        max_output_tokens: int = DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
        client: Any | None = None,
    ) -> None:
        self._model = model or DEFAULT_OPENAI_VISION_MODEL
        self._timeout_seconds = timeout_seconds
        self._image_detail = image_detail
        self._max_output_tokens = max_output_tokens
        self._client = client
        self._api_key = api_key

    @classmethod
    def from_settings(cls, settings: Any) -> "OpenAIVisionService":
        return cls(
            api_key=settings.openai_api_key,
            model=settings.vision_model or DEFAULT_OPENAI_VISION_MODEL,
            timeout_seconds=settings.openai_timeout_seconds,
            image_detail=settings.openai_image_detail,
            max_output_tokens=getattr(
                settings,
                "openai_max_output_tokens",
                DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
            ),
        )

    @property
    def model(self) -> str:
        return self._model

    def warm_client(self) -> None:
        if self._client is None:
            self._build_client()

    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        client_build_start = perf_counter()
        client = self._client or self._build_client()
        client_build_ms = elapsed_ms(client_build_start)
        encode_start = perf_counter()
        image_data_url = _image_data_url(image)
        image_encode_ms = elapsed_ms(encode_start)

        try:
            provider_start = perf_counter()
            response = await run_with_timeout(
                client.responses.create(
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
                    max_output_tokens=self._max_output_tokens,
                    store=False,
                ),
                self._timeout_seconds,
            )
            provider_call_ms = elapsed_ms(provider_start)
        except TimeoutError as exc:
            raise VisionServiceError(
                "provider_timeout",
                "The vision provider timed out while reading the label.",
            ) from exc
        except Exception as exc:
            category = category_for_provider_exception(exc)
            raise VisionServiceError(category, safe_provider_message(category)) from exc

        payload_start = perf_counter()
        payload = extract_response_payload(response)
        payload_extract_ms = elapsed_ms(payload_start)

        parse_start = perf_counter()
        extracted_label = parse_structured_label_payload(payload)
        payload_parse_ms = elapsed_ms(parse_start)
        total_provider_ms = (
            client_build_ms
            + image_encode_ms
            + provider_call_ms
            + payload_extract_ms
            + payload_parse_ms
        )
        logger.info(
            (
                "openai_vision_timing client_build_ms=%s image_encode_ms=%s provider_call_ms=%s "
                "payload_extract_ms=%s payload_parse_ms=%s total_provider_ms=%s "
                "original_size_bytes=%s processed_size_bytes=%s original_pixels=%sx%s "
                "processed_pixels=%sx%s model=%s image_detail=%s max_output_tokens=%s"
            ),
            client_build_ms,
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
            self._max_output_tokens,
            extra={
                "client_build_ms": client_build_ms,
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
                "max_output_tokens": self._max_output_tokens,
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


def _image_data_url(image: PreprocessedImage) -> str:
    encoded = base64.b64encode(image.content).decode("ascii")
    return f"data:{image.content_type};base64,{encoded}"
