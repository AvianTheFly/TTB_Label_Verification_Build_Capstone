import json
from pathlib import Path

from pydantic import ValidationError

from app.domain.models import ExtractedLabel
from app.services.image_preprocess import PreprocessedImage
from app.services.vision import VisionServiceError


class DemoFixtureVisionService:
    def __init__(self, extraction_dir: Path | None = None) -> None:
        self._extraction_dir = extraction_dir or Path(__file__).with_name("demo_extractions")
        self.calls: list[PreprocessedImage] = []

    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        self.calls.append(image)
        if not image.filename:
            return ExtractedLabel()

        extraction_path = self._extraction_dir / f"{Path(image.filename).stem}.json"
        if not extraction_path.is_file():
            return ExtractedLabel()

        try:
            payload = json.loads(extraction_path.read_text(encoding="utf-8"))
            return ExtractedLabel.model_validate(payload)
        except (OSError, json.JSONDecodeError, ValidationError) as exc:
            raise VisionServiceError(
                "malformed_provider_output",
                "The demo extraction fixture could not be read.",
            ) from exc
