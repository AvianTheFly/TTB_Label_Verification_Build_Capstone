# Hardening

## 1. Purpose

Improve reliability, speed, validation, accessibility, and demo readiness without adding new product features.

## 2. Phase

Phase 6 - Robustness, Performance, Accessibility.

## 3. Ownership

Cross-cutting backend, frontend, service, and documentation work.

## 4. Inputs And Outputs

Inputs:

- Current single-label and batch flows.
- Manual and automated checklist results.

Outputs:

- Measured latency.
- Tuned image/model behavior.
- Improved validation and accessible UI.
- Checklist report.
- Environment-backed provider timeout and image preprocessing settings.

## 5. Public Interfaces

No new public interfaces should be introduced unless a hardening fix requires it and the contract docs are updated.

## 6. Dependencies

Allowed:

- Existing app modules.
- Measurement scripts or manual checklist docs.
- Accessibility tooling if selected during planning.

Forbidden:

- New product features unrelated to hardening.
- Scope expansion beyond the checklist.

## 7. Error Behavior

All known bad inputs should produce plain-English errors. Provider failures should be categorized and safe.

## 8. Tests Required

- Valid label.
- Intentional mismatch.
- Case-only brand.
- ABV normalization.
- Net contents normalization.
- Country synonym normalization.
- Missing, wrong-caps, and correct government warning.
- Imperfect image.
- Wrong file type.
- Empty submit.
- Batch summary.
- Single-label speed under 5 seconds.

## 9. Exit Criteria

- Checklist passes against the deployed URL.
- Actual single-label latency numbers are reported.
- Provider timeout is no more than 4.5 seconds.
- Image preprocessing dimensions and JPEG quality are configurable from environment variables.
- Accessibility issues found in the pass are fixed or documented as limitations.

## 10. Files Likely Touched

- Existing backend and frontend modules only as needed.
- `README.md`
- Final checklist or audit notes.
