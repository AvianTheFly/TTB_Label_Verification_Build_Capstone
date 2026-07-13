import asyncio
import json
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from PIL import Image

from app.core.config import Settings
from app.domain.comparison import compare_label
from app.domain.models import ApplicationData, ExtractedLabel
from app.services.demo_vision import DemoFixtureVisionService
from app.services.fake_vision import FakeVisionService
from app.services.image_preprocess import ImagePreprocessError, preprocess_image
from app.services.vision import (
    CANONICAL_EXTRACTION_FIELDS,
    DEFAULT_OPENAI_IMAGE_DETAIL,
    DEFAULT_OPENAI_TIMEOUT_SECONDS,
    DEFAULT_OPENAI_VISION_MODEL,
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


@pytest.mark.asyncio
async def test_demo_vision_service_uses_filename_keyed_extraction() -> None:
    image = preprocess_image(
        make_image_bytes(),
        "image/png",
        filename="evergreen-amber-bourbon.png",
    )
    service = DemoFixtureVisionService()

    result = await service.extract_label(image)

    assert result.brand_name == "EVERGREEN AMBER BOURBON"
    assert service.calls == [image]


def test_demo_application_inputs_match_intended_scenarios() -> None:
    project_root = Path(__file__).resolve().parents[3]
    cases = {
        "evergreen-amber-bourbon": ("APPROVED", set()),
        "coastal-pear-cider": (
            "NEEDS_REVIEW",
            {"abv", "producer", "government_warning"},
        ),
        "northstar-riesling": (
            "NEEDS_REVIEW",
            {
                "brand_name",
                "class_type",
                "abv",
                "net_contents",
                "producer",
                "country_of_origin",
            },
        ),
    }

    for stem, (verdict, failed_fields) in cases.items():
        root_application_path = project_root / "demo-data" / "inputs" / f"{stem}.application.json"
        assert root_application_path.exists()
        application_payload = json.loads(root_application_path.read_text())["application_data"]
        extraction_path = (
            project_root
            / "backend"
            / "app"
            / "services"
            / "demo_extractions"
            / f"{stem}.json"
        )
        extraction_payload = json.loads(
            extraction_path.read_text()
        )

        result = compare_label(
            ApplicationData.model_validate(application_payload),
            ExtractedLabel.model_validate(extraction_payload),
        )

        assert result.overall_verdict == verdict
        assert {field.field for field in result.results if field.status == "FAIL"} == failed_fields


def test_openai_vision_service_defaults_to_documented_model() -> None:
    service = OpenAIVisionService(api_key="test-key")

    assert service._model == "gpt-5.4-nano"
    assert DEFAULT_OPENAI_VISION_MODEL == "gpt-5.4-nano"


def test_preprocess_rejects_unsupported_content_type() -> None:
    with pytest.raises(ImagePreprocessError) as exc_info:
        preprocess_image(make_image_bytes(), "text/plain")

    assert exc_info.value.category == "unsupported_file_type"


def test_preprocess_rejects_invalid_image_bytes() -> None:
    with pytest.raises(ImagePreprocessError) as exc_info:
        preprocess_image(b"not an image", "image/png")

    assert exc_info.value.category == "invalid_image"


def test_preprocess_rejects_extreme_image_dimensions_gracefully(monkeypatch) -> None:
    def raise_decompression_bomb(*args: object, **kwargs: object) -> object:
        _ = (args, kwargs)
        raise Image.DecompressionBombError("image dimensions are too large")

    monkeypatch.setattr(Image, "open", raise_decompression_bomb)

    with pytest.raises(ImagePreprocessError) as exc_info:
        preprocess_image(make_image_bytes(), "image/png")

    assert exc_info.value.category == "invalid_image"
    assert exc_info.value.message == "The uploaded file is not a readable image."


def test_preprocess_downscales_and_reencodes_oversized_images() -> None:
    original = make_image_bytes(size=(2400, 1200))

    processed = preprocess_image(original, "image/png", max_dimension_px=1200)

    assert processed.content_type == "image/jpeg"
    assert processed.original_width == 2400
    assert processed.original_height == 1200
    assert max(processed.processed_width, processed.processed_height) == 1200
    assert processed.processed_size_bytes > 0


def test_openai_provider_reads_model_and_timeout_from_settings() -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key="test-key",
        vision_model="gpt-test-model",
        openai_timeout_seconds=3.25,
        openai_image_detail="high",
        openai_max_output_tokens=650,
    )

    service = OpenAIVisionService.from_settings(settings)

    assert service._model == "gpt-test-model"
    assert service._timeout_seconds == 3.25
    assert service._image_detail == "high"
    assert service._max_output_tokens == 650


