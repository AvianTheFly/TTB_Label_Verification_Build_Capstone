from collections.abc import Callable

from rapidfuzz import fuzz

from app.domain.models import (
    ApplicationData,
    CanonicalField,
    ExtractedLabel,
    FieldResult,
    LabelFormatting,
    MatchType,
    VerificationResult,
)
from app.domain.normalization import (
    ABV_TOLERANCE,
    NET_CONTENTS_TOLERANCE_ML,
    collapse_whitespace,
    has_us_state_reference,
    normalize_country,
    normalize_for_fuzzy,
    parse_abv,
    parse_net_contents_ml,
)
from app.domain.results import build_verification_result

CANONICAL_GOVERNMENT_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink "
    "alcoholic beverages during pregnancy because of the risk of birth defects. (2) "
    "Consumption of alcoholic beverages impairs your ability to drive a car or operate "
    "machinery, and may cause health problems."
)
FUZZY_THRESHOLD = 90
FieldComparer = Callable[[str, str | None], FieldResult]


def compare_brand_name(expected: str, found: str | None) -> FieldResult:
    return _compare_fuzzy("brand_name", expected, found)


def compare_class_type(expected: str, found: str | None) -> FieldResult:
    return _compare_fuzzy("class_type", expected, found)


def compare_producer(expected: str, found: str | None) -> FieldResult:
    return _compare_fuzzy("producer", expected, found)


def compare_country_of_origin(
    expected: str,
    found: str | None,
    *,
    application_producer: str | None = None,
    extracted_producer: str | None = None,
) -> FieldResult:
    expected_normalized = normalize_country(expected)

    if expected_normalized == "united states" and found is None:
        address_has_state = bool(
            extracted_producer and has_us_state_reference(extracted_producer)
        )
        message = (
            "Domestic application matches U.S. state/address evidence on the label."
            if address_has_state
            else "Country of origin is not required on a domestic United States label."
        )
        return _pass("country_of_origin", "synonym", expected, found, message)

    if found is None:
        return _fail("country_of_origin", "synonym", expected, found, "No extracted value found.")

    found_normalized = normalize_country(found)
    if expected_normalized == found_normalized:
        return _pass("country_of_origin", "synonym", expected, found, "Country matches.")

    if expected_normalized == "united states" and (
        has_us_state_reference(found)
        or _matches_application_city(found, application_producer, extracted_producer)
    ):
        return _pass(
            "country_of_origin",
            "synonym",
            expected,
            found,
            "Domestic application matches U.S. city/state evidence on the label.",
        )

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
    if expected_ml is None:
        return _fail(
            "net_contents",
            "unit",
            expected,
            found,
            "Application net contents needs an amount and supported unit, such as 750 mL.",
        )
    if found_ml is None:
        return _fail(
            "net_contents",
            "unit",
            expected,
            found,
            "AI detected net contents text, but its amount or unit could not be interpreted. "
            "Review the detected value.",
        )

    if abs(expected_ml - found_ml) <= NET_CONTENTS_TOLERANCE_ML:
        return _pass("net_contents", "unit", expected, found, "Net contents match.")

    return _fail(
        "net_contents",
        "unit",
        expected,
        found,
        f"Net contents do not match after unit conversion: {expected_ml:g} mL expected, "
        f"{found_ml:g} mL detected.",
    )


def compare_government_warning(
    expected: str, found: str | None, lead_in_bold: bool | None = None
) -> FieldResult:
    if found is None:
        return _fail("government_warning", "exact", expected, found, "No extracted value found.")

    canonical_collapsed = collapse_whitespace(CANONICAL_GOVERNMENT_WARNING)
    expected_collapsed = collapse_whitespace(expected)
    found_collapsed = collapse_whitespace(found)

    if expected_collapsed != canonical_collapsed:
        return _fail(
            "government_warning",
            "exact",
            expected,
            found,
            "Application government warning does not match the canonical statement after "
            "whitespace collapse.",
        )

    if found_collapsed == canonical_collapsed:
        if lead_in_bold is False:
            return _fail(
                "government_warning",
                "exact",
                expected,
                found,
                "Government warning text matches, but AI did not detect bold styling on the "
                "GOVERNMENT WARNING: lead-in.",
            )
        if lead_in_bold is True:
            return _pass(
                "government_warning",
                "exact",
                expected,
                found,
                "Government warning text matches exactly after whitespace collapse, and AI "
                "detected bold styling on the GOVERNMENT WARNING: lead-in.",
            )
        return _fail(
            "government_warning",
            "exact",
            expected,
            found,
            "Government warning text matches exactly, but AI could not determine whether the "
            "GOVERNMENT WARNING: lead-in is bold. The text is likely compliant; human review "
            "of bold styling is required.",
        )

    return _fail(
        "government_warning",
        "exact",
        expected,
        found,
        "Government warning does not match the canonical statement after whitespace collapse. "
        f"AI detected: {found_collapsed}",
    )


FIELD_COMPARERS: tuple[tuple[CanonicalField, FieldComparer], ...] = (
    ("brand_name", compare_brand_name),
    ("class_type", compare_class_type),
    ("abv", compare_abv),
    ("net_contents", compare_net_contents),
    ("producer", compare_producer),
    ("country_of_origin", compare_country_of_origin),
    ("government_warning", compare_government_warning),
)


def compare_label(
    application_data: ApplicationData, extracted_label: ExtractedLabel
) -> VerificationResult:
    results = []
    for field, compare in FIELD_COMPARERS:
        if field == "government_warning":
            results.append(
                compare_government_warning(
                    application_data.government_warning,
                    extracted_label.government_warning,
                    extracted_label.government_warning_lead_in_bold,
                )
            )
        elif field == "country_of_origin":
            results.append(
                compare_country_of_origin(
                    application_data.country_of_origin,
                    extracted_label.country_of_origin,
                    application_producer=application_data.producer,
                    extracted_producer=extracted_label.producer,
                )
            )
        else:
            results.append(
                compare(getattr(application_data, field), getattr(extracted_label, field))
            )
    return build_verification_result(
        results,
        extracted_formatting=LabelFormatting(
            government_warning_lead_in_bold=extracted_label.government_warning_lead_in_bold
        ),
    )


def _matches_application_city(
    found: str,
    application_producer: str | None,
    extracted_producer: str | None,
) -> bool:
    normalized_found = normalize_for_fuzzy(found)
    if not normalized_found or len(normalized_found.split()) > 3:
        return False
    return bool(
        application_producer
        and extracted_producer
        and normalized_found in normalize_for_fuzzy(application_producer)
        and normalized_found in normalize_for_fuzzy(extracted_producer)
    )


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
    field: CanonicalField, match_type: MatchType, expected: str, found: str | None, message: str
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
    field: CanonicalField, match_type: MatchType, expected: str, found: str | None, message: str
) -> FieldResult:
    return FieldResult(
        field=field,
        match_type=match_type,
        expected=expected,
        found=found,
        status="FAIL",
        message=message,
    )
