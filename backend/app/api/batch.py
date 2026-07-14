import logging
from time import perf_counter
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import get_vision_service
from app.api.request_parsing import build_batch_item
from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.models import BatchResult
from app.services.vision import VisionService
from app.use_cases.batch_verification import process_batch_items
from app.use_cases.timing import elapsed_ms

logger = logging.getLogger(__name__)
router = APIRouter(tags=["verification"])


@router.post("/verify/batch", response_model=BatchResult)
async def verify_batch(
    images: Annotated[list[UploadFile] | None, File()] = None,
    application_data: Annotated[list[str] | None, Form()] = None,
    vision_service: Annotated[VisionService, Depends(get_vision_service)] = None,
) -> BatchResult:
    start = perf_counter()
    try:
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

        parse_start = perf_counter()
        items = [
            await build_batch_item(
                index=index,
                image=image_parts[index] if index < len(image_parts) else None,
                application_data=data_parts[index] if index < len(data_parts) else None,
                max_upload_mb=settings.max_upload_mb,
            )
            for index in range(total)
        ]
        parse_ms = elapsed_ms(parse_start)
        input_error_count = sum(1 for item in items if item.error is not None)
        logger.info(
            (
                "batch_verify_request_accepted total=%s image_parts=%s application_parts=%s "
                "input_error_count=%s parse_ms=%s concurrency_limit=%s max_batch_items=%s"
            ),
            total,
            len(image_parts),
            len(data_parts),
            input_error_count,
            parse_ms,
            settings.batch_concurrency_limit,
            settings.max_batch_items,
            extra={
                "total": total,
                "image_parts": len(image_parts),
                "application_parts": len(data_parts),
                "input_error_count": input_error_count,
                "parse_ms": parse_ms,
                "concurrency_limit": settings.batch_concurrency_limit,
                "max_batch_items": settings.max_batch_items,
            },
        )

        result = await process_batch_items(
            items=items,
            vision_service=vision_service,
            settings=settings,
        )
        latency_ms = elapsed_ms(start)
        latency_budget_ms = int(settings.single_label_timeout_seconds * 1000)
        item_latencies = [
            item.result.latency_ms
            for item in result.items
            if item.result is not None and item.result.latency_ms is not None
        ]
        max_item_latency_ms = max(item_latencies, default=0)
        latency_budget_exceeded_count = sum(
            1 for latency in item_latencies if latency > latency_budget_ms
        )
        item_error_count = sum(1 for item in result.items if item.error is not None)
        if latency_budget_exceeded_count > 0:
            logger.warning(
                (
                    "batch_item_latency_budget_exceeded count=%s "
                    "max_item_latency_ms=%s latency_budget_ms=%s"
                ),
                latency_budget_exceeded_count,
                max_item_latency_ms,
                latency_budget_ms,
                extra={
                    "latency_budget_exceeded_count": latency_budget_exceeded_count,
                    "max_item_latency_ms": max_item_latency_ms,
                    "latency_budget_ms": latency_budget_ms,
                },
            )

        logger.info(
            (
                "batch_verify_completed latency_ms=%s total=%s passed=%s "
                "needs_review=%s item_error_count=%s max_item_latency_ms=%s "
                "latency_budget_ms=%s latency_budget_exceeded_count=%s "
                "concurrency_limit=%s"
            ),
            latency_ms,
            result.summary.total,
            result.summary.passed,
            result.summary.needs_review,
            item_error_count,
            max_item_latency_ms,
            latency_budget_ms,
            latency_budget_exceeded_count,
            settings.batch_concurrency_limit,
            extra={
                "latency_ms": latency_ms,
                "total": result.summary.total,
                "passed": result.summary.passed,
                "needs_review": result.summary.needs_review,
                "item_error_count": item_error_count,
                "max_item_latency_ms": max_item_latency_ms,
                "latency_budget_ms": latency_budget_ms,
                "latency_budget_exceeded_count": latency_budget_exceeded_count,
                "concurrency_limit": settings.batch_concurrency_limit,
            },
        )
        return result
    except ApiError as exc:
        latency_ms = elapsed_ms(start)
        logger.warning(
            "batch_verify_failed latency_ms=%s error_code=%s",
            latency_ms,
            exc.code,
            extra={"latency_ms": latency_ms, "error_code": exc.code},
        )
        raise
