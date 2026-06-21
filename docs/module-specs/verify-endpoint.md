# Verify Endpoint

## 1. Purpose

Orchestrate single-label verification by validating input, extracting label data, comparing fields, and returning a timed `VerificationResult`.

## 2. Phase

Phase 3 - `/verify` Endpoint.

## 3. Ownership

Backend API.

## 4. Inputs And Outputs

Inputs:

- Multipart `image`.
- Multipart `application_data` JSON string using canonical fields.
- Optional multipart `use_real_vision` boolean string; false or omitted uses deterministic demo extraction fixtures, true uses the configured vision provider.
- Optional multipart `openai_api_key` and `openai_model`; when `use_real_vision` is true and a key is provided, the key/model are used only for that request and are not persisted or logged.

Outputs:

- `VerificationResult` with per-field results, `overall_verdict`, and `latency_ms`.

## 5. Public Interfaces

- `POST /verify`
- Test dependency override for `VisionService`.

## 6. Dependencies

Allowed:

- FastAPI.
- Domain comparison engine.
- Vision service interface.
- Image validation/preprocessing service.
- Error envelope helpers.

Forbidden:

- Raw provider details in responses.
- Stack traces in responses.
- Direct environment access inside route handlers.

## 7. Error Behavior

Bad file types, oversized files, malformed JSON, missing required fields, empty submissions, and provider failures must return readable 4xx or safe 5xx responses using `docs/interfaces/error-contracts.md`.

## 8. Tests Required

- Valid `/verify` submission using mocked vision.
- Bad file type returns clear 4xx.
- Empty submission returns clear 4xx.
- Missing required application field returns clear 4xx.
- Response includes per-field results, expected/found values, verdict, and `latency_ms`.
- Government warning failure surfaces extracted warning text.

## 9. Exit Criteria

- API tests are green.
- Curl or HTTP example returns the documented contract.
- Single-label timing is measured and logged.

## 10. Files Likely Touched

- `backend/app/api/verify.py`
- `backend/app/api/dependencies.py`
- `backend/app/core/error_handlers.py`
- `backend/app/tests/test_verify_endpoint.py`
- `docs/interfaces/api-contracts.md`
