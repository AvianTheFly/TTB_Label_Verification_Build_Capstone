from typing import Any

from fastapi.testclient import TestClient

from app.api.dependencies import get_vision_service
from app.core.config import get_settings
from app.domain.comparison import CANONICAL_GOVERNMENT_WARNING
from app.main import create_app


def make_application_data(**overrides: str) -> dict[str, str]:
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
    return data


def make_extracted_data(**overrides: str | None) -> dict[str, str | None]:
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
    return data


def make_client(*, fail_if_vision_called: bool = False) -> TestClient:
    get_settings.cache_clear()
    app = create_app()

    if fail_if_vision_called:
        def fail_vision_dependency():
            raise AssertionError("VisionService must not be used by /compare")

        app.dependency_overrides[get_vision_service] = fail_vision_dependency

    return TestClient(app)


def post_compare(
    client: TestClient,
    *,
    application_data: dict[str, Any] | None = None,
    extracted_data: dict[str, Any] | None = None,
    field_decisions: dict[str, Any] | None = None,
):
    payload: dict[str, Any] = {}
    if application_data is not None:
        payload["application_data"] = application_data
    if extracted_data is not None:
        payload["extracted_data"] = extracted_data
    if field_decisions is not None:
        payload["field_decisions"] = field_decisions
    return client.post("/compare", json=payload)


def assert_error_envelope(response, code: str) -> None:
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["message"]
    assert isinstance(body["error"]["details"], dict)


def test_compare_matching_values_return_approved_without_vision_call() -> None:
    client = make_client(fail_if_vision_called=True)

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "APPROVED"
    assert isinstance(body["latency_ms"], int)
    assert body["latency_ms"] >= 0
    assert len(body["results"]) == 7
    assert {result["field"] for result in body["results"]} == set(make_application_data())
    assert all(result["status"] == "PASS" for result in body["results"])


def test_compare_title_case_government_warning_returns_needs_review() -> None:
    client = make_client()
    warning_with_wrong_case = CANONICAL_GOVERNMENT_WARNING.replace(
        "GOVERNMENT WARNING:", "Government Warning:"
    )

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(government_warning=warning_with_wrong_case),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    by_field = {result["field"]: result for result in body["results"]}
    assert by_field["government_warning"]["status"] == "FAIL"
    assert by_field["government_warning"]["found"] == warning_with_wrong_case


def test_compare_abv_normalization_works() -> None:
    client = make_client()

    response = post_compare(
        client,
        application_data=make_application_data(abv="45%"),
        extracted_data=make_extracted_data(abv="45% Alc./Vol. (90 Proof)"),
    )

    assert response.status_code == 200
    by_field = {result["field"]: result for result in response.json()["results"]}
    assert by_field["abv"]["status"] == "PASS"
    assert by_field["abv"]["match_type"] == "numeric"


def test_compare_net_contents_normalization_works() -> None:
    client = make_client()

    response = post_compare(
        client,
        application_data=make_application_data(net_contents="0.75 L"),
        extracted_data=make_extracted_data(net_contents="750ml"),
    )

    assert response.status_code == 200
    by_field = {result["field"]: result for result in response.json()["results"]}
    assert by_field["net_contents"]["status"] == "PASS"
    assert by_field["net_contents"]["match_type"] == "unit"


def test_compare_country_synonym_normalization_works() -> None:
    client = make_client()

    response = post_compare(
        client,
        application_data=make_application_data(country_of_origin="United States"),
        extracted_data=make_extracted_data(country_of_origin="USA"),
    )

    assert response.status_code == 200
    by_field = {result["field"]: result for result in response.json()["results"]}
    assert by_field["country_of_origin"]["status"] == "PASS"
    assert by_field["country_of_origin"]["match_type"] == "synonym"


def test_compare_allows_null_extracted_fields_and_returns_needs_review() -> None:
    client = make_client()

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(
            brand_name=None,
            class_type=None,
            abv=None,
            net_contents=None,
            producer=None,
            country_of_origin=None,
            government_warning=None,
        ),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    assert all(result["status"] == "FAIL" for result in body["results"])
    assert all(result["found"] is None for result in body["results"])


