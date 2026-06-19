# TTB Label Verification High-Level Overview

This overview is derived from `TTB_Label_Verification_Build_Playbook 1.pdf` and `Additional Project Requirements`. Those two source documents are authoritative if wording differs.

## Purpose

This project is a proof-of-concept web application that verifies whether an alcohol beverage label image matches structured application data against TTB-style requirements.

The goal is not just to extract text from a label. The goal is to:

- accept a label image and application metadata,
- extract the required fields from the image,
- compare extracted values against the submitted application data,
- return field-by-field PASS/FAIL results,
- produce an overall verdict of `APPROVED` or `NEEDS_REVIEW`,
- support both single-label and batch verification,
- stay usable for a non-technical older user,
- and keep single-label verification under 5 seconds.

## Project Objectives

The app must satisfy these core objectives from the brief:

- Working deployed application with a public URL
- Source repository with setup and run instructions
- Clear documentation of approach, assumptions, and tools used
- Correct handling of common TTB-required label fields
- Batch upload support
- Strong UX and readable error handling
- Safe secret handling using environment variables only

## What The App Needs To Verify

Primary label/application fields:

- Brand name
- Class/type designation
- Alcohol content
- Net contents
- Name/address of bottler or producer
- Country of origin
- Government health warning statement

The government warning is the strictest rule:

- it must be treated as an exact, case-sensitive match,
- but the system should still surface the extracted text when it fails so a human can review OCR or model mistakes.

## Recommended Product Shape

Build a lightweight, stateless web app with:

- a frontend for upload, data entry, results, and batch summary,
- a FastAPI backend for orchestration and validation,
- a vision extraction service that returns structured JSON,
- a comparison engine that applies field-specific matching rules,
- no database for the first version.
- no COLA integration for the prototype,
- no persisted uploads or extracted/application data for the MVP.

This keeps the build focused on the real grading criteria:

- correctness,
- latency,
- usability,
- and clean engineering decisions.

## High-Level Architecture

### Frontend

Responsibilities:

- Single-label upload flow
- Seven clearly labeled form fields
- Large, high-contrast controls for older users
- Results screen with per-field PASS/FAIL
- Overall verdict display
- Batch upload screen with summary counts and drill-down
- Readable loading and error states

### Backend

Responsibilities:

- Accept multipart form data
- Validate required fields and file type/size
- Preprocess images before model use
- Call the vision extraction service
- Compare extracted data to application data
- Return structured verification results with latency

### Vision Service

Responsibilities:

- Convert image input into structured label data
- Return nullable fields when data is unclear
- Preserve the government warning verbatim when possible
- Fail gracefully on non-label, blurry, angled, or glare-heavy images

### Comparison Engine

Responsibilities:

- Apply one comparison strategy per field
- Produce explainable expected-vs-found results
- Generate the overall verdict

## Comparison Rules

These rules are the heart of correctness:

- `brand_name`, `class_type`, `producer`: fuzzy match after normalization
- `country_of_origin`: normalize with synonym mapping before comparison
- `abv`: numeric extraction and normalized comparison
- `net_contents`: unit normalization to a canonical value
- `government_warning`: exact, case-sensitive comparison

Verdict rule:

- any field FAIL => `NEEDS_REVIEW`
- all fields PASS => `APPROVED`

## Main Technical Challenges

### 1. Exactness vs Imperfect OCR

The government warning must be exact, but label images may be noisy. The system cannot hide ambiguity. It must expose the extracted warning text whenever the comparison fails.

### 2. Structured Extraction Reliability

The vision layer must return predictable structured JSON rather than free-form text. If parsing is brittle, the whole app becomes unstable.

### 3. Latency Under 5 Seconds

The app needs fast preprocessing, a controlled prompt, and minimal backend overhead. Batch mode also needs bounded concurrency so performance does not collapse under multiple labels.

### 4. Older, Non-Technical User UX

This is not just a developer demo. The interface has to be obvious without instructions, especially for single-label verification.

### 5. Robust Error Handling

