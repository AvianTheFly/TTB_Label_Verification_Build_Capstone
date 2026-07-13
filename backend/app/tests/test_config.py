import pytest

from app.core.config import Settings, get_settings


def test_cors_origins_accept_comma_separated_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:5173, http://127.0.0.1:5173",
    )
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.backend_cors_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    get_settings.cache_clear()


def test_public_identity_can_be_set_from_env(monkeypatch) -> None:
    monkeypatch.setenv("APP_VERSION", "9.9.9")
    monkeypatch.setenv("SERVICE_SLUG", "example-service")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.app_version == "9.9.9"
    assert settings.service_slug == "example-service"
    get_settings.cache_clear()


def test_production_safe_defaults_use_real_provider() -> None:
    settings = Settings(_env_file=None)

    assert settings.vision_provider == "openai"
    assert settings.vision_model == "gpt-4.1-mini"
    assert settings.openai_timeout_seconds == 4.5
    assert settings.image_max_dimension == 1600
    assert settings.image_jpeg_quality == 85


def test_openai_timeout_cannot_exceed_latency_budget() -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, openai_timeout_seconds=5.0)


def test_image_preprocess_knobs_are_validated() -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, image_max_dimension=200)

    with pytest.raises(ValueError):
        Settings(_env_file=None, image_jpeg_quality=99)
