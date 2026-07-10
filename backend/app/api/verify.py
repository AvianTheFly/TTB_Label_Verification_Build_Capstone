import logging
from time import perf_counter
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import get_vision_service
from app.api.error_mapping import image_preprocess_api_error, vision_api_error
from app.api.request_parsing import parse_application_data, read_image_upload
from app.api.vision_selection import select_request_vision_service
from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.models import VerificationResult
from app.services.image_preprocess import ImagePreprocessError
from app.services.vision import VisionService, VisionServiceError
from app.use_cases.timing import elapsed_ms
from app.use_cases.verification import verify_label_image

logger = logging.getLogger(__name__)
router = APIRouter(tags=["verification"])


@router.post("/verify", response_model=VerificationResult)
async def verify_label(
    image: Annotated[UploadFile | None, File()] = None,
    application_data: Annotated[str | None, Form()] = None,
    use_real_vision: Annotated[bool, Form()] = False,
    openai_api_key: Annotated[str | None, Form()] = None,
    openai_model: Annotated[str | None, Form()] = None,
    vision_service: Annotated[VisionService, Depends(get_vision_service)] = None,
) -> VerificationResult:
    start = perf_counter()
    try:
        settings = get_settings()
        application = parse_application_data(application_data)
        image_bytes = await read_image_upload(image, max_upload_mb=settings.max_upload_mb)
        result = await verify_label_image(
            application=application,
            image_bytes=image_bytes,
            content_type=image.content_type or "",
            filename=image.filename,
            vision_service=select_request_vision_service(
                use_real_vision=use_real_vision,
                openai_api_key=openai_api_key,
                openai_model=openai_model,
                configured_vision_service=vision_service,
            ),
            settings=settings,
        )
        logger.info(
            "verify_request_completed latency_ms=%s overall_verdict=%s",
            result.latency_ms,
            result.overall_verdict,
            extra={
                "latency_ms": result.latency_ms,
                "overall_verdict": result.overall_verdict,
            },
        )
        return result
    except ImagePreprocessError as exc:
        api_error = image_preprocess_api_error(exc)
        _log_request_failure(start, api_error)
        raise api_error from exc
    except VisionServiceError as exc:
        api_error = vision_api_error(exc)
        _log_request_failure(start, api_error, vision_category=exc.category)
        raise api_error from exc
    except ApiError as exc:
        _log_request_failure(start, exc)
        raise


def _log_request_failure(
    start: float, api_error: ApiError, *, vision_category: str | None = None
) -> None:
    latency_ms = elapsed_ms(start)
    logger.warning(
        "verify_request_failed latency_ms=%s error_code=%s vision_category=%s",
        latency_ms,
        api_error.code,
        vision_category,
        extra={
            "latency_ms": latency_ms,
            "error_code": api_error.code,
            "vision_category": vision_category,
        },
    )

