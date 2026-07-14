# Batch Verification

## 1. Purpose

Support verifying multiple image and application-data pairs with bounded concurrency, item-level isolation, summary counts, and drill-down results.

## 2. Phase

Phase 5 - Batch Upload.

## 3. Ownership

Backend batch API/service and frontend batch feature.

## 4. Inputs And Outputs

Inputs:

- `multipart/form-data` with repeated `images` file parts.
- Repeated `application_data` JSON string parts.
- Users upload label images only. They do not upload application JSON files; the frontend builds `application_data` from the editable application-data inputs.
- Environment-configured `VisionService`; tests inject a mock service.
- Provider credentials and model names must not be accepted from request fields. The frontend must never submit OpenAI API keys or provider-selection flags.
- Items are paired by the order of provided multipart parts: first image with first application-data object, second image with second application-data object, and so on.
- The frontend should submit only complete rows.

Outputs:

- Per-item verification result or safe per-item error.
- Summary counts: `passed`, `needs_review`, and `total`.

## 5. Public Interfaces

- `POST /verify/batch`
- Frontend batch upload view.
- Batch image uploads become application records immediately.
- Frontend label text extraction starts when supported image files are uploaded.
- Batch API client function.
- Batch item error shape: `{ code, message, details }`, not the top-level API error envelope.

## 6. Dependencies

Allowed:

- Single-label verification orchestration.
- Async bounded concurrency primitive.
- Existing result components.

Forbidden:

- Unbounded parallel provider calls.
- Failing the whole batch for one bad item.
- Persisting batch state in a database for the MVP.

## 7. Error Behavior

Each item must isolate validation, extraction, and comparison errors. The endpoint-level response should remain successful when at least the batch envelope is valid.

Whole-request errors use `docs/interfaces/error-contracts.md`. Item-level errors use the distinct batch item error object so the frontend can distinguish one failed label from a failed request.

Mismatched counts create item-level errors for trailing unpaired parts. A missing middle item cannot be represented reliably with this simple multipart shape unless a caller sends a placeholder or invalid part at that position. This limitation is acceptable for the MVP because the frontend owns request construction and submits only complete rows.

Empty batches and requests that cannot be parsed as the batch envelope are whole-request errors.

Batch processing uses a bounded async concurrency limit, default `3`. Batch total latency may exceed 5 seconds for larger batches; the limit protects provider stability, cost/rate limits, memory pressure, and per-item latency.

## 8. Tests Required

- Multiple valid items process together.
- One bad item does not fail the whole batch.
- Summary counts are correct.
- Concurrency limit is enforced or directly testable.
- Item-level errors do not use the top-level error envelope shape.
- Frontend shows progress, summary, and drill-down.
- Frontend adds selected images immediately and keeps uploaded records inspectable.

## 9. Exit Criteria

- Three or more labels can process together.
- Individual results remain inspectable.
- Summary counts match item outcomes.

## 10. Files Likely Touched

- `backend/app/api/batch.py`
- `backend/app/use_cases/batch_verification.py`
- `backend/tests/test_batch_endpoint.py`
- `frontend/src/features/package-workflow/`
- `frontend/src/api/verification.ts`
- `frontend/src/types/api.ts`
