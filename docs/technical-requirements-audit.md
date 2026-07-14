# Technical Requirements Audit

Final submission audit against:

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`
- Codebase state after final cleanup

Status labels:

- `PASS`: requirement is implemented and verified locally or by recorded deployed/manual check.
- `QUESTIONABLE`: acceptable for prototype but should be disclosed.
- `FAIL`: must be fixed before submission.

## Current Verification

Backend:

```bash
cd backend
uv run --extra dev ruff check .
uv run --extra dev pytest
```

Recorded result after final cleanup: ruff passed; `131 passed`.

Frontend:

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Recorded result after final cleanup: typecheck passed; `35 passed`; production build passed.

Deployed checks:

- Backend `/health`: PASS, returned `{"status":"ok","service":"ttb-label-verification","version":"0.1.0"}`.
- Frontend: PASS, returned HTTP 200.
- Manual deployed single-label UX: PASS, recorded by project owner.
- Manual deployed batch UX: PASS, recorded by project owner.
- Manual accessibility/older-user usability pass: PASS, recorded by project owner.

## Requirement Checklist

| ID | Requirement | Source | Status | Evidence / Notes |
| --- | --- | --- | --- | --- |
| R-001 | Standalone proof-of-concept; no COLA integration. | Additional requirements | PASS | No COLA client, auth, persistence, or submission integration. |
| R-002 | No database; each request self-contained. | Playbook | PASS | No DB dependency, migrations, ORM, or persistent request store. |
| R-003 | Do not store uploads, extracted data, or application data beyond request lifetime. | Additional requirements | PASS | Backend processes in memory; browser export is user-initiated. |
| R-004 | Secrets only in environment variables. | Playbook | PASS | `.env*` ignored except `.env.example`; no tracked real keys found. |
| R-005 | Python 3.12, FastAPI, Pydantic v2, `uv`. | Playbook | PASS | Backend pins Python 3.12 and uses FastAPI/Pydantic v2/uv. |
| R-006 | React, TypeScript, Vite frontend. | Playbook | PASS | `frontend/package.json`; typecheck/tests/build pass. |
| R-007 | API/model fields use canonical snake_case names. | Playbook | PASS | Public application contract uses the seven canonical fields. |
| R-008 | `/health` endpoint exists. | Phase 0 | PASS | Local tests pass; deployed health check passed. |
| R-009 | First screen is the actual tool, not marketing. | Playbook | PASS | `App.tsx` renders backend status plus `PackageWorkflow`. |
| R-010 | UI usable by non-technical older user. | Stakeholder notes | PASS | Manual deployed UX/accessibility pass recorded by project owner. |
| R-011 | Single-label response includes `latency_ms`. | Playbook | PASS | `/verify` response model/tests; live timing recorded. |
| R-012 | Single-label target under 5 seconds. | Playbook | PASS | Deployed warm `latency_ms` p50 1501 ms, p95 2527 ms. |
| R-013 | Free-tier cold start may exceed target. | Deployment reality | QUESTIONABLE | Disclosed; frontend shows visible startup/loading status. |
| R-014 | Batch upload required. | Playbook/stakeholder notes | PASS | `/verify/batch` and frontend `Verify Batch`. |
| R-015 | Batch uses bounded concurrency. | Playbook | PASS | Backend uses `asyncio.Semaphore` with configured limit. |
| R-016 | Bad batch item does not fail whole batch. | Playbook | PASS | Per-item errors and tests. |
| R-017 | Batch summary includes `passed`, `needs_review`, `total`. | Playbook | PASS | `BatchSummary` model/tests. |
| R-018 | Pydantic models for required data shapes. | Phase 1 | PASS | `ApplicationData`, `ExtractedLabel`, `FieldResult`, `VerificationResult`, batch models. |
| R-019 | Domain comparison logic is pure. | Phase 1 | PASS | Domain import guard test passes. |
| R-020 | Fuzzy compare for brand/class/producer. | Playbook | PASS | RapidFuzz comparison and tests. |
| R-021 | Country synonym normalization. | Playbook | PASS | USA/United States tests. |
| R-022 | ABV numeric normalization. | Playbook | PASS | Percent/proof tests. |
| R-023 | Net contents unit normalization. | Playbook | PASS | mL/L/fl oz tests. |
| R-024 | Warning text exact and case-sensitive after whitespace collapse. | Playbook | PASS | Title-case and missing-colon tests fail as required. |
| R-025 | Warning failure returns extracted text. | Playbook | PASS | `found` and message include extracted warning on failure. |
| R-026 | Warning lead-in all caps and bold. | Additional requirements | QUESTIONABLE | Text exactness enforced; provider extracts best-effort bold evidence; reviewer can use Ctrl+B in warning fields; uncertainty remains documented. |
| R-027 | Verdict rule: any fail -> `NEEDS_REVIEW`; all pass -> `APPROVED`. | Playbook | PASS | Domain/API tests. |
| R-028 | Vision service behind explicit interface. | Phase 2 | PASS | `VisionService` protocol; fake/demo providers. |
| R-029 | Structured JSON extraction into `ExtractedLabel`. | Phase 2 | PASS | Strict schema and parser tests. |
| R-030 | Unknown/unclear fields are `null`, not guessed. | Phase 2 | PASS | Prompt and parser behavior. |
| R-031 | Prompt copies warning verbatim. | Phase 2 | PASS | Prompt/tests. |
| R-032 | Image preprocessing before model call. | Phase 2 | PASS | Downscale/re-encode tests. |
| R-033 | Imperfect images degrade gracefully. | Phase 6 | PASS | Prompt instructs partial extraction; safe error categories exist. |
| R-034 | `/verify` accepts multipart image plus application data. | Phase 3 | PASS | Endpoint/tests. |
| R-035 | Upload validation has readable 4xx errors. | Phase 3 | PASS | File type, size, empty image, missing data tests. |
| R-036 | Error envelope does not expose internals/secrets. | Project rules | PASS | Error handlers and tests. |
| R-037 | Logs include timing/failure categories, not secrets/raw images. | Phase 3 | PASS | Logging tests and safe metadata. |
| R-038 | Single-label frontend flow has upload, seven fields, loading, errors, result details. | Phase 4 | PASS | Frontend tests and manual deployed UX pass. |
| R-039 | Frontend payload keys mirror API names. | Project rules | PASS | `frontend/src/types/api.ts`; request construction. |
| R-040 | Batch frontend has progress/status, summary, drill-down. | Phase 5 | PASS | Tests and manual deployed UX pass. |
| R-041 | Public repo and README required. | Deliverables | PASS | README documents repo, setup, tools, assumptions, limitations. |
| R-042 | Deployed application URL required. | Deliverables | PASS | README documents live frontend and backend health URL. |
| R-043 | Provider code isolated for blocked outbound domains. | IT context | PASS | Provider code behind `VisionService`; tests use fakes. |
| R-044 | Tests do not require real model calls. | Phase 2/3 | PASS | Automated tests use fake/mock providers. |

## Disclosures

- Free-tier cold starts can delay the first deployed request. The frontend shows visible loading
  status while the backend wakes.
- Bold styling detection for `GOVERNMENT WARNING:` is best-effort. It can flag a clear not-bold
  lead-in, and reviewers can use Ctrl+B to mark bold evidence manually, but uncertain image/style
  evidence is not treated as definitive.
- This is a prototype review aid, not an official TTB approval system.
