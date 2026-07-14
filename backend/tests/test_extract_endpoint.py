from io import BytesIO
from typing import Any

from fastapi.testclient import TestClient
from PIL import Image

from app.api.dependencies import get_vision_service
from app.core.config import get_settings
from app.domain.comparison import CANONICAL_GOVERNMENT_WARNING
from app.domain.models import ExtractedLabel
from app.main import create_app
from app.services.fake_vision import FakeVisionService


def make_image_bytes(image_format: str = "PNG") -> bytes:
    image = Image.new("RGB", (800, 400), color=(240, 240, 240))
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


def make_extracted_label(**overrides: object) -> ExtractedLabel:
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


def test_extract_returns_ai_detected_label_fields_without_application_data() -> None:
    service = FakeVisionService(result=make_extracted_label(government_warning_lead_in_bold=True))
    client = make_client(service)

    response = client.post(
        "/extract",
        files={"image": ("label.png", make_image_bytes(), "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["brand_name"] == "Old Tom Distillery"
    assert body["abv"] == "45% Alc./Vol. (90 Proof)"
    assert body["government_warning"] == CANONICAL_GOVERNMENT_WARNING
    assert body["government_warning_lead_in_bold"] is True
    assert "overall_verdict" not in body
    assert len(service.calls) == 1


def test_extract_bad_upload_returns_top_level_error_envelope() -> None:
    client = make_client(FakeVisionService(result=make_extracted_label()))

    response = client.post(
        "/extract",
        files={"image": ("label.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 415
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "unsupported_file_type"
