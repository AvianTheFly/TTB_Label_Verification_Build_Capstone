from collections.abc import Iterable

from app.domain.models import CANONICAL_FIELDS, FieldResult, OverallVerdict, VerificationResult

FIELD_ORDER = {field: index for index, field in enumerate(CANONICAL_FIELDS)}


def verdict_for_results(results: Iterable[FieldResult]) -> OverallVerdict:
    return "APPROVED" if all(result.status == "PASS" for result in results) else "NEEDS_REVIEW"


def order_field_results(results: Iterable[FieldResult]) -> list[FieldResult]:
    return sorted(results, key=lambda result: FIELD_ORDER[result.field])


def build_verification_result(
    results: Iterable[FieldResult], *, latency_ms: int | None = None
) -> VerificationResult:
    ordered_results = order_field_results(results)
    return VerificationResult(
        results=ordered_results,
        overall_verdict=verdict_for_results(ordered_results),
        latency_ms=latency_ms,
    )
