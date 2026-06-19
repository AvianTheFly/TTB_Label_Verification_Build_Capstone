import json
from io import BytesIO
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from app.domain.models import ExtractedLabel
from app.services.fake_vision import FakeVisionService
from app.services.image_preprocess import ImagePreprocessError, preprocess_image
from app.services.vision import (
    CANONICAL_EXTRACTION_FIELDS,
    EXTRACTION_PROMPT,
    STRUCTURED_OUTPUT_SCHEMA,
    OpenAIVisionService,
    VisionServiceError,
    classify_extraction_issue,
    parse_structured_label_payload,
)


def make_image_bytes(size: tuple[int, int] = (800, 400), image_format: str = "PNG") -> bytes:
    image = Image.new("RGB", size, color=(240, 240, 240))
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


@pytest.mark.asyncio
async def test_fake_vision_service_returns_configured_extracted_label() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    expected = ExtractedLabel(brand_name="OLD TOM DISTILLERY")
    service = FakeVisionService(result=expected)

    result = await service.extract_label(image)

    assert result == expected
    assert service.calls == [image]


@pytest.mark.asyncio
async def test_fake_vision_service_can_raise_categorized_error() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    service = FakeVisionService(
        error=VisionServiceError("provider_timeout", "The vision provider timed out.")
    )

    with pytest.raises(VisionServiceError) as exc_info:
        await service.extract_label(image)

    assert exc_info.value.category == "provider_timeout"


def test_preprocess_rejects_unsupported_content_type() -> None:
    with pytest.raises(ImagePreprocessError) as exc_info:
        preprocess_image(make_image_bytes(), "text/plain")

    assert exc_info.value.category == "unsupported_file_type"


def test_preprocess_rejects_invalid_image_bytes() -> None:
    with pytest.raises(ImagePreprocessError) as exc_info:
        preprocess_image(b"not an image", "image/png")

    assert exc_info.value.category == "invalid_image"


def test_preprocess_downscales_and_reencodes_oversized_images() -> None:
    original = make_image_bytes(size=(2400, 1200))

    processed = preprocess_image(original, "image/png", max_dimension_px=1200)

    assert processed.content_type == "image/jpeg"
    assert processed.original_width == 2400
    assert processed.original_height == 1200
    assert max(processed.processed_width, processed.processed_height) == 1200
    assert processed.processed_size_bytes > 0


def test_parse_structured_output_preserves_government_warning_verbatim() -> None:
    warning = "GOVERNMENT WARNING: Exact visible text."

    result = parse_structured_label_payload(
        {
            "brand_name": "OLD TOM DISTILLERY",
            "class_type": "Kentucky Straight Bourbon Whiskey",
            "abv": "45% Alc./Vol. (90 Proof)",
            "net_contents": "750 mL",
            "producer": "Old Tom Distillery, Louisville, KY",
            "country_of_origin": "United States",
            "government_warning": warning,
        }
    )

    assert result.government_warning == warning


def test_parse_structured_output_turns_blank_unknowns_into_null() -> None:
    result = parse_structured_label_payload(
        {
            "brand_name": "",
            "class_type": None,
            "abv": "   ",
            "net_contents": None,
            "producer": None,
            "country_of_origin": None,
            "government_warning": None,
        }
    )

    assert result.brand_name is None
    assert result.abv is None


def test_parse_structured_output_rejects_malformed_json() -> None:
    with pytest.raises(VisionServiceError) as exc_info:
        parse_structured_label_payload("{not json")

    assert exc_info.value.category == "malformed_provider_output"


def test_parse_structured_output_rejects_extra_provider_fields() -> None:
    payload = {field: None for field in CANONICAL_EXTRACTION_FIELDS}
    payload["alcohol_content"] = "45%"

    with pytest.raises(VisionServiceError) as exc_info:
        parse_structured_label_payload(payload)

    assert exc_info.value.category == "malformed_provider_output"


def test_parse_structured_output_rejects_missing_required_field() -> None:
    payload = {field: None for field in CANONICAL_EXTRACTION_FIELDS}
    del payload["government_warning"]

    with pytest.raises(VisionServiceError) as exc_info:
        parse_structured_label_payload(payload)

    assert exc_info.value.category == "malformed_provider_output"


def test_extraction_issue_classification_for_non_label_and_partial_results() -> None:
    assert classify_extraction_issue(ExtractedLabel()) == "non_label_image"
    assert (
        classify_extraction_issue(ExtractedLabel(brand_name="OLD TOM DISTILLERY"))
        == "partial_extraction"
    )
    assert classify_extraction_issue(
        ExtractedLabel(**{field: "present" for field in CANONICAL_EXTRACTION_FIELDS})
    ) is None


@pytest.mark.asyncio
async def test_openai_provider_uses_strict_structured_output_and_prompt_rules() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    payload = {field: None for field in CANONICAL_EXTRACTION_FIELDS}
    payload["government_warning"] = "GOVERNMENT WARNING: Visible text."
    client = FakeOpenAIClient(output_text=json.dumps(payload))
    service = OpenAIVisionService(client=client, model="test-model")

    result = await service.extract_label(image)

    request = client.responses.last_request
    assert request is not None
    assert result.government_warning == "GOVERNMENT WARNING: Visible text."
    assert request["model"] == "test-model"
    assert request["store"] is False
    assert request["text"]["format"]["strict"] is True
    assert request["text"]["format"]["schema"] == STRUCTURED_OUTPUT_SCHEMA
    assert "Copy government_warning verbatim" in EXTRACTION_PROMPT
    assert "Do not guess missing fields" in EXTRACTION_PROMPT
    assert "absent, unreadable, obscured, ambiguous, or uncertain" in EXTRACTION_PROMPT
    assert "For blurry, angled, or glare-heavy images, return partial data" in EXTRACTION_PROMPT
    assert set(request["text"]["format"]["schema"]["properties"]) == set(
        CANONICAL_EXTRACTION_FIELDS
    )


@pytest.mark.asyncio
async def test_openai_provider_timeout_is_categorized() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    service = OpenAIVisionService(client=TimeoutOpenAIClient())

    with pytest.raises(VisionServiceError) as exc_info:
        await service.extract_label(image)

    assert exc_info.value.category == "provider_timeout"


@pytest.mark.asyncio
async def test_openai_provider_malformed_output_is_categorized() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    service = OpenAIVisionService(client=FakeOpenAIClient(output_text="not-json"))

    with pytest.raises(VisionServiceError) as exc_info:
        await service.extract_label(image)

    assert exc_info.value.category == "malformed_provider_output"


class FakeResponses:
    def __init__(self, output_text: str) -> None:
        self._output_text = output_text
        self.last_request: dict[str, Any] | None = None

    async def create(self, **kwargs: Any) -> Any:
        self.last_request = kwargs
        return SimpleNamespace(output_text=self._output_text)


class FakeOpenAIClient:
    def __init__(self, output_text: str) -> None:
        self.responses = FakeResponses(output_text)


class TimeoutResponses:
    async def create(self, **kwargs: Any) -> Any:
        raise TimeoutError("timed out")


class TimeoutOpenAIClient:
    responses = TimeoutResponses()