Bad uploads, empty forms, non-label images, partial extraction, and model timeouts should all produce readable responses instead of technical failures.

### 6. Deployment and Secret Safety

The project is graded partly on real-world execution. Secrets must never enter source control, and the deployed system must work end-to-end, not just locally.

### 7. Standalone Prototype Boundary

The additional requirements explicitly frame this as a standalone proof-of-concept, not a COLA integration. Keep provider dependencies replaceable because target networks may block outbound model endpoints.

## Suggested Build Strategy

The playbook's phased order is the right approach because it reduces risk early:

### Phase 0: Scaffold and Deploy Early

Ship a minimal backend and frontend with a working health check before building real logic.

Why it matters:

- proves the deployment path,
- reduces end-of-project deployment surprises,
- creates a live URL early.

### Phase 1: Build Comparison Logic First

Implement the models and all field comparison rules without any AI dependency.

Why it matters:

- this is the most testable and gradeable core,
- it avoids paying for model calls while validating business logic,
- it locks down expected behavior early.

### Phase 2: Add Vision Extraction

Introduce the image-to-structured-data layer with mockable boundaries.

Why it matters:

- keeps model-related complexity isolated,
- allows later endpoint tests to run without real API calls.

### Phase 3: Wire `/verify`

Connect validation, preprocessing, extraction, comparison, and response shaping into one usable endpoint.

### Phase 4: Build Single-Label UX

Create the simplest high-confidence flow for one label at a time.

### Phase 5: Add Batch Processing

Support multiple items concurrently with per-item isolation and summary reporting.

### Phase 6: Harden Performance, Validation, and Accessibility

Tune for speed, graceful degradation, and usability.

### Phase 7: Final Audit and Submission

Verify secrets, documentation, deployment, and demo readiness.

## Success Criteria

The project should be considered successful when:

- a user can upload one label and receive a clear result quickly,
- batch upload works and isolates failures per item,
- the warning statement logic is demonstrably strict,
- comparison behavior matches the documented rules,
- invalid inputs return clear 4xx-style feedback,
- the app is live and usable,
- the repository is clean, organized, and free of secrets.

## Recommended Testing Strategy

### Unit Tests

Target:

- normalization logic
- fuzzy matching behavior
- ABV comparisons
- net contents normalization
- country synonym mapping
- government warning exact-match behavior
- verdict generation

### Service Tests

Target:

- vision service structured parsing
- graceful handling of partial or malformed model output
- image preprocessing behavior

### API Tests

Target:

- valid `/verify` submission
- bad file type
- empty submission
- clear error responses
- presence of per-field results, expected/found values, overall verdict, and latency

### Batch Tests

Target:

- multiple item handling
- summary counts
- one bad item not failing the whole batch
- bounded concurrency behavior

### Manual End-to-End Tests

Target:

- valid label pass
- intentional mismatch fail
- imperfect image handling
- warning exact-match edge cases
- older-user readability and clarity

## Recommended Deliverables

- Deployed application URL
- Source repository
- README with setup, run, deploy, assumptions, limitations
- Sample labels or test fixtures
- Short architecture explanation
- Evidence of tests and verification

## Risks To Watch Closely

- Overbuilding before deployment works
- Letting vision output shape business logic instead of typed models
- Treating the government warning like other fuzzy fields
- Adding too much frontend complexity before the API contract is stable
- Ignoring latency until the end
- Committing `.env` or API keys

## Battle Plan Summary

If we keep this simple, the right execution path is:

1. Deploy a skeleton first.
2. Lock down typed models and comparison rules with tests.
3. Isolate vision extraction behind a clean service boundary.
4. Build `/verify` before polishing the UI.
5. Make single-label flow excellent before expanding batch.
6. Use Phase 6 for speed, reliability, and accessibility hardening.
7. End with a strict deployment, README, and secret audit.

## Bottom Line

This project is best treated as a verification engine with a thin UI, not as a broad AI app. The winning version will be the one that is:

- structurally clean,
- explainable,
- fast enough,
- easy to use,
- and clearly trustworthy when the label image is imperfect.
