# Phase-Oriented Build Notes

This file turns Part 3 of `TTB_Label_Verification_Build_Playbook 1.pdf` into repo-local implementation guardrails. It does not replace the playbook. It exists so future AI agents have a concrete map of where each phase should land.

Before executing any phase, read:

- `docs/requirements-traceability.md`
- `docs/phase-control.md`
- the relevant `docs/module-specs/*.md`

## Phase 0 - Scaffold, Secrets, Deploy Skeleton

Files usually touched:

- `backend/pyproject.toml`
- `backend/app/main.py`
- `backend/app/api/health.py`
- `backend/app/core/config.py`
- `backend/app/core/errors.py`
- `backend/tests/test_health.py`
- `frontend/package.json`
- `frontend/src/app/App.tsx`
- `frontend/src/api/health.ts`
- `frontend/src/styles/global.css`
- `.env.example`
- `.gitignore`
- `README.md`

Do not implement comparison, vision, `/verify`, or batch behavior in this phase.

Boundary risk: adding feature logic too early can make later phase prompts rewrite the scaffold. Keep Phase 0 boring and deployable.

Phase 0 is not complete until the app loads at a live deployed URL and the frontend shows the health response.

## Phase 1 - Data Models and Comparison Engine

Files usually touched:

- `backend/app/domain/models.py`
- `backend/app/domain/comparison.py`
- `backend/app/domain/normalization.py`
- `backend/tests/test_comparison.py`
- `docs/interfaces/api-contracts.md`
- `docs/module-specs/comparison-engine.md`

Required tests:

- Case-only brand difference passes.
- `45%` vs `45% Alc./Vol. (90 Proof)` passes.
- `750 mL` vs `750ml` passes.
- `USA` vs `United States` passes.
- Title-case government warning fails.
- Warning missing the colon fails.
- Correct all-caps warning passes.
- Misread warning failure returns extracted warning text.

Boundary risk: Phase 1 is the contract root for later phases. Do not import FastAPI, provider clients, image code, or file I/O into the domain package.

Warning styling note: Phase 1 owns exact warning text comparison only. Do not add visual styling requirements to pure comparison without a reviewed interface change.

## Phase 2 - Vision Service

Files usually touched:

- `backend/app/services/vision.py`
- `backend/app/services/image_preprocess.py`
- `backend/app/services/fake_vision.py`
- `backend/tests/test_vision.py`
- `backend/scripts/run_vision_sample.py`
- `docs/module-specs/vision-service.md`

Structured output must map into `ExtractedLabel`. Tests should use fakes/mocks and must not call a real model.

Boundary risk: provider output must adapt to the domain model, not redefine it. Phase 2 should never make Phase 1 comparison tests require a model call.

Warning styling note: If the model can identify bold/all-caps warning lead-in styling, capture it as optional evidence. Verbatim warning text remains required.

## Phase 3 - `/verify` Endpoint

Files usually touched:

- `backend/app/api/verify.py`
- `backend/app/api/dependencies.py`
- `backend/app/core/error_handlers.py`
- `backend/tests/test_verify_endpoint.py`
- `docs/interfaces/api-contracts.md`
- `docs/module-specs/verify-endpoint.md`

The endpoint must return per-field results, expected/found values, overall verdict, and `latency_ms`.

Boundary risk: Phase 3 wires services together. Keep route handlers thin and use dependency injection so endpoint tests can use the Phase 2 fake.

## Phase 4 - Frontend Single-Label Flow

Files usually touched:

- `frontend/src/features/single-label/`
- `frontend/src/api/verification.ts`
- `frontend/src/types/api.ts`
- `frontend/src/components/`
- `frontend/src/styles/global.css`

Primary screen should be the usable verification tool. Do not create a marketing landing page.

Boundary risk: UI labels can be friendly, but API payload keys must stay exactly aligned with `docs/interfaces/api-contracts.md`.

## Phase 5 - Batch Upload

Files usually touched:

- `backend/app/api/batch.py`
- `backend/app/use_cases/batch_verification.py`
- `backend/tests/test_batch_endpoint.py`
- `frontend/src/features/package-workflow/`
- `frontend/src/api/verification.ts`
- `docs/module-specs/batch-verification.md`

Batch processing must use bounded concurrency and item-level failure isolation.

Boundary risk: batch should reuse the single-label orchestration without changing single-label `/verify` behavior or response shape.

## Phase 6 - Robustness, Performance, Accessibility

Files touched depend on measurements. Keep this phase to hardening, tuning, validation, and accessibility. Do not add unrelated features.

Required checklist:

- Valid label.
- Intentional mismatches.
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

Boundary risk: Phase 6 is hardening only. Do not add features while chasing performance or accessibility fixes.

## Phase 7 - Deploy Verification and Submission

Files usually touched:

- `README.md`
- deployment config files
- final docs

Required audit:

- `.env` is not committed.
- No hardcoded keys.
- README includes setup, run, deployed URL, approach, tools, assumptions, and limitations.
- Live URL passes single, batch, warning exact-match, and imperfect-image checks.
- README states whether warning styling detection is supported or documented as a limitation.

Boundary risk: Phase 7 should document and verify the completed app, not redesign it.