def test_compare_field_decision_pass_overrides_backend_failure() -> None:
    client = make_client(fail_if_vision_called=True)

    response = post_compare(
        client,
        application_data=make_application_data(brand_name="OLD TOM DISTILLERY"),
        extracted_data=make_extracted_data(brand_name="WRONG BRAND"),
        field_decisions={"brand_name": "pass"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "APPROVED"
    by_field = {result["field"]: result for result in body["results"]}
    assert by_field["brand_name"]["status"] == "PASS"
    assert by_field["brand_name"]["message"] == "Reviewer marked this field as pass."


def test_compare_field_decision_review_overrides_backend_pass() -> None:
    client = make_client(fail_if_vision_called=True)

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(),
        field_decisions={"brand_name": "review"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    by_field = {result["field"]: result for result in body["results"]}
    assert by_field["brand_name"]["status"] == "FAIL"
    assert by_field["brand_name"]["message"] == "Reviewer marked this field as needs review."


def test_compare_field_decision_fail_overrides_backend_pass() -> None:
    client = make_client(fail_if_vision_called=True)

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(),
        field_decisions={"brand_name": "fail"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    by_field = {result["field"]: result for result in body["results"]}
    assert by_field["brand_name"]["status"] == "FAIL"
    assert by_field["brand_name"]["message"] == "Reviewer marked this field as fail."


def test_compare_rejects_missing_request_body_with_error_envelope() -> None:
    client = make_client()

    response = client.post("/compare")

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    assert response.json()["error"]["details"]["fields"] == [
        "application_data",
        "extracted_data",
    ]


def test_compare_does_not_accept_images() -> None:
    client = make_client(fail_if_vision_called=True)

    response = client.post(
        "/compare",
        files={"image": ("label.png", b"not used", "image/png")},
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")


def test_compare_rejects_missing_required_extracted_field() -> None:
    client = make_client()
    extracted_data = make_extracted_data()
    del extracted_data["government_warning"]

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=extracted_data,
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    field_errors = response.json()["error"]["details"]["field_errors"]
    assert {
        "field": "extracted_data.government_warning",
        "message": "Field required",
        "type": "missing",
    } in field_errors


def test_compare_rejects_extra_extracted_fields() -> None:
    client = make_client()
    extracted_data = make_extracted_data()
    extracted_data["raw_text"] = "frontend should not send provider metadata"

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=extracted_data,
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    field_errors = response.json()["error"]["details"]["field_errors"]
    assert {
        "field": "extracted_data.raw_text",
        "message": "Extra inputs are not permitted",
        "type": "extra_forbidden",
    } in field_errors


def test_compare_rejects_extra_application_fields() -> None:
    client = make_client()
    application_data = make_application_data()
    application_data["alcohol_content"] = "45%"

    response = post_compare(
        client,
        application_data=application_data,
        extracted_data=make_extracted_data(),
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    field_errors = response.json()["error"]["details"]["field_errors"]
    assert {
        "field": "application_data.alcohol_content",
        "message": "Extra inputs are not permitted",
        "type": "extra_forbidden",
    } in field_errors


def test_compare_rejects_extra_field_decision_fields() -> None:
    client = make_client()

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(),
        field_decisions={"alcohol_content": "pass"},
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    field_errors = response.json()["error"]["details"]["field_errors"]
    assert {
        "field": "field_decisions.alcohol_content",
        "message": "Extra inputs are not permitted",
        "type": "extra_forbidden",
    } in field_errors


def test_compare_rejects_unknown_field_decision_values() -> None:
    client = make_client()

    response = post_compare(
        client,
        application_data=make_application_data(),
        extracted_data=make_extracted_data(),
        field_decisions={"brand_name": "approve"},
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    field_errors = response.json()["error"]["details"]["field_errors"]
    assert any(error["field"] == "field_decisions.brand_name" for error in field_errors)
