# Technical Requirements Audit

This document converts `TTB_Label_Verification_Build_Playbook 1.pdf` and
`Additional Project Requirements` into a code-review checklist.

Use it to compare the source requirements against the codebase and identify
missing, risky, or unverified work.

## Classification

- `MUST`: required by the playbook, deliverables, or stakeholder requirement.
- `SHOULD`: expected implementation detail that supports a `MUST`.
- `SUGGESTION`: contextual guidance, optional enhancement, or candidate tradeoff.

## Current Audit Snapshot

Last checked: 2026-07-13.

Backend checks passed:

```bash
cd backend
uv run --extra dev ruff check .
uv run --extra dev pytest
```

Result: ruff passed; `125 passed, 1 warning`.

Frontend checks passed:

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Result: typecheck passed; `29 passed`; production build passed.

Important current gaps or risks:

- Deployed backend p50/p95 latency is still documented as pending in `README.md`.
- Final live deployed `/verify` and batch flow checks are still documented as pending.
- Frontend batch workflow now calls `/verify/batch`; manual browser verification is still
  recommended for progress, summary, and drill-down UX.
- Application data remains required, and the frontend builds it from editable fields.
- Government warning text exactness is implemented; bold styling detection is documented
  as not claimed.

## Requirement Checklist

| ID | Requirement | Class | Source | Verify Against Codebase | Current Status |
| --- | --- | --- | --- | --- | --- |
| R-001 | App is a standalone proof-of-concept; do not integrate with COLA. | MUST | Additional requirements, IT context | Search for COLA clients, auth, external persistence, or submission integrations. | Appears pass; README states no COLA integration. |
| R-002 | No database for MVP; each request is self-contained. | MUST | Playbook architecture | Confirm no DB dependency, migration, ORM, persistent request store, or upload storage. | Appears pass; backend tests pass. |
| R-003 | Do not store uploaded images, extracted label data, or application data beyond request lifetime. | MUST | Additional requirements, IT/security context | Inspect upload handling, temp files, logs, object storage, analytics, and browser downloads. | Appears pass for backend; reviewed-results download is user-initiated browser output. |
| R-004 | API keys and secrets live only in environment variables. | MUST | Playbook standing rules, deliverables | Confirm `.env` ignored, `.env.example` placeholders only, no keys in docs/tests/config. | Local audit pass: only `.env.example` is tracked; no real-looking keys found. |
| R-005 | Backend stack uses Python, FastAPI, Pydantic v2, and `uv`. | MUST | Project rules/playbook | Inspect `backend/pyproject.toml`, imports, and Pydantic model config. | Appears pass. |
| R-006 | Frontend uses React, TypeScript, and Vite. | MUST | Project rules/playbook | Inspect `frontend/package.json`, `src`, and Vite config. | Pass: typecheck, tests, and build passed. |
| R-007 | Public API and backend model fields use exact snake_case canonical names. | MUST | Playbook data model | Search for alternate payload fields such as `alcohol_content`, `producer_name_address`, or camelCase. | Appears pass in core API/types. |
| R-008 | Canonical fields are `brand_name`, `class_type`, `abv`, `net_contents`, `producer`, `country_of_origin`, `government_warning`. | MUST | Playbook data model | Inspect `ApplicationData`, `ExtractedLabel`, frontend TS types, request payloads, API docs. | Pass in backend tests and frontend types. |
| R-009 | `GET /health` exists and returns service status. | MUST | Phase 0 | Run backend health test and local/deployed curl. | Backend test passed; deployed health still needs final confirmation. |
| R-010 | Frontend first screen is the actual verification tool, not a marketing page. | MUST | Playbook/frontend phase | Inspect `App.tsx` and rendered UI. | Appears pass from workflow files; browser verification still recommended. |
| R-011 | UI is usable by a non-technical older user with no instructions. | MUST | Sarah/Dave stakeholder notes, Phase 4 | Manual UX review: large controls, clear labels, obvious verify action, plain errors. | Needs browser/manual accessibility pass. |
| R-012 | Single-label verification targets under 5 seconds and every single-label response includes `latency_ms`. | MUST | Playbook, stakeholder notes | Assert `/verify` response shape, logs, live p50/p95. | Backend tests pass; deployed latency pending. |
| R-013 | Batch upload is required. | MUST | Sarah stakeholder notes, Phase 5 | Confirm backend `/verify/batch`, frontend batch UI, progress/summary/drill-down. | Local automated pass: backend batch tests pass and frontend workflow calls `/verify/batch`; manual browser UX check still recommended. |
| R-014 | Batch processing uses bounded concurrency. | MUST | Phase 5 | Inspect async semaphore/config and tests. | Pass in backend tests. |
| R-015 | One bad batch item must not fail the whole batch. | MUST | Phase 5 | Endpoint tests for per-item errors and summary counts. | Pass in backend tests. |
| R-016 | Batch summary includes `passed`, `needs_review`, and `total`. | MUST | Playbook data model/Phase 5 | Inspect `BatchSummary`, API contract, response tests. | Pass in backend tests. |
| R-017 | Pydantic models exist for `ApplicationData`, `ExtractedLabel`, `FieldResult`, `VerificationResult`, and batch shapes. | MUST | Phase 1 | Inspect `backend/app/domain/models.py`. | Pass. |
| R-018 | Domain comparison logic is pure: no FastAPI, file I/O, network, or provider clients. | MUST | Phase 1 | Inspect imports in `backend/app/domain/`. | Appears pass; backend tests pass. |
| R-019 | Brand name, class/type, and producer use fuzzy comparison. | MUST | Comparison strategy | Tests for case/punctuation/whitespace and threshold behavior. | Pass in backend tests. |
| R-020 | Country comparison normalizes aliases/synonyms, such as `USA` and `United States`. | MUST | Comparison strategy | Unit tests for synonym map. | Pass in backend tests. |
| R-021 | ABV comparison extracts numeric value with tolerance around +/- 0.1. | MUST | Comparison strategy | Unit tests for `45%`, `45% Alc./Vol.`, proof text. | Pass in backend tests. |
| R-022 | Net contents comparison normalizes units to canonical volume. | MUST | Comparison strategy | Unit tests for `750 mL` and `750ml`. | Pass in backend tests. |
| R-023 | Government warning comparison is exact and case-sensitive after whitespace collapse only. | MUST | Playbook, Jenny stakeholder note | Unit tests for correct text, title case fail, missing colon fail, whitespace pass. | Pass in backend tests. |
| R-024 | Warning failure returns extracted warning text for human review. | MUST | Playbook critical tension | Endpoint/domain tests assert failed `found` value. | Pass in backend tests. |
| R-025 | Overall verdict rule: any field `FAIL` -> `NEEDS_REVIEW`; all `PASS` -> `APPROVED`. | MUST | Playbook data model | Unit/API tests for both verdicts. | Pass in backend tests. |
| R-026 | Vision service is behind an explicit mockable interface. | MUST | Architecture/Phase 2 | Inspect `VisionService`, dependency injection, fake service tests. | Pass in backend tests. |
| R-027 | Vision extraction returns structured JSON into `ExtractedLabel`; unknown/unclear fields are `null`. | MUST | Phase 2 | Inspect structured-output schema, parser tests, prompt. | Pass in backend tests. |
| R-028 | Vision prompt asks for government warning copied verbatim. | MUST | Phase 2 review | Inspect prompt and tests. | Pass in backend tests. |
| R-029 | Image preprocessing downscales/re-encodes before provider call. | MUST | Architecture/Phase 2 | Inspect preprocessing code and tests. | Pass in backend tests. |
| R-030 | Blurry, angled, glare-heavy, or non-label images degrade gracefully. | SHOULD | Jenny note, Phase 2/6 | Tests for partial/null extraction and safe errors; live imperfect-image test. | Backend tests cover categories; live check still needed. |
| R-031 | `/verify` accepts multipart image plus application data. | MUST | Phase 3 | Endpoint tests and curl example. | Pass in backend tests. |
| R-032 | `/verify` validates file type, file size, empty image, and required fields with readable 4xx errors. | MUST | Phase 3 | Endpoint tests for bad upload/empty submission. | Pass in backend tests. |
| R-033 | API errors use canonical error envelope and never expose stack traces, keys, local paths, provider internals, or raw image contents. | MUST | Error contracts/coding standards | Inspect handlers and tests for error shape/logging. | Backend tests pass; final manual audit recommended. |
| R-034 | Logs include timing and provider failure categories but never secrets or raw image contents. | MUST | Phase 3 | Inspect logging statements and tests. | Backend tests pass for logging coverage. |
| R-035 | Frontend single-label flow has image picker, seven labeled fields, submit, loading, readable errors, verdict, per-field results, and expected-vs-found failures. | MUST | Phase 4 | Frontend tests and manual browser review. | Local tests pass; manual browser review still recommended. |
| R-036 | Frontend uses friendly labels but payload keys remain canonical. | MUST | Project rules/Phase 4 | Inspect TS types and FormData payload. | Appears pass. |
| R-037 | Frontend batch flow includes progress, summary table, and item drill-down. | MUST | Phase 5 | Frontend tests and manual browser review. | Improved: frontend uses `/verify/batch` and tests pass; manual browser UX review still recommended. |
| R-038 | Public repo and README are required deliverables. | MUST | Additional requirements | Confirm repo URL and README setup/run/approach/tools/assumptions/limitations. | README has most content; final audit pending. |
| R-039 | Deployed application URL is required. | MUST | Additional requirements, Phase 7 | Confirm live frontend, backend health, real `/verify`, and batch flows. | Frontend URL documented; deployed backend/live checks pending in README. |
| R-040 | README documents approach, tools, assumptions, tradeoffs, and limitations. | MUST | Additional requirements | Inspect README final sections. | Appears mostly pass. |
| R-041 | Government warning lead-in must be all caps and bold. | MUST for label compliance; PARTIAL for MVP automation | Jenny note/additional requirements | Text exactness must be automated; bold styling must be detected or documented as limitation. | Text exactness pass; bold detection documented as limitation. |
| R-042 | Do not claim warning-style compliance unless styling detection exists. | MUST | Project rules | Inspect README/docs/UI copy. | Appears pass. |
| R-043 | Cloud/model/provider code stays behind explicit interfaces because outbound domains may be blocked. | MUST | IT context/project rules | Inspect provider boundary and tests without credentials. | Pass in backend tests. |
| R-044 | Tests must not require real model calls. | MUST | Phase 2/3 | Run automated tests without provider credentials. | Pass: backend tests use fakes/mocks. |
| R-045 | Deployment path exists for free-tier host. | MUST | Phase 0/7 | Inspect Render/Vercel config and run deployed checks. | Config present; live backend verification pending. |

