from collections.abc import Iterable

from app.domain.models import ExtractedLabel
from app.services.image_preprocess import PreprocessedImage
from app.services.vision import VisionServiceError


class FakeVisionService:
    def __init__(
        self,
        result: ExtractedLabel | None = None,
        *,
        results: Iterable[ExtractedLabel] | None = None,
        error: VisionServiceError | None = None,
    ) -> None:
        self._result = result or ExtractedLabel()
        self._results = list(results or [])
        self._error = error
        self.calls: list[PreprocessedImage] = []

    async def extract_label(self, image: PreprocessedImage) -> ExtractedLabel:
        self.calls.append(image)
        if self._error is not None:
            raise self._error
        if self._results:
            return self._results.pop(0)
        return self._result
