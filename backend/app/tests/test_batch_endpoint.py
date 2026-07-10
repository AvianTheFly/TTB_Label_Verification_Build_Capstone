import asyncio
import json
from io import BytesIO
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from app.api.dependencies import get_vision_service
from app.api.request_parsing import read_batch_item_image
from app.core.config import get_settings
from app.domain.comparison import CANONICAL_GOVERNMENT_WARNING
from app.domain.models import ExtractedLabel
from app.main import create_app
from app.services.fake_vision import FakeVisionService
from app.services.image_preprocess import PreprocessedImage


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


def make_client(fake_service: Any) -> TestClient:
    get_settings.cache_clear()
    app = create_app()
    app.dependency_overrides[get_vision_service] = lambda: fake_service
    return TestClient(app)


def post_batch(
    client: TestClient,
    *,
    application_items: list[dict[str, Any] | str | None],
    image_items: list[tuple[bytes, str, str] | None],
    extra_fields: dict[str, str] | None = None,
):
    files: list[tuple[str, tuple[str | None, bytes | str, str] | tuple[str, bytes, str]]] = []
    for image in image_items:
        if image is None:
            continue
        image_bytes, filename, content_type = image
        files.append(("images", (filename, image_bytes, content_type)))

    for application in application_items:
        if application is None:
            continue
        value = application if isinstance(application, str) else json.dumps(application)
        files.append(("application_data", (None, value, "text/plain")))
    for name, value in (extra_fields or {}).items():
        files.append((name, (None, value, "text/plain")))

    return client.post("/verify/batch", files=files)


def assert_error_envelope(response, code: str) -> None:
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    assert body["error"]["message"]
    assert isinstance(body["error"]["details"], dict)


def test_successful_batch_with_three_passing_labels() -> None:
    service = FakeVisionService(results=[make_extracted_label() for _ in range(3)])
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data() for _ in range(3)],
        image_items=[(make_image_bytes(), f"label-{index}.png", "image/png") for index in range(3)],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"passed": 3, "needs_review": 0, "total": 3}
    assert len(body["items"]) == 3
    assert [item["index"] for item in body["items"]] == [0, 1, 2]
    assert all(item["error"] is None for item in body["items"])
    assert all(item["result"]["overall_verdict"] == "APPROVED" for item in body["items"])
    assert all(isinstance(item["result"]["latency_ms"], int) for item in body["items"])
    assert len(service.calls) == 3


def test_batch_can_mix_approved_and_needs_review_labels() -> None:
    service = FakeVisionService(
        results=[
            make_extracted_label(),
            make_extracted_label(brand_name="OTHER DISTILLERY"),
            make_extracted_label(),
        ]
    )
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data() for _ in range(3)],
        image_items=[(make_image_bytes(), f"label-{index}.png", "image/png") for index in range(3)],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"passed": 2, "needs_review": 1, "total": 3}
    assert body["items"][1]["result"]["overall_verdict"] == "NEEDS_REVIEW"
    failed = [
        result
        for result in body["items"][1]["result"]["results"]
        if result["field"] == "brand_name"
    ][0]
    assert failed["status"] == "FAIL"
    assert failed["expected"] == "OLD TOM DISTILLERY"
    assert failed["found"] == "OTHER DISTILLERY"


def test_partial_extraction_counts_as_needs_review_in_batch_summary() -> None:
    service = FakeVisionService(
        results=[
            make_extracted_label(),
            ExtractedLabel(brand_name="Old Tom Distillery"),
        ]
    )
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data(), make_application_data()],
        image_items=[
            (make_image_bytes(), "label-0.png", "image/png"),
            (make_image_bytes(), "label-1.png", "image/png"),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"passed": 1, "needs_review": 1, "total": 2}
    assert body["items"][1]["error"] is None
    assert body["items"][1]["result"]["overall_verdict"] == "NEEDS_REVIEW"
    failed_fields = {
        result["field"]
        for result in body["items"][1]["result"]["results"]
        if result["status"] == "FAIL"
    }
    assert "government_warning" in failed_fields


def test_one_invalid_item_does_not_fail_whole_batch_and_uses_item_error_shape() -> None:
    service = FakeVisionService(results=[make_extracted_label(), make_extracted_label()])
    client = make_client(service)
    invalid_application = make_application_data()
    del invalid_application["government_warning"]

    response = post_batch(
        client,
        application_items=[make_application_data(), invalid_application, make_application_data()],
        image_items=[(make_image_bytes(), f"label-{index}.png", "image/png") for index in range(3)],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"passed": 2, "needs_review": 1, "total": 3}
    assert body["items"][1]["result"] is None
    assert set(body["items"][1]["error"]) == {"code", "message", "details"}
    assert body["items"][1]["error"]["code"] == "validation_error"
    assert "error" not in body["items"][1]["error"]
    assert len(service.calls) == 2


