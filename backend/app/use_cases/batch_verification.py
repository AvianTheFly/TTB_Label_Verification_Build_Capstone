import asyncio
from dataclasses import dataclass
from typing import Any

from app.core.config import Settings
from app.domain.models import (
    ApplicationData,
    BatchItemError,
    BatchItemResult,
    BatchResult,
    BatchSummary,
)
from app.services.image_preprocess import ImagePreprocessError
from app.services.vision import VisionService, VisionServiceError
from app.use_cases.verification import verify_label_image


@dataclass(frozen=True)
class BatchVerificationInput:
    index: int
    application: ApplicationData | None = None
    image_bytes: bytes | None = None
    content_type: str = ""
    filename: str | None = None
    error: BatchItemError | None = None


async def process_batch_items(
    *,
    items: list[BatchVerificationInput],
    vision_service: VisionService,
    settings: Settings,
) -> BatchResult:
    limit = max(1, settings.batch_concurrency_limit)
    semaphore = asyncio.Semaphore(limit)

    async def process_one(item: BatchVerificationInput) -> BatchItemResult:
        if item.error is not None:
            return BatchItemResult(index=item.index, error=item.error)

        if item.application is None or item.image_bytes is None:
            return BatchItemResult(
                index=item.index,
                error=validation_item_error(
                    "This label is missing an image or application data.",
                    {"index": item.index},
                ),
            )

        async with semaphore:
            try:
                result = await verify_label_image(
                    application=item.application,
                    image_bytes=item.image_bytes,
                    content_type=item.content_type,
                    filename=item.filename,
                    vision_service=vision_service,
                    settings=settings,
                )
            except ImagePreprocessError as exc:
                return BatchItemResult(index=item.index, error=image_preprocess_item_error(exc))
            except VisionServiceError as exc:
                return BatchItemResult(index=item.index, error=vision_item_error(exc))
            except Exception:
                return BatchItemResult(
                    index=item.index,
                    error=BatchItemError(
                        code="internal_error",
                        message="This label could not be checked. Please try again.",
                        details={},
                    ),
                )

        return BatchItemResult(index=item.index, result=result)

    processed = await asyncio.gather(*(process_one(item) for item in items))
    processed.sort(key=lambda item: item.index)
    return BatchResult(items=processed, summary=_summarize(processed))


def validation_item_error(message: str, details: dict[str, Any] | None = None) -> BatchItemError:
    return BatchItemError(code="validation_error", message=message, details=details or {})


def file_too_large_item_error(
    message: str, details: dict[str, Any] | None = None
) -> BatchItemError:
    return BatchItemError(code="file_too_large", message=message, details=details or {})


def bad_request_item_error(message: str, details: dict[str, Any] | None = None) -> BatchItemError:
    return BatchItemError(code="bad_request", message=message, details=details or {})


def image_preprocess_item_error(exc: ImagePreprocessError) -> BatchItemError:
    code = "bad_request"
    if exc.category == "unsupported_file_type":
        code = "unsupported_file_type"
    elif exc.category == "file_too_large":
        code = "file_too_large"

    return BatchItemError(code=code, message=exc.message, details={"field": "image"})


def vision_item_error(exc: VisionServiceError) -> BatchItemError:
    if exc.category == "provider_timeout":
        return BatchItemError(
            code="vision_timeout",
            message="The label reader timed out. Please try again.",
            details={},
        )
    if exc.category == "provider_quota_exceeded":
        return BatchItemError(
            code="vision_quota_exceeded",
            message=(
                "This API call exceeds your current quota. "
                "Please check your OpenAI plan and billing details."
            ),
            details={},
        )
    if exc.category in {"provider_unavailable", "provider_not_configured"}:
        return BatchItemError(
            code="vision_unavailable",
            message="The label reader is not available right now.",
            details={},
        )
    return BatchItemError(
        code="extraction_failed",
        message="The label reader could not extract the label details.",
        details={},
    )


def _summarize(items: list[BatchItemResult]) -> BatchSummary:
    passed = sum(
        1
        for item in items
        if item.result is not None and item.result.overall_verdict == "APPROVED"
    )
    return BatchSummary(passed=passed, needs_review=len(items) - passed, total=len(items))

