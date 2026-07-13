from functools import lru_cache
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "TTB Label Verification"
    app_version: str = "0.1.0"
    service_slug: str = "ttb-label-verification"
    app_env: str = "local"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    backend_cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    max_upload_mb: int = 10
    max_batch_items: int = 25
    batch_concurrency_limit: int = 3
    single_label_timeout_seconds: float = 4.8
    image_max_dimension: int = 1600
    image_jpeg_quality: int = 60
    image_reencode_threshold_bytes: int = 500_000
    vision_provider: str = "openai"
    vision_model: str = "gpt-5.4-nano"
    openai_timeout_seconds: float = 30.0
    openai_image_detail: Literal["low", "high", "auto"] = "low"
    openai_max_output_tokens: int = 500
    openai_api_key: str = ""

    @field_validator("backend_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> list[str] | Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("vision_provider", mode="before")
    @classmethod
    def normalize_vision_provider(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("image_max_dimension")
    @classmethod
    def validate_image_max_dimension(cls, value: int) -> int:
        if value < 320:
            raise ValueError("image_max_dimension must be at least 320")
        return value

    @field_validator("image_jpeg_quality")
    @classmethod
    def validate_image_jpeg_quality(cls, value: int) -> int:
        if value < 40 or value > 95:
            raise ValueError("image_jpeg_quality must be between 40 and 95")
        return value

    @field_validator("image_reencode_threshold_bytes")
    @classmethod
    def validate_image_reencode_threshold_bytes(cls, value: int) -> int:
        if value < 0:
            raise ValueError("image_reencode_threshold_bytes must be at least 0")
        return value

    @field_validator("openai_timeout_seconds")
    @classmethod
    def validate_openai_timeout_seconds(cls, value: float) -> float:
        if value <= 0 or value > 60.0:
            raise ValueError("openai_timeout_seconds must be greater than 0 and no more than 60.0")
        return value

    @field_validator("openai_max_output_tokens")
    @classmethod
    def validate_openai_max_output_tokens(cls, value: int) -> int:
        if value < 100 or value > 2000:
            raise ValueError("openai_max_output_tokens must be between 100 and 2000")
        return value

    @field_validator("single_label_timeout_seconds")
    @classmethod
    def validate_single_label_timeout_seconds(cls, value: float) -> float:
        if value <= 0 or value > 5.0:
            raise ValueError(
                "single_label_timeout_seconds must be greater than 0 and no more than 5.0"
            )
        return value

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
