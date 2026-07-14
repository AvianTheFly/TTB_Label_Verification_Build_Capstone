import asyncio
from dataclasses import dataclass

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
from app.use_cases.error_mapping import (
    image_preprocess_item_error,
    validation_item_error,
    vision_item_error,
)
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


def _summarize(items: list[BatchItemResult]) -> BatchSummary:
    passed = sum(
        1
        for item in items
        if item.result is not None and item.result.overall_verdict == "APPROVED"
    )
    return BatchSummary(passed=passed, needs_review=len(items) - passed, total=len(items))
