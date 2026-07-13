import ast
from pathlib import Path

from app.domain.comparison import (
    CANONICAL_GOVERNMENT_WARNING,
    compare_label,
)
from app.domain.models import CANONICAL_FIELDS, ApplicationData, ExtractedLabel


def make_application(**overrides: str) -> ApplicationData:
    data = {
        "brand_name": "OLD TOM DISTILLERY",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45%",
        "net_contents": "750 mL",
        "producer": "Old Tom Distillery, Louisville, KY",
        "country_of_origin": "United States",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
    }
    data.update(overrides)
    return ApplicationData(**data)


def make_extracted(**overrides: str | None) -> ExtractedLabel:
    data = {
        "brand_name": "Old Tom Distillery",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750ml",
        "producer": "OLD TOM DISTILLERY, LOUISVILLE KY",
        "country_of_origin": "USA",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
    }
    data.update(overrides)
    return ExtractedLabel(**data)


def result_for_field(application: ApplicationData, extracted: ExtractedLabel, field: str):
    result = compare_label(application, extracted)
    return next(field_result for field_result in result.results if field_result.field == field)


def test_case_only_brand_difference_passes() -> None:
    field_result = result_for_field(
        make_application(brand_name="STONE'S THROW"),
        make_extracted(brand_name="Stone's Throw"),
        "brand_name",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "fuzzy"


def test_abv_normalization_matches_plain_percent_to_label_format() -> None:
    field_result = result_for_field(
        make_application(abv="45%"),
        make_extracted(abv="45% Alc./Vol. (90 Proof)"),
        "abv",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "numeric"


def test_class_type_uses_fuzzy_normalization() -> None:
    field_result = result_for_field(
        make_application(class_type="Kentucky Straight Bourbon Whiskey"),
        make_extracted(class_type="kentucky straight bourbon whisky"),
        "class_type",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "fuzzy"


def test_producer_uses_fuzzy_normalization() -> None:
    field_result = result_for_field(
        make_application(producer="Old Tom Distillery, Louisville, KY"),
        make_extracted(producer="OLD TOM DISTILLERY LOUISVILLE KY"),
        "producer",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "fuzzy"


def test_abv_outside_tolerance_fails() -> None:
    field_result = result_for_field(
        make_application(abv="45%"),
        make_extracted(abv="46%"),
        "abv",
    )

    assert field_result.status == "FAIL"


def test_net_contents_normalization_matches_spacing_and_case() -> None:
    field_result = result_for_field(
        make_application(net_contents="750 mL"),
        make_extracted(net_contents="750ml"),
        "net_contents",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "unit"


def test_net_contents_normalization_converts_liters_to_ml() -> None:
    field_result = result_for_field(
        make_application(net_contents="0.75 L"),
        make_extracted(net_contents="750 mL"),
        "net_contents",
    )

    assert field_result.status == "PASS"


def test_net_contents_normalization_matches_fluid_ounces() -> None:
    field_result = result_for_field(
        make_application(net_contents="12 fl oz"),
        make_extracted(net_contents="12 fl oz"),
        "net_contents",
    )

    assert field_result.status == "PASS"


def test_country_synonym_normalization_matches_usa_to_united_states() -> None:
    field_result = result_for_field(
        make_application(country_of_origin="United States"),
        make_extracted(country_of_origin="USA"),
        "country_of_origin",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "synonym"


def test_title_case_government_warning_fails_without_lowercasing() -> None:
    title_case_warning = CANONICAL_GOVERNMENT_WARNING.replace(
        "GOVERNMENT WARNING:", "Government Warning:"
    )
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=title_case_warning),
        "government_warning",
    )

    assert field_result.status == "FAIL"
    assert field_result.found == title_case_warning


def test_missing_colon_government_warning_fails() -> None:
    missing_colon_warning = CANONICAL_GOVERNMENT_WARNING.replace(
        "GOVERNMENT WARNING:", "GOVERNMENT WARNING"
    )
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=missing_colon_warning),
        "government_warning",
    )

    assert field_result.status == "FAIL"
    assert field_result.found == missing_colon_warning


def test_correct_all_caps_government_warning_passes() -> None:
    field_result = result_for_field(make_application(), make_extracted(), "government_warning")

    assert field_result.status == "PASS"
    assert field_result.match_type == "exact"


def test_government_warning_compares_application_to_extracted_not_canonical() -> None:
    submitted_warning = "GOVERNMENT WARNING: Label-specific application text."
    extracted_warning = "GOVERNMENT WARNING:\n\nLabel-specific   application text."
    field_result = result_for_field(
        make_application(government_warning=submitted_warning),
        make_extracted(government_warning=extracted_warning),
        "government_warning",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "exact"


def test_non_statute_government_warning_passes_when_application_and_extracted_match() -> None:
    non_statute_warning = "GOVERNMENT WARNING: Short label-specific warning."
    field_result = result_for_field(
        make_application(government_warning=non_statute_warning),
        make_extracted(government_warning=non_statute_warning),
        "government_warning",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "exact"


def test_canonical_government_warning_passes_with_extra_extracted_spaces() -> None:
    extracted_warning = CANONICAL_GOVERNMENT_WARNING.replace(
        "According to the Surgeon General",
        "According  to  the  Surgeon  General",
    )
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=extracted_warning),
        "government_warning",
    )

    assert field_result.status == "PASS"
    assert field_result.match_type == "exact"


def test_misread_warning_failure_returns_extracted_warning_text_in_found() -> None:
    misread_warning = CANONICAL_GOVERNMENT_WARNING.replace("pregnancy", "prcgnancy")
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=misread_warning),
        "government_warning",
    )

    assert field_result.status == "FAIL"
    assert field_result.found == misread_warning
    assert "AI detected:" in field_result.message
    assert misread_warning in field_result.message


