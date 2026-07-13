# Comparison Engine

## 1. Purpose

Compare submitted application data against extracted label data and return explainable per-field results.

This module does not read files, call HTTP services, import FastAPI, or know how extraction happened.

## 2. Phase

Phase 1 - Data Models and Comparison Engine.

## 3. Ownership

Backend domain.

## 4. Inputs And Outputs

Inputs:

- `ApplicationData` with canonical required fields.
- `ExtractedLabel` with nullable extracted fields and optional raw extraction context.

Outputs:

- `FieldResult` for each field.
- `VerificationResult` with `overall_verdict`.

## 5. Public Interfaces

Expected public functions:

- `compare_label(application_data, extracted_label) -> VerificationResult`
- One small comparison helper per field.

Expected public models:

- `ApplicationData`
- `ExtractedLabel`
- `FieldResult`
- `VerificationResult`
- batch result shapes needed by Phase 5.

## 6. Dependencies

Allowed:

- Pydantic v2.
- Standard-library normalization helpers.
- `rapidfuzz` for fuzzy matching `brand_name`, `class_type`, and `producer`.
  The Phase 1 threshold is `90` after case, punctuation, and whitespace normalization.

Forbidden:

- FastAPI.
- Vision clients.
- File I/O.
- Network calls.
- Environment variables.

## 7. Error Behavior

Domain comparison should not raise for normal mismatches. Missing or unclear extracted values should produce `FAIL` field results with clear messages and found value `null`.

## 8. Tests Required

- Case-only brand difference passes.
- Fuzzy brand/class/producer behavior is thresholded and documented.
- `45%` vs `45% Alc./Vol. (90 Proof)` passes.
- ABV outside tolerance fails.
- `750 mL` vs `750ml` passes.
- Unit conversion behavior is covered.
- `USA` vs `United States` passes.
- Government warning in title case fails.
- Government warning missing the colon fails.
- Correct all-caps warning passes.
- Misread warning failure returns extracted warning text in `found`.
- Styling detection is not part of pure text comparison unless a later approved interface explicitly adds style evidence.
- Any field failure produces `NEEDS_REVIEW`.
- All fields passing produces `APPROVED`.

## 9. Exit Criteria

- Comparison engine tests are green.
- Domain package remains independent of API, file I/O, and vision services.
- Contracts in `docs/interfaces/api-contracts.md` match the model fields.

## 10. Files Likely Touched

- `backend/app/domain/models.py`
- `backend/app/domain/comparison.py`
- `backend/app/domain/normalization.py`
- `backend/tests/test_comparison.py`
- `docs/interfaces/api-contracts.md`
