from app.api.dependencies import get_submitted_openai_vision_service
from app.services.fake_vision import DemoVisionService
from app.services.vision import VisionService


def select_request_vision_service(
    *,
    use_real_vision: bool,
    openai_api_key: str | None,
    openai_model: str | None,
    configured_vision_service: VisionService,
) -> VisionService:
    if not use_real_vision:
        return DemoVisionService()

    submitted_service = get_submitted_openai_vision_service(
        openai_api_key=openai_api_key,
        openai_model=openai_model,
    )
    return submitted_service or configured_vision_service

