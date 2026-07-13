from types import SimpleNamespace

import pytest

from app.api.dependencies import get_vision_service
from app.core.errors import ApiError
from app.services.demo_vision import DemoFixtureVisionService
from app.services.fake_vision import FakeVisionService
from app.services.vision import OpenAIVisionService


def test_openai_is_selected_by_environment_configuration(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.dependencies.get_settings",
        lambda: SimpleNamespace(
            vision_provider="openai",
            openai_api_key="test-key",
            vision_model="gpt-test-model",
            openai_timeout_seconds=4.5,
        ),
    )

    service = get_vision_service()

    assert isinstance(service, OpenAIVisionService)
    assert service._model == "gpt-test-model"


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
