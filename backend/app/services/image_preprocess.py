from dataclasses import dataclass
from io import BytesIO
from typing import Literal

from PIL import Image, ImageOps, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 20_000_000

SUPPORTED_INPUT_CONTENT_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/webp",
    }
)
OUTPUT_CONTENT_TYPE = "image/jpeg"
DEFAULT_MAX_DIMENSION_PX = 1600
DEFAULT_JPEG_QUALITY = 85

ImagePreprocessCategory = Literal["unsupported_file_type", "file_too_large", "invalid_image"]


class ImagePreprocessError(Exception):
    def __init__(self, category: ImagePreprocessCategory, message: str) -> None:
        super().__init__(message)
        self.category = category
        self.message = message


@dataclass(frozen=True)
class PreprocessedImage:
    content: bytes
    content_type: str
    original_content_type: str
    original_size_bytes: int
    processed_size_bytes: int
    original_width: int
    original_height: int
    processed_width: int
    processed_height: int
    filename: str | None = None


def preprocess_image(
    image_bytes: bytes,
    content_type: str,
    filename: str | None = None,
    *,
    max_upload_mb: int = 10,
    max_dimension_px: int = DEFAULT_MAX_DIMENSION_PX,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> PreprocessedImage:
    normalized_content_type = _normalize_content_type(content_type)
    if normalized_content_type not in SUPPORTED_INPUT_CONTENT_TYPES:
        raise ImagePreprocessError(
            "unsupported_file_type",
            "Please upload a JPG, PNG, or WEBP label image.",
        )

    if not image_bytes:
        raise ImagePreprocessError("invalid_image", "The uploaded image is empty.")

    max_bytes = max_upload_mb * 1024 * 1024
    if len(image_bytes) > max_bytes:
        raise ImagePreprocessError(
            "file_too_large",
            f"Please upload an image smaller than {max_upload_mb} MB.",
        )

    try:
        with Image.open(BytesIO(image_bytes)) as opened:
            opened.load()
            detected_content_type = Image.MIME.get(opened.format or "")
            if detected_content_type not in SUPPORTED_INPUT_CONTENT_TYPES:
                raise ImagePreprocessError(
                    "unsupported_file_type",
                    "Please upload a JPG, PNG, or WEBP label image.",
                )

            image = ImageOps.exif_transpose(opened)
            original_width, original_height = image.size
            requires_composite = image.mode in {"RGBA", "LA"} or (
                image.mode == "P" and "transparency" in image.info
            )
            if requires_composite:
                image = _composite_on_white(image)
            else:
                image = image.convert("RGB")

            resized = max(image.size) > max_dimension_px
            if resized:
                image.thumbnail(
                    (max_dimension_px, max_dimension_px),
                    Image.Resampling.LANCZOS,
                )

            output = BytesIO()
            image.save(output, format="JPEG", quality=jpeg_quality, optimize=True)
            processed = output.getvalue()
            processed_content_type = OUTPUT_CONTENT_TYPE

            if (
                not resized
                and not requires_composite
                and normalized_content_type in SUPPORTED_INPUT_CONTENT_TYPES
                and len(image_bytes) <= len(processed)
            ):
                processed = image_bytes
                processed_content_type = normalized_content_type
    except ImagePreprocessError:
        raise
    except (Image.DecompressionBombError, OSError, UnidentifiedImageError, ValueError) as exc:
        raise ImagePreprocessError(
            "invalid_image",
            "The uploaded file is not a readable image.",
        ) from exc

    return PreprocessedImage(
        content=processed,
        content_type=processed_content_type,
        original_content_type=normalized_content_type,
        original_size_bytes=len(image_bytes),
        processed_size_bytes=len(processed),
        original_width=original_width,
        original_height=original_height,
        processed_width=image.width,
        processed_height=image.height,
        filename=filename,
    )


def _normalize_content_type(content_type: str) -> str:
    return content_type.split(";", 1)[0].strip().lower()


def _composite_on_white(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    background.alpha_composite(rgba)
    return background.convert("RGB")