def test_more_application_data_parts_than_images_creates_trailing_item_error() -> None:
    service = FakeVisionService(result=make_extracted_label())
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data(), make_application_data()],
        image_items=[(make_image_bytes(), "label-0.png", "image/png")],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"passed": 1, "needs_review": 1, "total": 2}
    assert body["items"][1]["error"]["code"] == "validation_error"
    assert body["items"][1]["error"]["details"]["field"] == "image"


def test_more_images_than_application_data_parts_creates_trailing_item_error() -> None:
    service = FakeVisionService(result=make_extracted_label())
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data()],
        image_items=[
            (make_image_bytes(), "label-0.png", "image/png"),
            (make_image_bytes(), "label-1.png", "image/png"),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"passed": 1, "needs_review": 1, "total": 2}
    assert body["items"][1]["error"]["code"] == "validation_error"
    assert body["items"][1]["error"]["details"]["field"] == "application_data"


def test_empty_batch_returns_readable_top_level_error_envelope() -> None:
    client = make_client(FakeVisionService())

    response = client.post("/verify/batch")

    assert response.status_code == 422
    assert_error_envelope(response, "validation_error")


def test_unsupported_file_type_is_item_level_error_not_top_level_envelope() -> None:
    service = FakeVisionService(result=make_extracted_label())
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data()],
        image_items=[(b"not an image", "label.txt", "text/plain")],
    )

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "summary"}
    assert body["items"][0]["result"] is None
    assert body["items"][0]["error"]["code"] == "unsupported_file_type"
    assert body["summary"] == {"passed": 0, "needs_review": 1, "total": 1}


async def test_unreadable_batch_upload_becomes_item_error() -> None:
    class BrokenUpload:
        async def read(self, size: int) -> bytes:
            _ = size
            raise OSError("stream closed")

    item = await read_batch_item_image(3, BrokenUpload(), max_upload_mb=10)

    assert item.index == 3
    assert item.error is not None
    assert item.error.code == "bad_request"
    assert (
        item.error.message
        == "This label image could not be read. Please choose the image again."
    )
    assert item.error.details == {"index": 3, "field": "image"}


class ConcurrencyCountingVisionService:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.calls = 0

    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        _ = image
        self.calls += 1
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        await asyncio.sleep(0.02)
        self.active -= 1
        return make_extracted_label()


def test_batch_concurrency_is_bounded(monkeypatch) -> None:
    monkeypatch.setenv("BATCH_CONCURRENCY_LIMIT", "2")
    service = ConcurrencyCountingVisionService()
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data() for _ in range(5)],
        image_items=[(make_image_bytes(), f"label-{index}.png", "image/png") for index in range(5)],
    )

    assert response.status_code == 200
    assert response.json()["summary"] == {"passed": 5, "needs_review": 0, "total": 5}
    assert service.calls == 5
    assert service.max_active == 2
    get_settings.cache_clear()


def test_batch_preserves_exact_canonical_field_names() -> None:
    service = FakeVisionService(result=make_extracted_label())
    client = make_client(service)

    response = post_batch(
        client,
        application_items=[make_application_data()],
        image_items=[(make_image_bytes(), "label.png", "image/png")],
    )

    assert response.status_code == 200
    result_fields = {result["field"] for result in response.json()["items"][0]["result"]["results"]}
    assert result_fields == set(make_application_data())


def test_batch_submitted_openai_fields_do_not_override_configured_vision_service(monkeypatch) -> None:
    configured_service = FakeVisionService(
        results=[make_extracted_label(), make_extracted_label()]
    )

    def fail_if_constructed(*args, **kwargs):
        _ = args
        _ = kwargs
        raise AssertionError("Submitted OpenAI fields must not construct a request-scoped service")

    monkeypatch.setattr("app.api.dependencies.OpenAIVisionService", fail_if_constructed)
    client = make_client(configured_service)

    response = post_batch(
        client,
        application_items=[make_application_data(), make_application_data()],
        image_items=[
            (make_image_bytes(), "label-0.png", "image/png"),
            (make_image_bytes(), "label-1.png", "image/png"),
        ],
        extra_fields={
            "use_real_vision": "true",
            "openai_api_key": "sk-submitted-test-key",
            "openai_model": "gpt-test-vision",
        },
    )

    assert response.status_code == 200
    assert response.json()["summary"] == {"passed": 2, "needs_review": 0, "total": 2}
    assert len(configured_service.calls) == 2
