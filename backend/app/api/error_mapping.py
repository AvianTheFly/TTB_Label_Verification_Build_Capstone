from app.core.errors import ApiError
from app.services.image_preprocess import ImagePreprocessError
from app.services.vision import VisionServiceError


def image_preprocess_api_error(exc: ImagePreprocessError) -> ApiError:
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


def vision_api_error(exc: VisionServiceError) -> ApiError:
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

