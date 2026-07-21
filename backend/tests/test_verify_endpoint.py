import asyncio
import json
from io import BytesIO
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from app.api.dependencies import get_vision_service
from app.api.request_parsing import read_image_upload
from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.comparison import CANONICAL_GOVERNMENT_WARNING
from app.domain.models import ExtractedLabel
from app.main import create_app
from app.services.fake_vision import FakeVisionService
from app.services.vision import VisionServiceError


class SlowVisionService:
    def __init__(self, delay_seconds: float) -> None:
        self._delay_seconds = delay_seconds
        self.calls = []

    async def extract_label(self, image):
        self.calls.append(image)
        await asyncio.sleep(self._delay_seconds)
        return make_extracted_label()


def make_image_bytes(image_format: str = "PNG") -> bytes:
    image = Image.new("RGB", (800, 400), color=(240, 240, 240))
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


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


def make_extracted_label(**overrides: object) -> ExtractedLabel:
    data = {
        "brand_name": "Old Tom Distillery",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750ml",
        "producer": "OLD TOM DISTILLERY, LOUISVILLE KY",
        "country_of_origin": "USA",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
        "government_warning_lead_in_bold": True,
    }
    data.update(overrides)
    return ExtractedLabel(**data)


def make_client(
    fake_service: FakeVisionService | None = None,
) -> tuple[TestClient, FakeVisionService]:
    get_settings.cache_clear()
    app = create_app()
    service = fake_service or FakeVisionService(result=make_extracted_label())
    app.dependency_overrides[get_vision_service] = lambda: service
    return TestClient(app), service


def post_verify(
    client: TestClient,
    *,
    application_data: dict[str, Any] | str | None = None,
    image_bytes: bytes | None = None,
    filename: str = "label.png",
    content_type: str = "image/png",
    extra_data: dict[str, str] | None = None,
):
    data = dict(extra_data or {})
    if application_data is not None:
        data["application_data"] = (
            application_data if isinstance(application_data, str) else json.dumps(application_data)
        )
    files = None
    if image_bytes is not None:
        files = {"image": (filename, image_bytes, content_type)}
    return client.post("/verify", data=data, files=files)


def assert_error_envelope(response, code: str) -> None:
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["message"]
    assert isinstance(body["error"]["details"], dict)


def assert_verification_result_literals(body: dict[str, Any]) -> None:
    assert body["overall_verdict"] in {"APPROVED", "NEEDS_REVIEW"}
    for result in body["results"]:
        assert result["status"] in {"PASS", "FAIL"}


def test_valid_verify_submission_returns_full_verification_result() -> None:
    client, fake_service = make_client()

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    assert body["overall_verdict"] == "APPROVED"
    assert body["extracted_formatting"] == {"government_warning_lead_in_bold": True}
    assert isinstance(body["latency_ms"], int)
    assert body["latency_ms"] >= 0
    assert len(body["results"]) == 7
    assert {result["field"] for result in body["results"]} == set(make_application_data())
    for result in body["results"]:
        assert set(result) == {"field", "match_type", "expected", "found", "status", "message"}
        assert result["expected"] is not None
        assert result["found"] is not None
    assert len(fake_service.calls) == 1
    assert fake_service.calls[0].content_type == "image/png"


