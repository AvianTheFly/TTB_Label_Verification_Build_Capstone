import logging
from functools import lru_cache
from time import perf_counter

from app.core.config import get_settings
from app.core.errors import ApiError
from app.services.demo_vision import DemoFixtureVisionService
from app.services.fake_vision import FakeVisionService
from app.services.vision import (
    DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    OpenAIVisionService,
    VisionService,
    VisionServiceError,
)
from app.use_cases.timing import elapsed_ms

logger = logging.getLogger(__name__)


def get_vision_service() -> VisionService:
    settings = get_settings()
    provider = settings.vision_provider

    if provider == "fake":
        return FakeVisionService()
    if provider == "demo":
        return DemoFixtureVisionService()
    if provider == "openai":
        return _get_cached_openai_vision_service(
            api_key=settings.openai_api_key,
            model=settings.vision_model,
            timeout_seconds=settings.openai_timeout_seconds,
            image_detail=settings.openai_image_detail,
            max_output_tokens=getattr(
                settings,
                "openai_max_output_tokens",
                DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
            ),
        )

    raise ApiError(
        status_code=503,
        code="vision_unavailable",
        message="The label reader is not available right now.",
        details={},
    )


@lru_cache(maxsize=4)
def _get_cached_openai_vision_service(
    *,
    api_key: str,
    model: str,
    timeout_seconds: float,
    image_detail: str,
    max_output_tokens: int,
) -> OpenAIVisionService:
    return OpenAIVisionService(
        api_key=api_key,
        model=model,
        timeout_seconds=timeout_seconds,
        image_detail=image_detail,
        max_output_tokens=max_output_tokens,
    )


def warm_vision_service() -> VisionService | None:
    settings = get_settings()
    if settings.vision_provider != "openai":
        return None

    service = get_vision_service()
    if not isinstance(service, OpenAIVisionService):
        return service

    start = perf_counter()
    try:
        service.warm_client()
    except VisionServiceError as exc:
        latency_ms = elapsed_ms(start)
        logger.warning(
            "openai_vision_client_warm_failed latency_ms=%s category=%s",
            latency_ms,
            exc.category,
            extra={"latency_ms": latency_ms, "category": exc.category},
        )
        return service

    latency_ms = elapsed_ms(start)
    logger.info(
        "openai_vision_client_warmed latency_ms=%s model=%s",
        latency_ms,
        service.model,
        extra={"latency_ms": latency_ms, "model": service.model},
    )
    return service
