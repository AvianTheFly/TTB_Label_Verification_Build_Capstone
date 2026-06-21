import json
from io import BytesIO
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from app.api.dependencies import get_vision_service
from app.api.verify import _read_image_upload
from app.core.config import get_settings
from app.core.errors import ApiError
from app.domain.comparison import CANONICAL_GOVERNMENT_WARNING
from app.domain.models import ExtractedLabel
from app.main import create_app
from app.services.fake_vision import FakeVisionService
from app.services.vision import VisionServiceError


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


def make_extracted_label(**overrides: str | None) -> ExtractedLabel:
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
    use_real_vision: bool = True,
    openai_api_key: str | None = None,
    openai_model: str | None = None,
):
    data = {"use_real_vision": str(use_real_vision).lower()}
    if openai_api_key is not None:
        data["openai_api_key"] = openai_api_key
    if openai_model is not None:
        data["openai_model"] = openai_model
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


def test_valid_verify_submission_returns_full_verification_result() -> None:
    client, fake_service = make_client()

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_verdict"] == "APPROVED"
    assert isinstance(body["latency_ms"], int)
    assert body["latency_ms"] >= 0
    assert len(body["results"]) == 7
    assert {result["field"] for result in body["results"]} == set(make_application_data())
    for result in body["results"]:
        assert set(result) == {"field", "match_type", "expected", "found", "status", "message"}
        assert result["expected"] is not None
        assert result["found"] is not None
        assert result["status"] in {"PASS", "FAIL"}
    assert len(fake_service.calls) == 1
    assert fake_service.calls[0].content_type == "image/jpeg"


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
    warning_result = next(
        result for result in response.json()["results"] if result["field"] == "government_warning"
    )
    assert warning_result["status"] == "FAIL"
    assert warning_result["found"] == extracted_warning


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
        await _read_image_upload(BrokenUpload())
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


def test_submitted_openai_key_uses_request_scoped_real_vision_service(monkeypatch) -> None:
    configured_service = FakeVisionService(
        result=make_extracted_label(brand_name="SHOULD NOT BE USED")
    )
    submitted_service = FakeVisionService(result=make_extracted_label())
    captured: dict[str, str | None] = {}

    def fake_openai_service(*, api_key: str | None = None, model: str | None = None, **kwargs):
        _ = kwargs
        captured["api_key"] = api_key
        captured["model"] = model
        return submitted_service

    monkeypatch.setattr("app.api.dependencies.OpenAIVisionService", fake_openai_service)
    client, _ = make_client(configured_service)

    response = post_verify(
        client,
        application_data=make_application_data(),
        image_bytes=make_image_bytes(),
        use_real_vision=True,
        openai_api_key="sk-submitted-test-key",
        openai_model="gpt-test-vision",
    )

    assert response.status_code == 200
    assert response.json()["overall_verdict"] == "APPROVED"
    assert captured == {"api_key": "sk-submitted-test-key", "model": "gpt-test-vision"}
    assert configured_service.calls == []
    assert len(submitted_service.calls) == 1


def test_demo_mode_uses_filename_keyed_pretend_extraction() -> None:
    client, fake_service = make_client(
        FakeVisionService(result=make_extracted_label(brand_name="SHOULD NOT BE USED"))
    )

    response = post_verify(
        client,
        application_data={
            "brand_name": "EVERGREEN AMBER BOURBON",
            "class_type": "Kentucky Straight Bourbon Whiskey",
            "abv": "45% Alc./Vol. (90 Proof)",
            "net_contents": "750 mL",
            "producer": "Evergreen Spirits LLC, Louisville, KY",
            "country_of_origin": "United States",
            "government_warning": CANONICAL_GOVERNMENT_WARNING,
        },
        image_bytes=make_image_bytes(),
        filename="evergreen-amber-bourbon.png",
        use_real_vision=False,
    )

    assert response.status_code == 200
    assert response.json()["overall_verdict"] == "APPROVED"
    brand = next(result for result in response.json()["results"] if result["field"] == "brand_name")
    assert brand["found"] == "EVERGREEN AMBER BOURBON"
    assert fake_service.calls == []


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


def test_verify_logs_timing_breakdown_without_payload_contents(caplog) -> None:
    client, _ = make_client()
    caplog.set_level("INFO", logger="app.services.verification")

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
