# Vision Service

## 1. Purpose

Convert a label image into an `ExtractedLabel` using a mockable vision boundary.

This module does not compare fields or decide the final verdict.

## 2. Phase

Phase 2 - Vision Service.

## 3. Ownership

Backend services.

## 4. Inputs And Outputs

Inputs:

- Uploaded image bytes or a preprocessed image payload.
- Safe metadata such as content type and filename when useful for validation.

Outputs:

- `ExtractedLabel` with nullable canonical fields.
- Provider failure categories that the API can translate into safe error envelopes.

## 5. Public Interfaces

Expected public interfaces:

- `VisionService.extract_label(image) -> ExtractedLabel`
- `FakeVisionService` or equivalent test double.
- `preprocess_image(image_bytes, content_type) -> PreprocessedImage`

## 6. Dependencies

Allowed:

- Image-processing library chosen in Phase 2.
- OpenAI or other selected vision provider client behind an interface.
- Pydantic models from the domain package.

Forbidden:

- Direct comparison logic.
- Hardcoded API keys.
- Tests that require live provider calls.

## 7. Error Behavior

Non-label, blurry, angled, glare-heavy, timeout, and malformed provider responses should degrade gracefully. Return partial fields when possible. Use safe provider error categories when extraction cannot complete.

## 8. Tests Required

- Fake service returns a valid `ExtractedLabel`.
- Unknown fields become `null`.
- Malformed structured output is handled defensively.
- Timeout/provider failures are categorized.
- Preprocessing reduces oversized images.
- Government warning prompt/capture path preserves verbatim text as much as possible.
- If visual styling is inspected, captured styling evidence is optional metadata and must not replace verbatim warning text.

## 9. Exit Criteria

- Tests run without real API calls.
- A sample runner can exercise the real provider when credentials are present.
- No secrets are committed or logged.

## 10. Files Likely Touched

- `backend/app/services/vision.py`
- `backend/app/services/fake_vision.py`
- `backend/app/services/image_preprocess.py`
- `backend/app/tests/test_vision.py`
- `backend/scripts/run_vision_sample.py`