def test_response_includes_expected_found_for_failures_and_needs_review() -> None:
    client, _ = make_client(
        FakeVisionService(result=make_extracted_label(brand_name="OTHER DISTILLERY"))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    brand_result = next(result for result in body["results"] if result["field"] == "brand_name")
    assert brand_result["status"] == "FAIL"
    assert brand_result["expected"] == "OLD TOM DISTILLERY"
    assert brand_result["found"] == "OTHER DISTILLERY"


def test_warning_failure_surfaces_extracted_government_warning_text() -> None:
    extracted_warning = CANONICAL_GOVERNMENT_WARNING.replace(
        "GOVERNMENT WARNING:", "Government Warning:"
    )
    client, _ = make_client(
        FakeVisionService(result=make_extracted_label(government_warning=extracted_warning))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    assert_verification_result_literals(response.json())
    warning_result = next(
        result for result in response.json()["results"] if result["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] == extracted_warning
    assert "AI detected:" in warning_result["message"]
    assert extracted_warning in warning_result["message"]


def test_warning_needs_review_when_bold_lead_in_is_clearly_absent() -> None:
    client, _ = make_client(
        FakeVisionService(result=make_extracted_label(government_warning_lead_in_bold=False))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    assert body["extracted_formatting"] == {"government_warning_lead_in_bold": False}
    warning_result = next(
        result for result in body["results"] if result["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] == CANONICAL_GOVERNMENT_WARNING
    assert "did not detect bold styling" in warning_result["message"]


def test_warning_needs_review_when_boldness_cannot_be_determined() -> None:
    client, _ = make_client(
        FakeVisionService(result=make_extracted_label(government_warning_lead_in_bold=None))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    assert body["extracted_formatting"] == {"government_warning_lead_in_bold": None}
    warning_result = next(
        result for result in body["results"] if result["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] == CANONICAL_GOVERNMENT_WARNING
    assert "could not determine" in warning_result["message"]
    assert "likely compliant" in warning_result["message"]


def test_warning_failure_message_surfaces_normalized_extracted_text() -> None:
    extracted_warning = (
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should\n\n"
        "not drink alcoholic beverages because of OCR drift."
    )
    normalized_warning = (
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should "
        "not drink alcoholic beverages because of OCR drift."
    )
    client, _ = make_client(
        FakeVisionService(result=make_extracted_label(government_warning=extracted_warning))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    warning_result = next(
        result for result in body["results"] if result["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] == extracted_warning
    assert normalized_warning in warning_result["message"]


def test_missing_extracted_government_warning_needs_review_with_found_null() -> None:
    client, _ = make_client(
        FakeVisionService(result=make_extracted_label(government_warning=None))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    warning_result = next(
        result for result in body["results"] if result["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] is None


def test_partial_uncertain_extraction_returns_needs_review_not_false_approval() -> None:
    client, _ = make_client(
        FakeVisionService(result=ExtractedLabel(brand_name="Old Tom Distillery"))
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    assert body["overall_verdict"] == "NEEDS_REVIEW"
    failed_fields = {result["field"] for result in body["results"] if result["status"] == "FAIL"}
    assert failed_fields == {
        "class_type",
        "abv",
        "net_contents",
        "producer",
        "country_of_origin",
        "government_warning",
    }
    assert all(
        result["found"] is None for result in body["results"] if result["field"] in failed_fields
    )


def test_bad_file_type_returns_clear_4xx_error() -> None:
    client, _ = make_client()

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=b"not an image",
        filename="label.txt",
        content_type="text/plain",
    )

    assert response.status_code == 415
    assert_error_envelope(response, "unsupported_file_type")


def test_missing_image_returns_clear_4xx_error() -> None:
    client, _ = make_client()

    response = post_verify(client, application_data=make_application_data())

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    assert response.json()["error"]["details"]["field"] == "image"


def test_missing_application_data_returns_clear_4xx_error() -> None:
    client, _ = make_client()

    response = post_verify(client, image_bytes=make_image_bytes())

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    assert response.json()["error"]["details"]["field"] == "application_data"


def test_malformed_application_data_json_returns_clear_4xx_error() -> None:
    client, _ = make_client()

    response = post_verify(
        client,
        application_data="{not json",
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 400
    assert_error_envelope(response, "bad_request")


def test_missing_required_application_field_returns_clear_4xx_error() -> None:
    client, _ = make_client()
    application_data = make_application_data()
    del application_data["government_warning"]

    response = post_verify(
        client,
        application_data=application_data,
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")
    assert response.json()["error"]["details"]["field_errors"] == [
        {
            "field": "government_warning",
            "message": "Field required",
            "type": "missing",
        }
    ]


def test_oversized_file_returns_clear_4xx_error(monkeypatch) -> None:
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    client, _ = make_client()

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=b"x" * (1024 * 1024 + 1),
    )

    assert response.status_code == 413
    assert_error_envelope(response, "file_too_large")
    get_settings.cache_clear()


async def test_unreadable_upload_returns_readable_bad_request() -> None:
    class BrokenUpload:
        async def read(self, size: int) -> bytes:
            _ = size
            raise OSError("stream closed")

    try:
        await read_image_upload(BrokenUpload(), max_upload_mb=10)
    except ApiError as exc:
        assert exc.status_code == 400
        assert exc.code == "bad_request"
        assert exc.message == "The uploaded image could not be read. Please choose the image again."
        assert exc.details == {"field": "image"}
    else:
        raise AssertionError("Expected ApiError")


def test_vision_service_timeout_maps_to_safe_readable_error() -> None:
    client, fake_service = make_client(
        FakeVisionService(
            error=VisionServiceError("provider_timeout", "secret provider timeout detail")
        )
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 504
    assert_error_envelope(response, "vision_timeout")
    assert "secret provider timeout detail" not in response.text
    assert len(fake_service.calls) == 1


def test_verify_logs_but_does_not_cut_off_single_label_latency_budget(
    monkeypatch, caplog
) -> None:
    caplog.set_level("WARNING", logger="app.api.verify")
    monkeypatch.setenv("SINGLE_LABEL_TIMEOUT_SECONDS", "0.01")
    client, slow_service = make_client(SlowVisionService(delay_seconds=0.02))

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    assert response.json()["latency_ms"] >= 20
    assert any(
        "verify_latency_budget_exceeded latency_ms=" in record.getMessage()
        for record in caplog.records
    )
    assert len(slow_service.calls) == 1
    get_settings.cache_clear()


def test_vision_quota_error_maps_to_frontend_readable_message() -> None:
    client, fake_service = make_client(
        FakeVisionService(
            error=VisionServiceError(
                "provider_quota_exceeded",
                "secret provider quota payload",
            )
        )
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 429
    assert_error_envelope(response, "vision_quota_exceeded")
    assert response.json()["error"]["message"] == (
        "This API call exceeds your current quota. "
        "Please check your OpenAI plan and billing details."
    )
    assert "secret provider quota payload" not in response.text
    assert len(fake_service.calls) == 1


def test_non_label_extraction_failure_maps_to_safe_readable_error() -> None:
    client, fake_service = make_client(
        FakeVisionService(
            error=VisionServiceError("non_label_image", "secret non-label provider detail")
        )
    )

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 502
    assert_error_envelope(response, "extraction_failed")
    assert "secret non-label provider detail" not in response.text
    assert len(fake_service.calls) == 1


def test_tests_use_fake_vision_service_without_api_key_or_network(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    fake_service = FakeVisionService(result=make_extracted_label())
    client, _ = make_client(fake_service)

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    assert len(fake_service.calls) == 1


def test_submitted_openai_fields_do_not_override_configured_vision_service(monkeypatch) -> None:
    configured_service = FakeVisionService(
        result=make_extracted_label(brand_name="Old Tom Distillery")
    )

    def fail_if_constructed(*args, **kwargs):
        _ = args
        _ = kwargs
        raise AssertionError("Submitted OpenAI fields must not construct a request-scoped service")

    monkeypatch.setattr("app.api.dependencies.OpenAIVisionService", fail_if_constructed)
    client, _ = make_client(configured_service)

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
        extra_data={
            "use_real_vision": "true",
            "openai_api_key": "sk-submitted-test-key",
            "openai_model": "gpt-test-vision",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert_verification_result_literals(body)
    assert body["overall_verdict"] == "APPROVED"
    assert len(configured_service.calls) == 1


def test_verify_logs_request_timing_without_payload_contents(caplog) -> None:
    client, _ = make_client()
    caplog.set_level("INFO", logger="app.api.verify")

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records]
    assert any("verify_request_completed latency_ms=" in message for message in messages)
    assert all("OLD TOM DISTILLERY" not in message for message in messages)
    assert all(CANONICAL_GOVERNMENT_WARNING not in message for message in messages)


def test_verify_logs_input_timing_without_payload_contents(caplog) -> None:
    client, _ = make_client()
    caplog.set_level("INFO", logger="app.api.verify")

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records]
    assert any(
        "verify_request_input_timing parse_application_ms=" in message for message in messages
    )
    assert any("upload_read_ms=" in message for message in messages)
    assert any("upload_size_bytes=" in message for message in messages)
    assert all("OLD TOM DISTILLERY" not in message for message in messages)
    assert all(CANONICAL_GOVERNMENT_WARNING not in message for message in messages)


def test_verify_logs_timing_breakdown_without_payload_contents(caplog) -> None:
    client, _ = make_client()
    caplog.set_level("INFO", logger="app.use_cases.verification")

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    messages = [record.getMessage() for record in caplog.records]
    assert any("verify_timing_breakdown preprocessing_ms=" in message for message in messages)
    assert any("vision_ms=" in message for message in messages)
    assert any("comparison_ms=" in message for message in messages)
    assert any("total_latency_ms=" in message for message in messages)
    assert all("OLD TOM DISTILLERY" not in message for message in messages)
    assert all(CANONICAL_GOVERNMENT_WARNING not in message for message in messages)
