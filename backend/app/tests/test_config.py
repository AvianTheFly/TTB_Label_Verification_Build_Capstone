from app.core.config import get_settings


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