def test_warning_failure_message_contains_normalized_extracted_text() -> None:
    extracted_warning = (
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should\n\n"
        "not drink alcoholic beverages because of OCR drift."
    )
    normalized_warning = (
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should "
        "not drink alcoholic beverages because of OCR drift."
    )
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=extracted_warning),
        "government_warning",
    )

    assert field_result.status == "FAIL"
    assert field_result.found == extracted_warning
    assert normalized_warning in field_result.message


def test_government_warning_does_not_use_fuzzy_matching() -> None:
    near_match = CANONICAL_GOVERNMENT_WARNING.replace("health problems.", "health problem.")
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=near_match),
        "government_warning",
    )

    assert field_result.status == "FAIL"
    assert field_result.match_type == "exact"


def test_government_warning_whitespace_only_differences_pass() -> None:
    spaced_warning = CANONICAL_GOVERNMENT_WARNING.replace(" (1) ", "\n\n(1)   ").replace(
        " (2) ", "\t(2) "
    )
    field_result = result_for_field(
        make_application(),
        make_extracted(government_warning=spaced_warning),
        "government_warning",
    )

    assert field_result.status == "PASS"


def test_missing_extracted_value_fails_with_found_none() -> None:
    field_result = result_for_field(
        make_application(brand_name="OLD TOM DISTILLERY"),
        make_extracted(brand_name=None),
        "brand_name",
    )

    assert field_result.status == "FAIL"
    assert field_result.found is None


def test_compare_label_returns_exactly_seven_canonical_fields_in_stable_order() -> None:
    result = compare_label(make_application(), make_extracted())

    assert [field_result.field for field_result in result.results] == list(CANONICAL_FIELDS)


def test_models_use_exact_canonical_field_names() -> None:
    expected_application_fields = set(CANONICAL_FIELDS)
    expected_extracted_fields = expected_application_fields | {"raw_text", "extraction_confidence"}

    assert set(ApplicationData.model_fields) == expected_application_fields
    assert set(ExtractedLabel.model_fields) == expected_extracted_fields


def test_any_field_fail_sets_needs_review_verdict() -> None:
    result = compare_label(
        make_application(brand_name="Old Tom"),
        make_extracted(brand_name="Other"),
    )

    assert result.overall_verdict == "NEEDS_REVIEW"


def test_all_fields_pass_sets_approved_verdict() -> None:
    result = compare_label(make_application(), make_extracted())

    assert result.overall_verdict == "APPROVED"


def test_domain_modules_do_not_import_forbidden_later_phase_dependencies() -> None:
    forbidden_roots = {
        "fastapi",
        "app.api",
        "app.services",
        "httpx",
        "requests",
        "openai",
        "anthropic",
        "PIL",
        "cv2",
        "pathlib",
        "os",
        "shutil",
    }
    domain_dir = Path(__file__).parents[1] / "app" / "domain"

    for path in domain_dir.glob("*.py"):
        tree = ast.parse(path.read_text())
        imported_names: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported_names.update(alias.name for alias in node.names)
            if isinstance(node, ast.ImportFrom) and node.module:
                imported_names.add(node.module)

        assert not imported_names & forbidden_roots, f"{path.name} imports {imported_names}"
