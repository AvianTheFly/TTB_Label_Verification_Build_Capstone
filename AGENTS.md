You are helping build the TTB Label Verification proof-of-concept.

This repository is designed to be built phase by phase by AI coding agents using the prompts in Part 3 of `TTB_Label_Verification_Build_Playbook 1.pdf`. Treat that PDF and `Additional Project Requirements` as the source-of-truth documents. If any markdown guidance conflicts with either source document, the source document wins.

## Standing Rules

1. Stack: Python 3.12, FastAPI, Pydantic v2, React, TypeScript, Vite, `uv` for the backend, no database for the MVP.
2. The app is stateless. Each verification request is self-contained and must not depend on persisted request data.
3. Single-label verification must target under 5 seconds and every single-label response must include `latency_ms`.
4. Batch upload is required. Batch processing must use bounded concurrency and per-item error isolation.
5. The UI must be usable by a non-technical 70+ user without instructions. The first screen should be the actual verification tool, not a marketing page.
6. API keys and secrets live in environment variables only. Never hardcode secrets, print secrets, commit `.env`, or add real keys to docs.
7. Public API and backend model fields use snake_case. Frontend TypeScript types mirror API field names exactly.
8. Use the PDF's canonical API/model field names:
   - `brand_name`
   - `class_type`
   - `abv`
   - `net_contents`
   - `producer`
   - `country_of_origin`
   - `government_warning`
9. Do not introduce alternate API aliases such as `alcohol_content`, `producer_name_address`, or camelCase field names. User-facing copy may say "Alcohol Content" or "Producer" for readability, but API/model contracts must use `abv` and `producer`.
10. Government warning comparison is exact and case-sensitive after whitespace collapse only. All other fields use their documented fuzzy or normalized strategy.
11. Always return the extracted `government_warning` text on warning failure so a human can review OCR/model mistakes.
12. The additional requirements call out the `GOVERNMENT WARNING:` lead-in as all caps and bold. Text exactness is mandatory. Styling detection is optional unless explicitly planned; if not implemented, document it as a limitation rather than claiming style compliance.
13. Prefer correctness, clean structure, small modules, and reviewable changes over ambitious feature breadth.
14. Do not integrate with COLA or add persistent storage for the MVP. This is a standalone proof-of-concept.
15. Do not store uploaded images, extracted label data, or application data beyond the lifetime of a request unless a later source-of-truth requirement explicitly changes this.
16. Cloud/model/provider code must stay behind explicit interfaces because the target environment may block outbound domains.

## Required Agent Cadence

When the user says `PLAN`, propose an approach, files to touch, tests, risks, and exit check. Write no code.

When the user says `REVIEW`, critique the current phase plan against the source requirements, edge cases, deploy risks, latency, security, and tests. Write no code unless explicitly asked.

When the user says `EXECUTE`, implement exactly the approved current-phase plan, add or update tests, run verification commands, and report how to verify.

Keep scope to the current phase. Do not pull later-phase behavior forward unless it is a small interface placeholder needed to keep the current phase clean.

## Phase Isolation And Regression Rules

Each phase must be independently reviewable and repairable. When changing one phase, preserve the public contracts and tests from earlier phases unless the current PLAN explicitly calls out a source-of-truth reason to change them.

Before editing, identify the active phase and read:

- `docs/phase-control.md`
- `docs/phase-playbook.md`
- the relevant `docs/module-specs/*.md`
- `docs/interfaces/api-contracts.md` and `docs/interfaces/error-contracts.md` when touching API/model behavior

For every EXECUTE run:

- Touch only files owned by the current phase unless a dependency doc says otherwise.
- Add or update tests for the current phase.
- Run the current phase checks plus all earlier phase checks listed in `docs/phase-control.md`.
- If an interface contract changes, update the interface doc and every dependent module spec in the same change.
- Do not rewrite a prior phase to make a later phase easier. Add an adapter or explicit interface instead.
- Do not continue to the next phase until the current phase exit check is true.

## Part 3 Phase Boundaries

### Phase 0 - Scaffold, Secrets, Deploy Skeleton

Goal: deployable skeleton only.

Expected work:
- Backend FastAPI app with `/health`.
- Frontend Vite app that calls `/health`.
- `.env.example`, `.gitignore`, setup docs, CORS config.
- No comparison engine, no vision integration, no `/verify` behavior beyond stubs if absolutely needed.

