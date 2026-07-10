from app.core.config import get_settings
from app.core.errors import ApiError
from app.services.fake_vision import FakeVisionService
from app.services.vision import OpenAIVisionService, VisionService


def get_vision_service() -> VisionService:
    settings = get_settings()
    provider = settings.vision_provider.strip().lower()

    if provider == "fake":
        return FakeVisionService()
    if provider == "openai":
        return OpenAIVisionService.from_settings(settings)

    raise ApiError(
        status_code=503,
        code="vision_unavailable",
        message="The label reader is not available right now.",
        details={},
    )
