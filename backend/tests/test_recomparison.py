from app.domain.comparison import CANONICAL_GOVERNMENT_WARNING
from app.domain.models import ApplicationData, ExtractedLabel
from app.use_cases.recomparison import compare_reviewed_extraction


def make_application(**overrides: str) -> ApplicationData:
    values = {
        "brand_name": "OLD TOM DISTILLERY",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol.",
        "net_contents": "750 mL",
        "producer": "Old Tom Distillery, Louisville, KY",
        "country_of_origin": "United States",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
    }
    values.update(overrides)
    return ApplicationData.model_validate(values)


def make_extracted(**overrides: str | None) -> ExtractedLabel:
    values = {
        "brand_name": "Old Tom Distillery",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45%",
        "net_contents": "750ml",
        "producer": "OLD TOM DISTILLERY, LOUISVILLE KY",
        "country_of_origin": "USA",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
        "government_warning_lead_in_bold": True,
    }
    values.update(overrides)
    return ExtractedLabel.model_validate(values)


def test_compare_reviewed_extraction_returns_backend_comparison_without_decisions() -> None:
    result = compare_reviewed_extraction(
        application=make_application(),
        extracted=make_extracted(),
    )

    assert result.overall_verdict == "APPROVED"


def test_compare_reviewed_extraction_applies_reviewer_decisions_after_comparison() -> None:
    result = compare_reviewed_extraction(
        application=make_application(brand_name="OLD TOM DISTILLERY"),
        extracted=make_extracted(brand_name="OTHER DISTILLERY"),
        reviewer_decisions={"brand_name": "pass", "government_warning": "fail"},
    )

    statuses = {field_result.field: field_result.status for field_result in result.results}
    messages = {field_result.field: field_result.message for field_result in result.results}

    assert statuses["brand_name"] == "PASS"
    assert messages["brand_name"] == "Reviewer marked this field as pass."
    assert statuses["government_warning"] == "FAIL"
    assert result.overall_verdict == "NEEDS_REVIEW"