## Suggestions And Optional Enhancements

These are not hard failures unless the project plan explicitly adopts them.

| ID | Suggestion | Source | Reason To Consider |
| --- | --- | --- | --- |
| S-001 | Review official TTB label guidelines for additional context. | Additional requirements | Helps with domain accuracy, but MVP scope is matching application data to label text. |
| S-002 | Create or source additional synthetic test labels, including AI-generated labels. | Additional requirements | Improves demo coverage and imperfect-image testing. |
| S-003 | Capture optional warning-style evidence for bold/all-caps lead-in in a later phase. | Jenny note, project docs | Would close the current style-detection limitation, but requires a reviewed contract change. |
| S-004 | Track deployed warm p50/p95 and cold-start round trip separately. | Phase 6/README | Helps explain free-tier latency versus request processing latency. |
| S-005 | Keep frontend batch-submit coverage around `/verify/batch`. | Phase 5 | Implemented locally; retain tests so the UI does not drift back to one-at-a-time `/verify` calls. |
| S-006 | Keep demo/fake providers available only for local tests and demos. | Architecture/provider isolation | Useful for repeatable testing, but production must use real extraction. |

## Review Commands

Backend:

```bash
cd backend
uv run --extra dev ruff check .
uv run --extra dev pytest
```

Frontend:

```bash
cd frontend
npm install
npm run typecheck
npm test
npm run build
```

Live deployed checks:

```bash
cd backend
uv run python scripts/live_checklist.py --url https://YOUR_BACKEND_ORIGIN --runs 20
```

Manual checks:

- Open the deployed frontend.
- Verify one valid label.
- Verify one intentional mismatch.
- Verify a warning with title-case `Government Warning:` fails.
- Verify a batch of at least three labels.
- Confirm one bad batch item does not hide successful items.
- Confirm errors are plain English and no CORS errors appear in browser devtools.
