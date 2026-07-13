from types import SimpleNamespace

import pytest

from app.api.dependencies import get_vision_service
from app.api import dependencies
from app.core.errors import ApiError
from app.services.demo_vision import DemoFixtureVisionService
from app.services.fake_vision import FakeVisionService
from app.services.vision import OpenAIVisionService


@pytest.fixture(autouse=True)
def clear_cached_vision_service() -> None:
    dependencies._get_cached_openai_vision_service.cache_clear()
    yield
    dependencies._get_cached_openai_vision_service.cache_clear()


def test_openai_is_selected_by_environment_configuration(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(
            vision_provider="openai",
            openai_api_key="test-key",
            vision_model="gpt-test-model",
            openai_timeout_seconds=4.5,
            openai_image_detail="low",
        ),
    )

    service = get_vision_service()

    assert isinstance(service, OpenAIVisionService)
    assert service._model == "gpt-test-model"


def test_openai_service_is_cached_for_repeated_requests(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(
            vision_provider="openai",
            openai_api_key="test-key",
            vision_model="gpt-test-model",
            openai_timeout_seconds=4.5,
            openai_image_detail="low",
            openai_max_output_tokens=500,
        ),
    )

    first = get_vision_service()
    second = get_vision_service()

    assert first is second


def test_warm_vision_service_prebuilds_cached_openai_client(monkeypatch) -> None:
    class SpyOpenAIVisionService:
        def __init__(
            self,
            *,
            api_key: str | None = None,
            model: str | None = None,
            timeout_seconds: float = 30.0,
            image_detail: str = "low",
            max_output_tokens: int = 500,
        ) -> None:
            self._model = model
            self.warm_calls = 0
            _ = (api_key, timeout_seconds, image_detail, max_output_tokens)

        @property
        def model(self) -> str:
            return self._model or "test-model"

        def warm_client(self) -> None:
            self.warm_calls += 1

    monkeypatch.setattr("app.api.dependencies.OpenAIVisionService", SpyOpenAIVisionService)
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(
            vision_provider="openai",
            openai_api_key="test-key",
            vision_model="gpt-test-model",
            openai_timeout_seconds=4.5,
            openai_image_detail="low",
            openai_max_output_tokens=500,
        ),
    )

    service = dependencies.warm_vision_service()

    assert isinstance(service, SpyOpenAIVisionService)
    assert service.warm_calls == 1
    assert get_vision_service() is service


def test_demo_fixture_provider_requires_explicit_configuration(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(vision_provider="demo"),
    )

    assert isinstance(get_vision_service(), DemoFixtureVisionService)


def test_fake_provider_is_only_selected_when_explicitly_configured(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(vision_provider="fake"),
    )

    assert isinstance(get_vision_service(), FakeVisionService)


def test_unknown_provider_returns_safe_unavailable_error(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(vision_provider="unknown"),
    )

    with pytest.raises(ApiError) as exc_info:
        get_vision_service()

    assert exc_info.value.code == "vision_unavailable"
