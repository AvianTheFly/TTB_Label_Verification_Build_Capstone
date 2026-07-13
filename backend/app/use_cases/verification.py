import logging
from time import perf_counter

from app.core.config import Settings
from app.domain.comparison import compare_label
from app.domain.models import ApplicationData, VerificationResult
from app.services.image_preprocess import preprocess_image
from app.services.vision import VisionService
from app.use_cases.timing import elapsed_ms

logger = logging.getLogger(__name__)


async def verify_label_image(
    *,
    application: ApplicationData,
    image_bytes: bytes,
    content_type: str,
    filename: str | None,
    vision_service: VisionService,
    settings: Settings,
) -> VerificationResult:
    start = perf_counter()

    preprocess_start = perf_counter()
    preprocessed = preprocess_image(
        image_bytes,
        content_type,
        filename=filename,
        max_upload_mb=settings.max_upload_mb,
        max_dimension_px=settings.image_max_dimension,
        jpeg_quality=settings.image_jpeg_quality,
    )
    preprocessing_ms = elapsed_ms(preprocess_start)

    vision_start = perf_counter()
    extracted = await vision_service.extract_label(preprocessed)
    vision_ms = elapsed_ms(vision_start)

    comparison_start = perf_counter()
    result = compare_label(application, extracted)
    comparison_ms = elapsed_ms(comparison_start)

    result.latency_ms = elapsed_ms(start)
    logger.info(
        (
            "verify_timing_breakdown preprocessing_ms=%s vision_ms=%s "
            "comparison_ms=%s total_latency_ms=%s"
        ),
        preprocessing_ms,
        vision_ms,
        comparison_ms,
        result.latency_ms,
        extra={
            "preprocessing_ms": preprocessing_ms,
            "vision_ms": vision_ms,
            "comparison_ms": comparison_ms,
            "total_latency_ms": result.latency_ms,
        },
    )
    return result
