# Project Documentation

This document briefly explains the approach, tools, and assumptions behind the TTB Label
Verification proof of concept. Setup and run instructions are in the [README](README.md).

## Approach

The application separates uncertain AI extraction from deterministic comparison:

1. A reviewer uploads a label image and enters the corresponding application data.
2. The backend validates and preprocesses the image in memory.
3. A vision provider extracts seven canonical label fields and best-effort warning-style evidence.
4. Pure domain functions compare the extracted values with the application values.
5. The API returns an overall verdict and a result for every field.
6. The reviewer can edit extracted data or formatting metadata and recompare without paying for
   another model call.

This keeps the model responsible for reading the image, while explicit application code owns the
compliance rules and verdict. It also makes comparison behavior fast, testable, and reproducible.

## Architecture

### Backend

The FastAPI backend follows clear boundaries:

- `app/api/` parses HTTP requests and maps safe responses and errors.
- `app/use_cases/` coordinates extraction, comparison, timing, and batch workflows.
- `app/domain/` contains typed models, normalization, and pure comparison rules.
- `app/services/` contains image preprocessing and vision-provider implementations.

The `VisionService` interface isolates external model access. Production can use OpenAI, while the
demo and fake implementations support local use and deterministic tests without network calls.

### Frontend

The React frontend is organized around the package-review workflow:

- `src/api/` owns backend requests and user-safe network errors.
- `src/features/package-workflow/` owns uploads, application cards, validation, verification,
  filtering, and reviewer edits.
- `src/types/api.ts` mirrors the backend's canonical snake_case contracts.
- `src/styles/` keeps presentation separate from workflow behavior.

The warning rich-text interaction is isolated in `RichWarningTextarea.tsx`. It records review
metadata for the bold `GOVERNMENT WARNING:` lead-in while preserving the canonical warning as plain
text.

## Comparison strategy

| Field | Rule | Reasoning |
| --- | --- | --- |
| `brand_name` | Normalized fuzzy match | Accepts harmless casing, spacing, and punctuation differences. |
| `class_type` | Normalized fuzzy match | Handles minor OCR and presentation differences. |
| `producer` | Normalized fuzzy match | Allows formatting variation in names and addresses. |
| `abv` | Parsed numeric comparison | Compares the alcohol value rather than display syntax. |
| `net_contents` | Normalize units to mL | Treats equivalent metric and US customary values consistently. |
| `country_of_origin` | Synonym normalization | Treats values such as USA and United States as equivalent. |
| `government_warning` | Exact, case-sensitive match to the canonical statement after whitespace collapse | Preserves the stricter statutory wording requirement. |

All field results are explicit `PASS` or `FAIL` values. Every pass yields `APPROVED`; any failure
yields `NEEDS_REVIEW`. A warning mismatch includes the extracted warning so the reviewer can see the
discrepancy.

### Warning boldness

The vision request also asks whether the `GOVERNMENT WARNING:` lead-in appears bold:

- `true`: the text may pass and the result records that bold styling was detected.
- `false`: the warning requires review.
- `null`: the text may be correct, but boldness could not be determined, so the warning requires
  review.

Image-based font-weight detection is intentionally treated as weak evidence. Blur, glare,
compression, small text, and unusual fonts can make it unreliable. A human can review and update
the style metadata in the interface, then call `/compare` without repeating AI extraction.

## Batch design

Each `/verify/batch` request accepts at most 25 labels. Within that request, the backend uses bounded
concurrency and isolates errors per item so one unreadable image does not fail the entire group.

To support stakeholder workloads of 200–300 labels without a background-job system, the frontend:

1. validates the full workload;
2. sends ordered groups of up to 25;
3. shows the active label range;
4. maps each response to the original application card; and
5. continues with later groups if one group-level request fails.

The 25-item limit is therefore a request-safety boundary, not a user workload limit. Sequential
groups control memory, model concurrency, and hosting-request risk. A production system needing
pause/resume or recovery across browser sessions should use durable queued jobs instead.

## Tools used

### Application

- Python 3.12
- FastAPI and Uvicorn
- Pydantic v2 and pydantic-settings
- OpenAI Python SDK behind a provider interface
- Pillow for in-memory image validation and preprocessing
- RapidFuzz for normalized text similarity
- React 18, TypeScript, and Vite

### Development and delivery

- `uv` for Python dependency management
- pytest and pytest-asyncio for backend tests
- Ruff for Python linting
- Vitest and jsdom for frontend tests
- TypeScript compiler for static checks
- Render configuration for the backend
- Vercel configuration for the frontend

Tests never require a real model call.

## Error handling and privacy

- Upload type, size, image decoding, field completeness, and batch size are validated.
- Batch failures are isolated to the affected item or group where possible.
- Provider timeouts and internal failures are converted to stable, user-safe error envelopes.
- Stack traces, provider details, credentials, local paths, and raw image data are not returned.
- Images, extracted values, and application values stay request-scoped and are not persisted.
- Provider credentials are backend-only environment variables.

## Performance approach

The provider timeout is capped at 4.5 seconds to stay within the stakeholder's approximate
five-second single-label target. The submitted deployment's recorded warm results were:

| Metric | Result |
| --- | ---: |
| Backend `latency_ms` p50 | 1,501 ms |
| Backend `latency_ms` p95 | 2,527 ms |
| Browser-to-API round trip p50 | 1,676 ms |
| Browser-to-API round trip p95 | 2,694 ms |

Free-tier hosting can add a cold start before these warm timings apply. The frontend visibly reports
backend startup/loading rather than appearing frozen. Full measurement notes are in
[docs/deployed-timing-results.md](docs/deployed-timing-results.md).

## Assumptions

- This is a standalone review aid, not an official approval or enforcement system.
- The seven fields in the assignment are the complete public application-data contract.
- Uploaded images are JPG, PNG, or WEBP and contain enough legible text for useful extraction.
- Harmless presentation differences are acceptable for general identity fields, but government
  warning wording remains exact after whitespace collapse.
- AI confidence alone is not enough to approve uncertain warning formatting.
- Reviewers remain responsible for ambiguous images and regulatory judgment.
- The prototype does not need COLA integration, authentication, a database, document retention, or
  federal production authorization controls.
- The deployed environment can make outbound calls to the configured vision provider.

## Trade-offs and limitations

- A general vision model reduced implementation time and handles varied layouts, but extraction is
  nondeterministic and depends on image quality.
- Fuzzy matching improves tolerance for OCR and formatting differences, but may need field-specific
  threshold tuning with real operational data.
- Stateless request processing protects privacy and keeps the prototype simple, but provides no
  saved work, audit history, or resumable jobs.
- Sequential frontend batching supports large workloads with the current backend, but closing the
  browser loses in-progress work.
- Warning boldness cannot be guaranteed from pixels; uncertainty correctly routes to human review.

## Further references

- [API contracts](docs/interfaces/api-contracts.md)
- [Error contracts](docs/interfaces/error-contracts.md)
- [Technical requirements audit](docs/technical-requirements-audit.md)
- [Deployed timing results](docs/deployed-timing-results.md)
- [Backend guide](backend/README.md)
- [Frontend guide](frontend/README.md)
