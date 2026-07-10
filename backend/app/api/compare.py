import logging
from time import perf_counter
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body
from pydantic import BaseModel, ConfigDict, ValidationError

from app.api.request_parsing import safe_model_errors
from app.core.errors import ApiError
from app.domain.comparison import CANONICAL_FIELDS, compare_label
from app.domain.models import ApplicationData, ExtractedLabel, VerificationResult
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


ReviewerDecision = Literal["pass", "review", "fail"]


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

    extracted_label = ExtractedLabel.model_validate(request.extracted_data.model_dump())
    result = compare_label(request.application_data, extracted_label)
    if request.field_decisions is not None:
        result = _apply_reviewer_decisions(result, request.field_decisions)
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


def _apply_reviewer_decisions(
    result: VerificationResult, decisions: CompareFieldDecisions
) -> VerificationResult:
    decision_map = decisions.model_dump(exclude_none=True)
    if not decision_map:
        return result

    updated_results = []
    for field_result in result.results:
        decision = decision_map.get(field_result.field)
        if decision == "pass":
            updated_results.append(
                field_result.model_copy(
                    update={
                        "status": "PASS",
                        "message": "Reviewer marked this field as pass.",
                    }
                )
            )
        elif decision == "review":
            updated_results.append(
                field_result.model_copy(
                    update={
                        "status": "FAIL",
                        "message": "Reviewer marked this field as needs review.",
                    }
                )
            )
        elif decision == "fail":
            updated_results.append(
                field_result.model_copy(
                    update={
                        "status": "FAIL",
                        "message": "Reviewer marked this field as fail.",
                    }
                )
            )
        else:
            updated_results.append(field_result)

    overall_verdict = (
        "APPROVED"
        if all(field_result.status == "PASS" for field_result in updated_results)
        else "NEEDS_REVIEW"
    )
    ordered_results = sorted(
        updated_results, key=lambda field_result: CANONICAL_FIELDS.index(field_result.field)
    )
    return VerificationResult(results=ordered_results, overall_verdict=overall_verdict)
