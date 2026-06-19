# Batch Verification

## 1. Purpose

Support verifying multiple image and application-data pairs with bounded concurrency, item-level isolation, summary counts, and drill-down results.

## 2. Phase

Phase 5 - Batch Upload.

## 3. Ownership

Backend batch API/service and frontend batch feature.

## 4. Inputs And Outputs

Inputs:

- Multiple image and application-data pairs.

Outputs:

- Per-item verification result or safe per-item error.
- Summary counts: `passed`, `needs_review`, and `total`.

## 5. Public Interfaces

- `POST /verify/batch`
- Frontend batch upload view.
- Batch API client function.

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

## 8. Tests Required

- Multiple valid items process together.
- One bad item does not fail the whole batch.
- Summary counts are correct.
- Concurrency limit is enforced or directly testable.
- Frontend shows progress, summary, and drill-down.

## 9. Exit Criteria

- Three or more labels can process together.
- Individual results remain inspectable.
- Summary counts match item outcomes.

## 10. Files Likely Touched

- `backend/app/api/batch.py`
- `backend/app/services/batch.py`
- `backend/app/tests/test_batch_endpoint.py`
- `frontend/src/features/batch/`
- `frontend/src/api/verification.ts`
- `frontend/src/types/api.ts`
