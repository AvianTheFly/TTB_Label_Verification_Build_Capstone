from collections.abc import Mapping

from app.domain.comparison import compare_label
from app.domain.models import (
    ApplicationData,
    CanonicalField,
    ExtractedLabel,
    ReviewerDecision,
    VerificationResult,
)
from app.domain.results import build_verification_result


def compare_reviewed_extraction(
    *,
    application: ApplicationData,
    extracted: ExtractedLabel,
    reviewer_decisions: Mapping[CanonicalField, ReviewerDecision] | None = None,
) -> VerificationResult:
    result = compare_label(application, extracted)
    if not reviewer_decisions:
        return result

    updated_results = []
    for field_result in result.results:
        decision = reviewer_decisions.get(field_result.field)
        if decision == "pass":
            updated_results.append(
                field_result.model_copy(
                    update={
                        "status": "PASS",
                        "message": "Reviewer marked this field as pass.",
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

    return build_verification_result(updated_results)
