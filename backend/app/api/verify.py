import json
import logging
from time import perf_counter
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import ValidationError

from app.api.dependencies import get_submitted_openai_vision_service, get_vision_service
from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.models import ApplicationData, VerificationResult
from app.services.fake_vision import DemoVisionService
from app.services.image_preprocess import ImagePreprocessError
from app.services.verification import elapsed_ms, verify_label_image
from app.services.vision import VisionService, VisionServiceError

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
        application = _parse_application_data(application_data)
        image_bytes = await _read_image_upload(image)
        settings = get_settings()
        result = await verify_label_image(
            application=application,
            image_bytes=image_bytes,
            content_type=image.content_type or "",
            filename=image.filename,
            vision_service=_request_vision_service(
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
        latency_ms = elapsed_ms(start)
        api_error = _image_preprocess_api_error(exc)
        logger.warning(
            "verify_request_failed latency_ms=%s error_code=%s",
            latency_ms,
            api_error.code,
            extra={"latency_ms": latency_ms, "error_code": api_error.code},
        )
        raise api_error from exc
    except VisionServiceError as exc:
        latency_ms = elapsed_ms(start)
        api_error = _vision_api_error(exc)
        logger.warning(
            "verify_request_failed latency_ms=%s error_code=%s vision_category=%s",
            latency_ms,
            api_error.code,
            exc.category,
            extra={
                "latency_ms": latency_ms,
                "error_code": api_error.code,
                "vision_category": exc.category,
            },
        )
        raise api_error from exc
    except ApiError as exc:
        latency_ms = elapsed_ms(start)
        logger.warning(
            "verify_request_failed latency_ms=%s error_code=%s",
            latency_ms,
            exc.code,
            extra={"latency_ms": latency_ms, "error_code": exc.code},
        )
        raise


def _parse_application_data(application_data: str | None) -> ApplicationData:
    if application_data is None:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please provide application data.",
            details={"field": "application_data"},
        )

    try:
        payload = json.loads(application_data)
    except json.JSONDecodeError as exc:
        raise ApiError(
            status_code=400,
            code="bad_request",
            message="Application data must be valid JSON.",
            details={"field": "application_data"},
        ) from exc

    if not isinstance(payload, dict):
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Application data must be a JSON object.",
            details={"field": "application_data"},
        )

    try:
        return ApplicationData.model_validate(payload)
    except ValidationError as exc:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Application data is missing required fields or contains unsupported fields.",
            details={"field_errors": _safe_model_errors(exc.errors())},
        ) from exc


async def _read_image_upload(image: UploadFile | None) -> bytes:
    if image is None:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please upload a label image.",
            details={"field": "image"},
        )

    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    try:
        image_bytes = await image.read(max_bytes + 1)
    except Exception as exc:
        raise ApiError(
            status_code=400,
            code="bad_request",
            message="The uploaded image could not be read. Please choose the image again.",
            details={"field": "image"},
        ) from exc
    if len(image_bytes) > max_bytes:
        raise ApiError(
            status_code=413,
            code="file_too_large",
            message=f"Please upload an image smaller than {get_settings().max_upload_mb} MB.",
            details={"field": "image"},
        )
    return image_bytes


def _safe_model_errors(errors: list[dict[str, Any]]) -> list[dict[str, str]]:
    safe_errors: list[dict[str, str]] = []
    for error in errors:
        loc = error.get("loc", ())
        if not isinstance(loc, tuple | list):
            loc = ()
        safe_errors.append(
            {
                "field": ".".join(str(part) for part in loc) or "application_data",
                "message": str(error.get("msg", "Invalid value.")),
                "type": str(error.get("type", "validation_error")),
            }
        )
    return safe_errors


def _request_vision_service(
    *,
    use_real_vision: bool,
    openai_api_key: str | None,
    openai_model: str | None,
    configured_vision_service: VisionService,
) -> VisionService:
    if not use_real_vision:
        return DemoVisionService()

    submitted_service = get_submitted_openai_vision_service(
        openai_api_key=openai_api_key,
        openai_model=openai_model,
    )
    return submitted_service or configured_vision_service


def _image_preprocess_api_error(exc: ImagePreprocessError) -> ApiError:
    if exc.category == "unsupported_file_type":
        return ApiError(
            status_code=415,
            code="unsupported_file_type",
            message=exc.message,
            details={"field": "image"},
        )
    if exc.category == "file_too_large":
        return ApiError(
            status_code=413,
            code="file_too_large",
            message=exc.message,
            details={"field": "image"},
        )
    return ApiError(
        status_code=400,
        code="bad_request",
        message=exc.message,
        details={"field": "image"},
    )


def _vision_api_error(exc: VisionServiceError) -> ApiError:
    if exc.category == "provider_timeout":
        return ApiError(
            status_code=504,
            code="vision_timeout",
            message="The label reader timed out. Please try again.",
            details={},
        )
    if exc.category == "provider_quota_exceeded":
        return ApiError(
            status_code=429,
            code="vision_quota_exceeded",
            message=(
                "This API call exceeds your current quota. "
                "Please check your OpenAI plan and billing details."
            ),
            details={},
        )
    if exc.category in {"provider_unavailable", "provider_not_configured"}:
        return ApiError(
            status_code=503,
            code="vision_unavailable",
            message="The label reader is not available right now.",
            details={},
        )
    return ApiError(
        status_code=502,
        code="extraction_failed",
        message="The label reader could not extract the label details.",
        details={},
    )


def _elapsed_ms(start: float) -> int:
    return elapsed_ms(start)