Exit check:
- Backend health works locally.
- Frontend loads and displays the health response.
- Secrets are ignored and examples contain placeholders only.
- Deployment path is ready; Phase 0 is only complete after the live URL health check works.

### Phase 1 - Data Models and Comparison Engine

Goal: pure, tested business logic with no AI or I/O.

Expected work:
- Pydantic models for `ApplicationData`, `ExtractedLabel`, `FieldResult`, `VerificationResult`, and batch result shapes.
- Pure comparison functions for each canonical field.
- Unit tests for normalization, fuzzy matching, ABV, net contents, country synonyms, exact warning, and verdict rule.

Rules:
- Domain logic must stay independent of FastAPI, file I/O, network calls, and model-provider clients.
- Verdict rule: any field `FAIL` means `NEEDS_REVIEW`; all fields `PASS` means `APPROVED`.

### Phase 2 - Vision Service

Goal: mockable image-to-structured-data boundary.

Expected work:
- `VisionService` interface and provider implementation.
- Structured JSON extraction into `ExtractedLabel`.
- Image preprocessing for downscale/re-encode before model calls.
- Defensive parsing and timeout/non-label handling.
- Fake/mock implementation for tests and a sample runner script.

Rules:
- Tests must not require real model calls.
- Unknown or unclear fields should be `null`, not guessed.
- Copy the government warning verbatim whenever possible.

### Phase 3 - `/verify` Endpoint

Goal: wire validation, preprocessing, extraction, comparison, timing, logging, and error shaping.

Expected work:
- `POST /verify` accepts multipart image plus application data.
- Validates file type/size and required fields.
- Uses mocked vision service in API tests.
- Returns full `VerificationResult` including per-field expected/found values, verdict, and `latency_ms`.

Rules:
- Bad uploads and empty submissions return readable 4xx errors, not stack traces.
- Logs include request timing and provider failure categories, but never secrets or raw image contents.

### Phase 4 - Frontend Single-Label Flow

Goal: usable single-label verification flow.

Expected work:
- Image picker, seven labeled fields, obvious submit action, loading state, readable errors.
- Results view with prominent verdict and per-field PASS/FAIL.
- Expected-vs-found details on failures.

Rules:
- Avoid jargon in user-facing text.
- Controls must be large, high-contrast, and obvious.

### Phase 5 - Batch Upload

Goal: batch endpoint and batch UI.

Expected work:
- `POST /verify/batch` with bounded concurrency.
- Per-item errors do not fail the whole batch.
- Summary counts: passed, needs_review, total.
- Frontend progress, summary table, and item drill-down.

### Phase 6 - Robustness, Performance, Accessibility

Goal: hardening only, no new features.

Expected work:
- Measure and tune single-label latency.
- Improve imperfect-image degradation.
- Tighten validation, error messages, accessibility, contrast, labels, and tap targets.
- Run the full checklist from the playbook.

### Phase 7 - Deploy Verification, README, Submission

Goal: final audit and submission readiness.

Expected work:
- README with setup, run, deploy URL, approach, tools, assumptions, limitations.
- Secret audit and `.env` confirmation.
- End-to-end check on deployed single and batch flows.

## Module And Documentation Rules

Module specs live in `docs/module-specs/` and must follow MAP v1:

1. Purpose
2. Phase
3. Ownership
4. Inputs and outputs
5. Public interfaces
6. Dependencies
7. Error behavior
8. Tests required
9. Exit criteria
10. Files likely touched

Interface contracts live in `docs/interfaces/`. If an API or model contract changes, update the relevant interface doc and dependent module specs in the same phase.

Original requirement files are mirrored in `docs/source/` for reviewer visibility. Do not edit source requirement documents except to add clearly labeled notes in separate files.

## Coding Standards

- Keep HTTP handlers thin.
- Keep domain logic pure and typed.
- Keep external services behind explicit interfaces.
- Prefer typed models over dictionaries at module boundaries.
- Add tests before or with behavior changes.
- Keep modules small enough for AI agents and humans to review locally.
- Return public API errors using the canonical error envelope in `docs/interfaces/error-contracts.md`.
- Do not expose stack traces, provider internals, API keys, local absolute paths, or raw unhandled exceptions in API responses.
