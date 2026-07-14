from typing import Literal

VisionIssueCategory = Literal[
    "non_label_image",
    "blurry_image",
    "angled_image",
    "glare_heavy_image",
    "partial_extraction",
    "malformed_provider_output",
    "provider_timeout",
    "provider_quota_exceeded",
    "provider_unavailable",
    "provider_not_configured",
    "extraction_failed",
]


class VisionServiceError(Exception):
    def __init__(self, category: VisionIssueCategory, message: str) -> None:
        super().__init__(message)
        self.category = category
        self.message = message
