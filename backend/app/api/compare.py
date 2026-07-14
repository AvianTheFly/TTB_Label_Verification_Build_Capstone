import logging
from time import perf_counter
from typing import Annotated, Any

from fastapi import APIRouter, Body
from pydantic import BaseModel, ConfigDict, ValidationError

from app.api.request_parsing import safe_model_errors
from app.core.errors import ApiError
from app.domain.models import (
    ApplicationData,
    ExtractedLabel,
    LabelFormatting,
    ReviewerDecision,
    VerificationResult,
)
from app.use_cases.recomparison import compare_reviewed_extraction
from app.use_cases.timing import elapsed_ms

logger = logging.getLogger(__name__)
router = APIRouter(tags=["verification"])


class CompareExtractedData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: str | None
    class_type: str | None
    abv: str | None
    net_contents: str | None
    producer: str | None
    country_of_origin: str | None
    government_warning: str | None


class CompareFieldDecisions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: ReviewerDecision | None = None
    class_type: ReviewerDecision | None = None
    abv: ReviewerDecision | None = None
    net_contents: ReviewerDecision | None = None
    producer: ReviewerDecision | None = None
    country_of_origin: ReviewerDecision | None = None
    government_warning: ReviewerDecision | None = None


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    application_data: ApplicationData
    extracted_data: CompareExtractedData
    extracted_formatting: LabelFormatting | None = None
    field_decisions: CompareFieldDecisions | None = None


@router.post("/compare", response_model=VerificationResult)
async def compare_extracted_values(
    payload: Annotated[dict[str, Any] | None, Body()] = None,
) -> VerificationResult:
    start = perf_counter()
    if payload is None:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message="Please provide application data and extracted data.",
            details={"fields": ["application_data", "extracted_data"]},
        )

    try:
        request = CompareRequest.model_validate(payload)
    except ValidationError as exc:
        raise ApiError(
            status_code=422,
            code="validation_error",
            message=(
                "Application data and extracted data are missing required fields "
                "or contain unsupported fields."
            ),
            details={"field_errors": safe_model_errors(exc.errors(), default_field="request")},
        ) from exc

    extracted_label = ExtractedLabel.model_validate(
        {
            **request.extracted_data.model_dump(),
            **(
                request.extracted_formatting.model_dump()
                if request.extracted_formatting is not None
                else {}
            ),
        }
    )
    reviewer_decisions = (
        request.field_decisions.model_dump(exclude_none=True)
        if request.field_decisions is not None
        else None
    )
    result = compare_reviewed_extraction(
        application=request.application_data,
        extracted=extracted_label,
        reviewer_decisions=reviewer_decisions,
    )
    result.latency_ms = elapsed_ms(start)
    logger.info(
        "compare_request_completed latency_ms=%s overall_verdict=%s",
        result.latency_ms,
        result.overall_verdict,
        extra={
            "latency_ms": result.latency_ms,
            "overall_verdict": result.overall_verdict,
        },
    )
    return result
