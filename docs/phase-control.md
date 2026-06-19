# Phase Control System

Use this file before every PLAN, REVIEW, and EXECUTE prompt from Part 3 of `TTB_Label_Verification_Build_Playbook 1.pdf`.

Goal: each phase should be independently fixable without degrading earlier or later work.

## Global Rules

- The source-of-truth documents are `TTB_Label_Verification_Build_Playbook 1.pdf` and `Additional Project Requirements`.
- Keep phase changes small and owned by the current phase.
- Earlier phase public contracts are stable once their exit checks pass.
- Later phases may depend on earlier public contracts, but must not reach into earlier private implementation details.
- If a bug fix requires changing an earlier contract, update the contract docs, dependent module specs, and all affected tests in the same change.
- Run all regression checks for the current phase and every earlier completed phase before moving on.
- Prefer adapters at phase boundaries over rewrites across phase boundaries.

## Dependency Graph

```text
Phase 0 scaffold
  -> Phase 1 domain models + comparison
      -> Phase 2 vision service
          -> Phase 3 /verify endpoint
              -> Phase 4 single-label frontend
                  -> Phase 5 batch endpoint + UI
                      -> Phase 6 hardening
                          -> Phase 7 submission
```

Phase 2 may depend on Phase 1 models. Phase 3 depends on Phases 1 and 2. Phase 4 depends on the Phase 3 API contract. Phase 5 reuses the single-label orchestration without changing Phase 3 behavior.

## Stable Interfaces By Phase

### Phase 0 Stable Interfaces

- `GET /health`
- `.env.example` names and safe-placeholder strategy
- local run commands
- CORS configuration approach

Regression checks:

- Backend health test passes.
- Frontend typecheck passes.
- Frontend can display health response locally.

### Phase 1 Stable Interfaces

- `ApplicationData`
- `ExtractedLabel`
- `FieldResult`
- `VerificationResult`
- comparison entry point
- canonical field names

Regression checks:

- All comparison tests pass.
- Government warning exact-match tests pass.
- Domain package still has no FastAPI, file I/O, network, or provider imports.

### Phase 2 Stable Interfaces

- `VisionService` interface
- fake/mock vision service
- image preprocessing function
- provider failure categories

Regression checks:

- Vision tests pass without real provider calls.
- Fake service still works for Phase 3 API tests.
- Provider credentials are optional for tests.

### Phase 3 Stable Interfaces

- `POST /verify`
- error envelope behavior
- single-label `VerificationResult` response shape
- `latency_ms`

Regression checks:

- Endpoint tests pass with mocked vision.
- Bad file type and empty submission return clear 4xx responses.
- Warning failure includes extracted warning text.

### Phase 4 Stable Interfaces

- single-label API client
- form field mapping to canonical API fields
- result rendering contract

Regression checks:

- Frontend typecheck passes.
- Single-label view can submit to `/verify`.
- Readable loading, error, and result states remain intact.

### Phase 5 Stable Interfaces

- `POST /verify/batch`
- batch result shape: `items` plus `summary` with `passed`, `needs_review`, `total`
- item-level error isolation

Regression checks:

- Batch tests pass.
- Single-label `/verify` tests still pass.
- One bad item does not fail the whole batch.

### Phase 6 Stable Interfaces

- No new feature contracts unless explicitly approved in PLAN/REVIEW.
- Measurement checklist and accessibility fixes.

Regression checks:

- Full checklist from the playbook passes.
- Live single-label latency is under 5 seconds.
- Prior backend and frontend tests still pass.

### Phase 7 Stable Interfaces

- README submission content
- deployed URL
- secret audit procedure

Regression checks:

- Secret audit clean.
- README includes setup, run, deployed URL, approach, tools, assumptions, and limitations.
- Live single-label and batch flows work end-to-end.

## Phase Repair Rules

When fixing a completed phase:

1. Start with the module spec for that phase.
2. Identify downstream phases that depend on its stable interfaces.
3. Preserve the stable interface when possible.
4. If preservation is impossible, update all downstream docs and tests in the same change.
5. Run regression checks for the fixed phase and every downstream phase already implemented.

Examples:

- Fixing Phase 1 comparison logic must not change `/verify` response shape.
- Fixing Phase 2 provider parsing must not require Phase 3 tests to call a real model.
- Fixing Phase 4 UI copy must not rename API fields.
- Fixing Phase 5 batch concurrency must not change single-label `/verify` behavior.

## Common Drift Risks

- Renaming `abv` to `alcohol_content` or `producer` to `producer_name_address`.
- Treating the government warning as fuzzy.
- Claiming warning styling compliance without detecting styling.
- Letting provider output dictate API/model shape.
- Adding a database or storing uploads for convenience.
- Integrating with COLA.
- Letting batch failures change single-label semantics.
- Building frontend complexity before the API contract is stable.

## Phase Risk Review

### Phase 0 Risks

- Deploy config may be skipped because the app works locally. The playbook says deploy early.
- CORS may be hardcoded instead of environment-driven.
- Agents may add `/verify` stubs that later need deletion. Avoid feature stubs unless required for deploy.

### Phase 1 Risks

- Agents may rename fields to friendlier names. Keep API/model names `abv` and `producer`.
- Agents may make fuzzy matching too broad and accidentally pass warning variants. Warning is exact, case-sensitive after whitespace collapse only.
- Agents may mix warning styling into pure comparison. Keep Phase 1 text-only unless an approved interface adds style evidence.
- Agents may put comparison code in API modules. Keep it pure in `backend/app/domain/`.

### Phase 2 Risks

- Agents may parse free-form model text instead of structured JSON. The playbook requires structured output.
- Agents may throw on blurry/non-label images. Prefer partial data or safe categorized failure.
- Agents may write tests that require real API keys. Tests must use fakes/mocks.
- Agents may ignore the bold/all-caps warning cue. Preserve verbatim warning text first; style evidence is optional metadata if planned.

### Phase 3 Risks

- Agents may expose provider errors or stack traces. Use the error envelope.
- Agents may forget `latency_ms`. It is required on every single-label response.
- Agents may couple the route directly to a real provider. Use dependency injection.

### Phase 4 Risks

- Agents may build a landing page instead of the actual tool. The primary screen must be the verification flow.
- Agents may rename request fields in TypeScript. UI labels can be friendly; payload keys cannot drift.
- Agents may hide failure details. Failing fields need expected-vs-found values.

### Phase 5 Risks

- Agents may process batch items serially or with unbounded concurrency. Use bounded async concurrency.
- Agents may let one item error fail the whole batch. Use per-item isolation.
- Agents may alter `/verify` to support batch. Batch should wrap/reuse single-label orchestration.

### Phase 6 Risks

- Agents may add new features during hardening. Phase 6 is tuning, validation, performance, and accessibility only.
- Agents may optimize by removing explainability. Results must remain clear and reviewable.

### Phase 7 Risks

- Agents may write a README that omits limitations or assumptions. The additional requirements ask for approach, tools, assumptions, and tradeoffs.
- Agents may run only local checks. The playbook requires a deployed URL and live end-to-end verification.
- Agents may imply full visual compliance while only checking text. Document warning-style support honestly.
