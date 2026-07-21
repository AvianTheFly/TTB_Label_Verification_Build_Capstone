import pytest

from app.core.config import Settings, get_settings


def test_cors_origins_accept_comma_separated_env(monkeypatch) -> None:
    monkeypatch.setenv(
        "BACKEND_CORS_ORIGINS",
        "http://localhost:5173, http://127.0.0.1:5173",
    )
    monkeypatch.setenv("OPENAI_TIMEOUT_SECONDS", "4.5")
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
    monkeypatch.setenv("OPENAI_TIMEOUT_SECONDS", "4.5")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.app_version == "9.9.9"
    assert settings.service_slug == "example-service"
    get_settings.cache_clear()


def test_production_safe_defaults_use_real_provider() -> None:
    settings = Settings(_env_file=None)

    assert settings.vision_provider == "openai"
    assert settings.vision_model == "gpt-5.4-nano"
    assert settings.single_label_timeout_seconds == 4.8
    assert settings.openai_timeout_seconds == 4.5
    assert settings.openai_image_detail == "low"
    assert settings.openai_max_output_tokens == 500
    assert settings.image_max_dimension == 1600
    assert settings.image_jpeg_quality == 60
    assert settings.image_reencode_threshold_bytes == 500_000


def test_openai_timeout_cannot_exceed_latency_budget() -> None:
    assert Settings(_env_file=None, openai_timeout_seconds=4.5)

    with pytest.raises(ValueError):
        Settings(_env_file=None, openai_timeout_seconds=4.6)


def test_single_label_timeout_cannot_exceed_challenge_budget() -> None:
    assert Settings(_env_file=None, single_label_timeout_seconds=5.0)

    with pytest.raises(ValueError):
        Settings(_env_file=None, single_label_timeout_seconds=5.1)


def test_image_preprocess_knobs_are_validated() -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, image_max_dimension=200)

    with pytest.raises(ValueError):
        Settings(_env_file=None, image_jpeg_quality=99)

    with pytest.raises(ValueError):
        Settings(_env_file=None, image_reencode_threshold_bytes=-1)


def test_openai_image_detail_allows_provider_supported_values() -> None:
    assert Settings(_env_file=None, openai_image_detail="low").openai_image_detail == "low"
    assert Settings(_env_file=None, openai_image_detail="high").openai_image_detail == "high"
    assert Settings(_env_file=None, openai_image_detail="auto").openai_image_detail == "auto"

    with pytest.raises(ValueError):
        Settings(_env_file=None, openai_image_detail="maximum")


def test_openai_max_output_tokens_are_validated() -> None:
    assert Settings(_env_file=None, openai_max_output_tokens=100)
    assert Settings(_env_file=None, openai_max_output_tokens=2000)

    with pytest.raises(ValueError):
        Settings(_env_file=None, openai_max_output_tokens=99)


@pytest.mark.parametrize(
    "setting",
    ["max_upload_mb", "max_batch_items", "batch_concurrency_limit"],
)
@pytest.mark.parametrize("value", [0, -1])
def test_operational_limits_must_be_positive(setting: str, value: int) -> None:
    with pytest.raises(ValueError):
        Settings(_env_file=None, **{setting: value})
