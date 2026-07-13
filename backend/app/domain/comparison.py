from collections.abc import Callable

from rapidfuzz import fuzz

from app.domain.models import (
    ApplicationData,
    CanonicalField,
    ExtractedLabel,
    FieldResult,
    VerificationResult,
)
from app.domain.normalization import (
    ABV_TOLERANCE,
    NET_CONTENTS_TOLERANCE_ML,
    collapse_whitespace,
    normalize_country,
    normalize_for_fuzzy,
    parse_abv,
    parse_net_contents_ml,
)

CANONICAL_FIELDS: tuple[CanonicalField, ...] = (
    "brand_name",
    "class_type",
    "abv",
    "net_contents",
    "producer",
    "country_of_origin",
    "government_warning",
)
CANONICAL_GOVERNMENT_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink "
    "alcoholic beverages during pregnancy because of the risk of birth defects. (2) "
    "Consumption of alcoholic beverages impairs your ability to drive a car or operate "
    "machinery, and may cause health problems."
)
FUZZY_THRESHOLD = 90


def compare_brand_name(expected: str, found: str | None) -> FieldResult:
    return _compare_fuzzy("brand_name", expected, found)


def compare_class_type(expected: str, found: str | None) -> FieldResult:
    return _compare_fuzzy("class_type", expected, found)


def compare_producer(expected: str, found: str | None) -> FieldResult:
    return _compare_fuzzy("producer", expected, found)


def compare_country_of_origin(expected: str, found: str | None) -> FieldResult:
    if found is None:
        return _fail("country_of_origin", "synonym", expected, found, "No extracted value found.")

    expected_normalized = normalize_country(expected)
    found_normalized = normalize_country(found)
    if expected_normalized == found_normalized:
        return _pass("country_of_origin", "synonym", expected, found, "Country matches.")

    return _fail(
        "country_of_origin",
        "synonym",
        expected,
        found,
        "Country does not match after synonym normalization.",
    )


def compare_abv(expected: str, found: str | None) -> FieldResult:
    if found is None:
        return _fail("abv", "numeric", expected, found, "No extracted value found.")

    expected_abv = parse_abv(expected)
    found_abv = parse_abv(found)
    if expected_abv is None or found_abv is None:
        return _fail("abv", "numeric", expected, found, "Could not parse alcohol content.")

    if abs(expected_abv - found_abv) <= ABV_TOLERANCE:
        return _pass("abv", "numeric", expected, found, "ABV matches within tolerance.")

    return _fail("abv", "numeric", expected, found, "ABV is outside tolerance.")


def compare_net_contents(expected: str, found: str | None) -> FieldResult:
    if found is None:
        return _fail("net_contents", "unit", expected, found, "No extracted value found.")

    expected_ml = parse_net_contents_ml(expected)
    found_ml = parse_net_contents_ml(found)
    if expected_ml is None or found_ml is None:
        return _fail("net_contents", "unit", expected, found, "Could not parse net contents.")

    if abs(expected_ml - found_ml) <= NET_CONTENTS_TOLERANCE_ML:
        return _pass("net_contents", "unit", expected, found, "Net contents match.")

    return _fail("net_contents", "unit", expected, found, "Net contents do not match.")


def compare_government_warning(expected: str, found: str | None) -> FieldResult:
    if found is None:
        return _fail("government_warning", "exact", expected, found, "No extracted value found.")

    expected_collapsed = collapse_whitespace(expected)
    found_collapsed = collapse_whitespace(found)

    if expected_collapsed == found_collapsed:
        return _pass(
            "government_warning",
            "exact",
            expected,
            found,
            "Government warning text matches exactly after whitespace collapse.",
        )

    return _fail(
        "government_warning",
        "exact",
        expected,
        found,
        "Government warning does not match after whitespace collapse. "
        f"AI detected: {found_collapsed}",
    )


def compare_label(
    application_data: ApplicationData, extracted_label: ExtractedLabel
) -> VerificationResult:
    comparisons: tuple[tuple[CanonicalField, Callable[[str, str | None], FieldResult]], ...] = (
        ("brand_name", compare_brand_name),
        ("class_type", compare_class_type),
        ("abv", compare_abv),
        ("net_contents", compare_net_contents),
        ("producer", compare_producer),
        ("country_of_origin", compare_country_of_origin),
        ("government_warning", compare_government_warning),
    )
    results = [
        compare(getattr(application_data, field), getattr(extracted_label, field))
        for field, compare in comparisons
    ]
    overall_verdict = (
        "APPROVED" if all(result.status == "PASS" for result in results) else "NEEDS_REVIEW"
    )
    return VerificationResult(results=results, overall_verdict=overall_verdict)


def _compare_fuzzy(field: CanonicalField, expected: str, found: str | None) -> FieldResult:
    if found is None:
        return _fail(field, "fuzzy", expected, found, "No extracted value found.")

    expected_normalized = normalize_for_fuzzy(expected)
    found_normalized = normalize_for_fuzzy(found)
    score = fuzz.token_sort_ratio(expected_normalized, found_normalized)
    if score >= FUZZY_THRESHOLD:
        return _pass(field, "fuzzy", expected, found, "Values match after fuzzy normalization.")

    return _fail(
        field,
        "fuzzy",
        expected,
        found,
        f"Fuzzy match score {score:.1f} is below threshold {FUZZY_THRESHOLD}.",
    )


def _pass(
    field: CanonicalField, match_type: str, expected: str, found: str | None, message: str
) -> FieldResult:
    return FieldResult(
        field=field,
        match_type=match_type,
        expected=expected,
        found=found,
        status="PASS",
        message=message,
    )


def _fail(
    field: CanonicalField, match_type: str, expected: str, found: str | None, message: str
) -> FieldResult:
    return FieldResult(
        field=field,
        match_type=match_type,
        expected=expected,
        found=found,
        status="FAIL",
        message=message,
    )
