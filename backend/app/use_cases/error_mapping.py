from typing import Any

from app.domain.models import BatchItemError
from app.services.image_preprocess import ImagePreprocessError
from app.services.vision import VisionServiceError


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
