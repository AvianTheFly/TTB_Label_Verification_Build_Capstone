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

Public interfaces:

- `VisionService.extract_label(image) -> ExtractedLabel`
- `OpenAIVisionService` real provider implementation, configured by environment-backed settings.
- `FakeVisionService` test double for unit and API tests. It is never the default runtime provider.
- `DemoFixtureVisionService` filename-keyed fixture reader for explicit local demo scenarios only.
- `preprocess_image(image_bytes, content_type) -> PreprocessedImage`
- `VisionServiceError` with safe provider/extraction categories.

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

OpenAI extraction uses structured output for exactly the seven canonical fields. Unknown, unclear, absent, obscured, or ambiguous fields must be returned as `null`; the provider prompt forbids guessing and asks for `government_warning` to be copied verbatim when visible.

Runtime provider selection is environment-backed:

- `VISION_PROVIDER=openai` uses the real provider and is the production default.
- `VISION_PROVIDER=demo` uses filename-keyed demo fixtures for local demonstrations.
- `VISION_PROVIDER=fake` is reserved for tests and explicit local development.

Image preprocessing is configurable through `IMAGE_MAX_DIMENSION` and `IMAGE_JPEG_QUALITY`.
OpenAI calls use `OPENAI_TIMEOUT_SECONDS`, capped at 60 seconds as a safety limit while the
API logs whether the measured single-label request exceeds the 5-second target.
`OPENAI_IMAGE_DETAIL` defaults to `low`, and `OPENAI_MAX_OUTPUT_TOKENS` caps the structured
response size for latency control.

Safe categories include:

- `non_label_image`
- `blurry_image`
- `angled_image`
- `glare_heavy_image`
- `partial_extraction`
- `malformed_provider_output`
- `provider_timeout`
- `provider_quota_exceeded`
- `provider_unavailable`
- `provider_not_configured`
- `extraction_failed`

Warning-style compliance is not claimed in Phase 2. The service preserves warning text for exact comparison; visual bold detection for the `GOVERNMENT WARNING:` lead-in remains a documented limitation unless a later phase adds an explicit evidence contract.

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
- `backend/app/services/demo_vision.py`
- `backend/app/services/image_preprocess.py`
- `backend/app/tests/test_vision.py`
- `backend/scripts/run_vision_sample.py`
