import json
import logging
from time import perf_counter
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import ValidationError

from app.api.dependencies import get_submitted_openai_vision_service, get_vision_service
from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.models import ApplicationData, BatchResult
from app.services.batch import (
    BatchVerificationInput,
    bad_request_item_error,
    file_too_large_item_error,
    process_batch_items,
    validation_item_error,
)
from app.services.fake_vision import DemoVisionService
from app.services.verification import elapsed_ms
from app.services.vision import VisionService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["verification"])


@router.post("/verify/batch", response_model=BatchResult)
async def verify_batch(
    images: Annotated[list[UploadFile] | None, File()] = None,
    application_data: Annotated[list[str] | None, Form()] = None,
    use_real_vision: Annotated[bool, Form()] = False,
    openai_api_key: Annotated[str | None, Form()] = None,
    openai_model: Annotated[str | None, Form()] = None,
    vision_service: Annotated[VisionService, Depends(get_vision_service)] = None,
) -> BatchResult:
    start = perf_counter()
    settings = get_settings()
    image_parts = images or []
    data_parts = application_data or []
    total = max(len(image_parts), len(data_parts))

    if total == 0:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please provide at least one label image and application data pair.",
            details={"fields": ["images", "application_data"]},
        )

    if total > settings.max_batch_items:
        raise ApiError(
            status_code=413,
            code="bad_request",
            message=f"Please submit {settings.max_batch_items} labels or fewer in one batch.",
            details={"max_batch_items": settings.max_batch_items},
        )

    items = [
        await _build_item(
            index=index,
            image=image_parts[index] if index < len(image_parts) else None,
            application_data=data_parts[index] if index < len(data_parts) else None,
            max_upload_mb=settings.max_upload_mb,
        )
        for index in range(total)
    ]

    result = await process_batch_items(
        items=items,
        vision_service=_request_vision_service(
            use_real_vision=use_real_vision,
            openai_api_key=openai_api_key,
            openai_model=openai_model,
            configured_vision_service=vision_service,
        ),
        settings=settings,
    )
    latency_ms = elapsed_ms(start)
    logger.info(
        "batch_verify_completed latency_ms=%s total=%s passed=%s needs_review=%s",
        latency_ms,
        result.summary.total,
        result.summary.passed,
        result.summary.needs_review,
        extra={
            "latency_ms": latency_ms,
            "total": result.summary.total,
            "passed": result.summary.passed,
            "needs_review": result.summary.needs_review,
        },
    )
    return result


async def _build_item(
    *,
    index: int,
    image: UploadFile | None,
    application_data: str | None,
    max_upload_mb: int,
) -> BatchVerificationInput:
    application = _parse_item_application_data(index, application_data)
    image_bytes = await _read_item_image(index, image, max_upload_mb)

    if application.error is not None:
        return application
    if image_bytes.error is not None:
        return image_bytes

    return BatchVerificationInput(
        index=index,
        application=application.application,
        image_bytes=image_bytes.image_bytes,
        content_type=image_bytes.content_type,
        filename=image_bytes.filename,
    )


def _parse_item_application_data(
    index: int, application_data: str | None
) -> BatchVerificationInput:
    if application_data is None:
        return BatchVerificationInput(
            index=index,
            error=validation_item_error(
                "This label is missing application data.",
                {"index": index, "field": "application_data"},
            ),
        )

    try:
        payload = json.loads(application_data)
    except json.JSONDecodeError:
        return BatchVerificationInput(
            index=index,
            error=bad_request_item_error(
                "Application data must be valid JSON.",
                {"index": index, "field": "application_data"},
            ),
        )

    if not isinstance(payload, dict):
        return BatchVerificationInput(
            index=index,
            error=validation_item_error(
                "Application data must be a JSON object.",
                {"index": index, "field": "application_data"},
            ),
        )

    try:
        return BatchVerificationInput(
            index=index,
            application=ApplicationData.model_validate(payload),
        )
    except ValidationError as exc:
        return BatchVerificationInput(
            index=index,
            error=validation_item_error(
                "Application data is missing required fields or contains unsupported fields.",
                {"index": index, "field_errors": _safe_model_errors(exc.errors())},
            ),
        )


async def _read_item_image(
    index: int, image: UploadFile | None, max_upload_mb: int
) -> BatchVerificationInput:
    if image is None:
        return BatchVerificationInput(
            index=index,
            error=validation_item_error(
                "This label is missing an image.",
                {"index": index, "field": "image"},
            ),
        )

    max_bytes = max_upload_mb * 1024 * 1024
    try:
        image_bytes = await image.read(max_bytes + 1)
    except Exception:
        return BatchVerificationInput(
            index=index,
            error=bad_request_item_error(
                "This label image could not be read. Please choose the image again.",
                {"index": index, "field": "image"},
            ),
        )
    if len(image_bytes) > max_bytes:
        return BatchVerificationInput(
            index=index,
            error=file_too_large_item_error(
                f"Please upload an image smaller than {max_upload_mb} MB.",
                {"index": index, "field": "image"},
            ),
        )

    return BatchVerificationInput(
        index=index,
        image_bytes=image_bytes,
        content_type=image.content_type or "",
        filename=image.filename,
    )


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
