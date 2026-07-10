import json
from typing import Any, Protocol

from pydantic import ValidationError

from app.core.errors import ApiError
from app.domain.models import ApplicationData
from app.use_cases.batch_verification import (
    BatchVerificationInput,
    bad_request_item_error,
    file_too_large_item_error,
    validation_item_error,
)


class ReadableUpload(Protocol):
    filename: str | None
    content_type: str | None

    async def read(self, size: int = -1) -> bytes: ...


def parse_application_data(application_data: str | None) -> ApplicationData:
    if application_data is None:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please provide application data.",
            details={"field": "application_data"},
        )

    payload = _load_json_object(application_data, field="application_data")
    try:
        return ApplicationData.model_validate(payload)
    except ValidationError as exc:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Application data is missing required fields or contains unsupported fields.",
            details={"field_errors": safe_model_errors(exc.errors())},
        ) from exc


async def read_image_upload(image: ReadableUpload | None, *, max_upload_mb: int) -> bytes:
    if image is None:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please upload a label image.",
            details={"field": "image"},
        )

    max_bytes = max_upload_mb * 1024 * 1024
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
            message=f"Please upload an image smaller than {max_upload_mb} MB.",
            details={"field": "image"},
        )
    return image_bytes


async def build_batch_item(
    *,
    index: int,
    image: ReadableUpload | None,
    application_data: str | None,
    max_upload_mb: int,
) -> BatchVerificationInput:
    application = parse_batch_application_data(index, application_data)
    image_bytes = await read_batch_item_image(index, image, max_upload_mb)

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


def parse_batch_application_data(
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
                {"index": index, "field_errors": safe_model_errors(exc.errors())},
            ),
        )


async def read_batch_item_image(
    index: int, image: ReadableUpload | None, max_upload_mb: int
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


def safe_model_errors(
    errors: list[dict[str, Any]], *, default_field: str = "application_data"
) -> list[dict[str, str]]:
    safe_errors: list[dict[str, str]] = []
    for error in errors:
        loc = error.get("loc", ())
        if not isinstance(loc, tuple | list):
            loc = ()
        safe_errors.append(
            {
                "field": ".".join(str(part) for part in loc) or default_field,
                "message": str(error.get("msg", "Invalid value.")),
                "type": str(error.get("type", "validation_error")),
            }
        )
    return safe_errors


def _load_json_object(raw_json: str, *, field: str) -> dict[str, Any]:
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ApiError(
            status_code=400,
            code="bad_request",
            message="Application data must be valid JSON.",
            details={"field": field},
        ) from exc

    if not isinstance(payload, dict):
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Application data must be a JSON object.",
            details={"field": field},
        )
    return payload