def test_openai_provider_defaults_are_current_and_budgeted() -> None:
    service = OpenAIVisionService()

    assert service._model == DEFAULT_OPENAI_VISION_MODEL
    assert DEFAULT_OPENAI_VISION_MODEL == "gpt-5.4-nano"
    assert service._timeout_seconds == DEFAULT_OPENAI_TIMEOUT_SECONDS
    assert DEFAULT_OPENAI_TIMEOUT_SECONDS == 30.0
    assert service._image_detail == DEFAULT_OPENAI_IMAGE_DETAIL
    assert DEFAULT_OPENAI_IMAGE_DETAIL == "low"
    assert service._max_output_tokens == 500


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
    assert request["max_output_tokens"] == 500
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
async def test_openai_provider_logs_timing_metadata_without_payload_contents(caplog) -> None:
    caplog.set_level("INFO", logger="app.services.vision")
    image = preprocess_image(make_image_bytes(), "image/png")
    payload = {field: None for field in CANONICAL_EXTRACTION_FIELDS}
    payload["brand_name"] = "OLD TOM DISTILLERY"
    client = FakeOpenAIClient(output_text=json.dumps(payload))
    service = OpenAIVisionService(client=client, model="test-model")

    await service.extract_label(image)

    messages = [record.getMessage() for record in caplog.records]
    assert any("openai_vision_timing client_build_ms=" in message for message in messages)
    assert any("image_encode_ms=" in message for message in messages)
    assert any("provider_call_ms=" in message for message in messages)
    assert any("payload_extract_ms=" in message for message in messages)
    assert any("payload_parse_ms=" in message for message in messages)
    assert any("processed_size_bytes=" in message for message in messages)
    assert any("model=test-model" in message for message in messages)
    assert any("max_output_tokens=500" in message for message in messages)
    assert all("OLD TOM DISTILLERY" not in message for message in messages)


@pytest.mark.asyncio
async def test_openai_provider_timeout_is_categorized() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    service = OpenAIVisionService(client=TimeoutOpenAIClient())

    with pytest.raises(VisionServiceError) as exc_info:
        await service.extract_label(image)

    assert exc_info.value.category == "provider_timeout"


@pytest.mark.asyncio
async def test_openai_provider_enforces_total_provider_timeout() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    service = OpenAIVisionService(client=SlowOpenAIClient(), timeout_seconds=0.01)

    with pytest.raises(VisionServiceError) as exc_info:
        await service.extract_label(image)

    assert exc_info.value.category == "provider_timeout"


@pytest.mark.asyncio
async def test_openai_provider_insufficient_quota_is_categorized() -> None:
    image = preprocess_image(make_image_bytes(), "image/png")
    service = OpenAIVisionService(client=InsufficientQuotaOpenAIClient())

    with pytest.raises(VisionServiceError) as exc_info:
        await service.extract_label(image)

    assert exc_info.value.category == "provider_quota_exceeded"
    assert "quota" in exc_info.value.message


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


class SlowResponses:
    async def create(self, **kwargs: Any) -> Any:
        await asyncio.sleep(1)
        return SimpleNamespace(output_text=json.dumps({field: None for field in CANONICAL_EXTRACTION_FIELDS}))


class SlowOpenAIClient:
    responses = SlowResponses()


class FakeRateLimitError(Exception):
    code = "insufficient_quota"
    message = "You exceeded your current quota, please check your plan and billing details."


class InsufficientQuotaResponses:
    async def create(self, **kwargs: Any) -> Any:
        _ = kwargs
        raise FakeRateLimitError(FakeRateLimitError.message)


class InsufficientQuotaOpenAIClient:
    responses = InsufficientQuotaResponses()
