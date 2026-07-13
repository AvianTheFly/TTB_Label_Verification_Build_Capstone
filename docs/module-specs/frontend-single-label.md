# Frontend Single-Label Flow

## 1. Purpose

Provide the primary user workflow for uploading one label image, entering seven application fields, and reviewing the verification result.

## 2. Phase

Phase 4 - Frontend Single-Label Flow.

## 3. Ownership

Frontend application, API client, components, and styles.

## 4. Inputs And Outputs

Inputs:

- User-selected label image.
- Seven canonical application fields.

Outputs:

- Loading state.
- Plain-English errors.
- Prominent `APPROVED` or `NEEDS_REVIEW` verdict.
- Per-field PASS/FAIL results with expected-vs-found details on failures.

## 5. Public Interfaces

Expected public modules:

- `frontend/src/api/verification.ts`
- `frontend/src/features/single-label/`
- shared result and form components as needed.

## 6. Dependencies

Allowed:

- React.
- TypeScript API types mirroring backend snake_case fields.
- Existing CSS conventions.

Forbidden:

- Marketing landing page as the primary screen.
- CamelCase API fields.
- User-facing jargon.

## 7. Error Behavior

Errors from the API must render in plain English without stack traces or raw provider details. The user should know what to fix next.

## 8. Tests Required

At minimum:

- Typecheck passes.
- Form requires the seven fields and an image.
- API error renders readably.
- Result view shows verdict and failing-field details.

Playwright or Vitest can be added when the phase plan selects the test level.

## 9. Exit Criteria

- User can verify one image plus application data on the running app.
- Results are understandable without instructions.
- Controls are large, clear, and high contrast.

## 10. Files Likely Touched

- `frontend/src/features/single-label/`
- `frontend/src/api/verification.ts`
- `frontend/src/types/api.ts`
- `frontend/src/components/`
- `frontend/src/styles/global.css`
