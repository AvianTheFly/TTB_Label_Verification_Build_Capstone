# TTB Label Verification

AI-assisted proof-of-concept for checking alcohol beverage label images against structured
application data. The app lets a reviewer upload application packages made of JSON files and label
images, review extracted label text, recheck edited extracted text through the backend comparison
engine, and download reviewed-results JSON.

## Overview

This project was built from the source requirements in:

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

The prototype is intentionally standalone. It does not integrate with COLA, does not use a
database, and does not persist uploaded images, extracted label data, or application data beyond
the lifetime of each request.

Submission status:

- Public repository URL: Pending. This checkout has no configured Git remote, so the public
  repository URL could not be verified during the Phase 7 audit.
- Live frontend URL: Pending. No deployed frontend URL was available in this checkout.
- Live backend URL: Pending. No deployed backend URL was available in this checkout.
- Live deployed verification: Pending until deployed frontend/backend URLs and sample images are
  available.
- Real OpenAI extraction tested on live deployment: No. The architecture supports real provider
  extraction, but this final audit could only verify the local fake/mock-provider path.

## Live Demo

Live demo verification is pending because deployed URLs were not available during the final audit.
Before submission, update this section with:

- Frontend: deployed frontend URL
- Backend health: deployed backend `/health` URL
- Verification status: package upload, single-package check, multi-package check, edited extracted
  text recheck, export, warning exact-match, imperfect-image, and browser CORS results

Do not mark these as passed until they have actually been tested.

## Features

- Package upload workflow with one JSON file and one label image per application.
- JSON-driven application fields that are shown read-only to the reviewer.
- Automatic single-package and multi-package verification. The frontend calls `/verify` for one
  valid package and `/verify/batch` for multiple valid packages.
- Editable extracted fields with backend-owned recomparison through `/compare`.
- Reviewed-results JSON download. This is a local browser download, not server-side persistence or
  external submission.
- Batch verification with bounded backend concurrency and per-item error isolation.
- Field-level expected-vs-found results.
- Overall verdict rule: any failed field returns `NEEDS_REVIEW`; all fields passing returns
  `APPROVED`.
- Required `latency_ms` on every single-label result and each successful batch item.
- Canonical TTB field names across backend API models and frontend TypeScript types:
  `brand_name`, `class_type`, `abv`, `net_contents`, `producer`, `country_of_origin`,
  `government_warning`.
- Exact government warning text comparison after whitespace collapse. The comparison remains
  case-sensitive.
- Fake/mock vision path for deterministic local tests.
- Real OpenAI vision-service adapter behind an explicit `VisionService` interface.
- Plain-English API error envelope and readable frontend errors.

## Architecture

The system has a Vite/React frontend and a stateless FastAPI backend.

```text
Frontend
  - Application package upload
  - Filename-based JSON/image pairing
  - Overview and detail views
  - Read-only application fields
  - Editable extracted fields
  - Reviewed-results JSON download
  - Calls backend APIs; does not implement comparison rules

Backend
  - FastAPI routes: /health, /verify, /verify/batch, /compare
  - Upload validation and error shaping
  - Image preprocessing
  - VisionService extraction boundary
  - Pure comparison engine
  - No database or persisted request data
```

Provider-specific code is isolated behind `VisionService` because the target environment may block
outbound model-provider domains. Tests use fake/mocked extraction and do not require real model
calls.

## API Overview

`GET /health`

Returns service status:

```json
{
  "status": "ok",
  "service": "ttb-label-verification",
  "version": "0.1.0"
}
```

`POST /verify`

- Request: `multipart/form-data`
- Parts:
  - `image`: JPG, PNG, or WEBP label image
  - `application_data`: JSON string containing the seven canonical fields
  - `use_real_vision`: optional boolean string
  - `openai_api_key` and `openai_model`: optional temporary real-vision settings used only for
    that request when `use_real_vision=true`
- Response: `VerificationResult` with `results`, `overall_verdict`, and `latency_ms`

`POST /verify/batch`

- Request: `multipart/form-data`
- Parts:
  - repeated `images`
  - repeated `application_data`
  - `use_real_vision`: optional boolean string
  - `openai_api_key` and `openai_model`: optional temporary real-vision settings used only for
    that batch request when `use_real_vision=true`
- Response: batch `items` plus `summary` with `passed`, `needs_review`, and `total`

`POST /compare`

- Request: `application/json`
- Body:
  - `application_data`: JSON object containing the seven canonical application fields
  - `extracted_data`: JSON object containing the seven canonical extracted fields with string or
    `null` values
- Response: `VerificationResult`
- Purpose: recompute backend comparison after a reviewer edits extracted text. This endpoint does
  not accept images and does not call the vision service.

Public API errors use:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Readable message safe for the UI.",
    "details": {}
  }
}
```

## Setup

Prerequisites:

- Python 3.12
- `uv`
- Node.js 22 or compatible modern Node runtime
- npm

Create a local environment file from the placeholder-only example:

```bash
cp .env.example .env
```

Install backend dependencies:

```bash
cd backend
uv sync
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

## Environment Variables

API keys and secrets belong only in local `.env` files or deployment-provider environment
settings. Do not commit real keys and do not add real keys to documentation.

Backend variables:

```text
APP_ENV=local
APP_NAME=TTB Label Verification
APP_VERSION=0.1.0
SERVICE_SLUG=ttb-label-verification
API_HOST=127.0.0.1
API_PORT=8000
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_UPLOAD_MB=10
VISION_PROVIDER=fake
VISION_MODEL=
OPENAI_API_KEY=
```

Frontend variable:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

For real provider extraction, either configure the backend with `VISION_PROVIDER=openai`,
`VISION_MODEL`, and `OPENAI_API_KEY` in the deployment provider settings, or use the frontend's
temporary real-vision key entry for a single browser session. A key entered in the frontend is kept
only in page memory and sent to the backend only in verification request bodies; it is not stored in
local storage, committed to git, or logged by the app.

## Run Locally

Backend:

```bash
cd backend
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev
```

Open the frontend at `http://localhost:5173`.

## Testing

Backend lint:

```bash
cd backend
.venv/bin/python -m ruff check app
```

Backend tests:

```bash
cd backend
.venv/bin/python -m pytest
```

Frontend typecheck:

```bash
cd frontend
npm run typecheck
```

Frontend tests:

```bash
cd frontend
npm test
```

Frontend production build:

```bash
cd frontend
npm run build
```

Current local regression result:

- Backend ruff: passed
- Backend pytest: passed, 77 tests
- Frontend typecheck: passed
- Frontend tests: passed, 13 tests
- Frontend build: passed

## Deployment

One suitable free-tier path is Render for both services.

Backend web service:

- Root directory: `backend`
- Runtime: Python 3
- Build command: `pip install uv && uv sync`
- Start command: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Required environment:
  - `APP_ENV=production`
  - `APP_NAME=TTB Label Verification`
  - `APP_VERSION=0.1.0`
  - `SERVICE_SLUG=ttb-label-verification`
  - `BACKEND_CORS_ORIGINS` with local origins and the deployed frontend origin
  - `MAX_UPLOAD_MB=10`
  - `VISION_PROVIDER=fake` for demo/fake extraction, or `VISION_PROVIDER=openai` for real
    extraction
  - `VISION_MODEL` as appropriate for the selected provider
  - `OPENAI_API_KEY` only in provider settings when using real OpenAI extraction

Frontend static site:

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Required environment:
  - `VITE_API_BASE_URL` set to the deployed backend origin

After changing `VITE_API_BASE_URL`, rebuild and redeploy the frontend. After changing
`BACKEND_CORS_ORIGINS`, redeploy the backend.

Deployment log checks before submission:

- Backend logs show clean startup.
- Backend logs show no missing environment variables, CORS failures, or provider failures.
- Frontend build logs show `VITE_API_BASE_URL` was configured for the deployed backend.
- Browser devtools console on the live frontend shows no CORS errors while calling the backend.

## How To Use

Application package workflow:

1. Open the frontend.
2. Drag files into the upload area or choose files manually.
3. Include one application JSON file and one label image for each application.
4. The JSON `image_filename` must exactly match the uploaded image filename.
5. Fix any readable package validation errors shown in the overview.
6. Select `Check Applications`.
7. Open an application from the overview to inspect the large image, read-only application values,
   editable extracted values, and backend field results.
8. If extracted text needs correction, edit the extracted values and select `Recheck Extracted Text`.
9. Select `Download Reviewed Results JSON` to save the reviewed results locally.

The app does not submit results to TTB, COLA, or any external system. It does not save application
packages, images, extracted text, or reviewed results on the server.

## Application Package JSON

Each uploaded application JSON file must contain `image_filename` and `application_data`.
`application_data` must contain exactly the seven canonical fields and no extra fields.

```json
{
  "image_filename": "evergreen-amber-bourbon.png",
  "application_data": {
    "brand_name": "EVERGREEN AMBER BOURBON",
    "class_type": "Kentucky Straight Bourbon Whiskey",
    "abv": "45% Alc./Vol. (90 Proof)",
    "net_contents": "750 mL",
    "producer": "Evergreen Spirits LLC, Louisville, KY",
    "country_of_origin": "United States",
    "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  }
}
```

Package validation checks invalid JSON, missing `image_filename`, missing `application_data`,
missing canonical fields, extra non-canonical fields, duplicate `image_filename`, JSON with no
matching image, image with no matching JSON, and unsupported image type.

## Reviewed Results Export

`Download Reviewed Results JSON` creates a browser download with this shape:

```json
{
  "schema_version": "application-package-review-v1",
  "generated_at": "2026-06-20T00:00:00.000Z",
  "summary": {
    "passed": 1,
    "needs_review": 0,
    "pending": 1,
    "total": 2
  },
  "applications": [
    {
      "application_id": "application-1",
      "json_filename": "evergreen-amber-bourbon.application.json",
      "image_filename": "evergreen-amber-bourbon.png",
      "status": "Passed",
      "application_data": {
        "brand_name": "EVERGREEN AMBER BOURBON",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750 mL",
        "producer": "Evergreen Spirits LLC, Louisville, KY",
        "country_of_origin": "United States",
        "government_warning": "GOVERNMENT WARNING: ..."
      },
      "reviewed_extracted_data": {
        "brand_name": "Evergreen Amber Bourbon",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750 mL",
        "producer": "Evergreen Spirits LLC, Louisville, KY",
        "country_of_origin": "United States",
        "government_warning": "GOVERNMENT WARNING: ..."
      },
      "field_results": [],
      "overall_verdict": "APPROVED",
      "errors": []
    }
  ]
}
```

Pending applications are represented honestly with `status` of `Pending Check`,
`reviewed_extracted_data` of `null`, empty `field_results`, and `overall_verdict` of `null`.
Exports do not include raw image data, local absolute paths, API keys, provider internals, or stack
traces.

## Demo Data And Sample Label Guidance

Synthetic package workflow demo files live in:

- `demo-data/inputs/`
- `demo-data/outputs/reviewed-results.example.json`

These are placeholder workflow fixtures, not real labels and not official TTB records.

Keep two or three sample label images available for manual and live verification:

- A clear valid label.
- A label with an intentional mismatch or warning-text issue.
- An imperfect label image, such as glare, blur, angle, or partial obstruction.

Do not commit copyrighted, sensitive, or private images unless you have permission. AI-generated
sample labels are acceptable if documented as generated test assets.

Use the standard government warning text when testing warning exactness:

```text
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

## Approach

The build is phase-oriented:

- Phase 0: scaffold, secrets, health endpoint, deploy path
- Phase 1: pure Pydantic models and comparison engine
- Phase 2: mockable vision-service boundary
- Phase 3: `/verify` endpoint
- Phase 4: single-label frontend
- Phase 5: batch endpoint and UI
- Phase 6: robustness, performance, and accessibility
- Phase 7: final README, audit, and deployment verification
- Phase 8A: application package workflow contract and demo data
- Phase 8B: backend-owned `/compare` endpoint
- Phase 8C: package-based frontend workflow
- Phase 8D: reviewed-results export, cleanup, docs, and regression

The comparison engine is pure and tested independently from FastAPI, file I/O, and provider calls.
The API layer stays thin and handles validation, orchestration, timing, and safe error shaping.
The frontend mirrors API field names exactly while using friendly labels for reviewers. It displays
backend comparison results but does not duplicate comparison tolerances or verdict logic.

## Assumptions And Limitations

Assumptions:

- The prototype is a standalone review aid, not an official TTB approval system.
- Every request is self-contained.
- Reviewers may manually inspect found values when the model or OCR is uncertain.
- Batch size is bounded to protect provider latency, cost, and rate limits.

Limitations:

- Live deployed verification was not completed in this checkout because live URLs and sample images
  were not available.
- Real OpenAI extraction was not verified live during this audit. The app architecture supports
  real provider extraction, but final local checks used fake/mock provider paths.
- Government warning text comparison is implemented, but warning lead-in bold styling detection is
  not claimed.
- Imperfect-image behavior is covered by tests and provider prompts, but real deployed
  imperfect-image performance remains pending until sample images and deployment are available.
- Free-tier hosting may introduce cold-start latency that is separate from the app's
  request-scoped `latency_ms`.

## Security And Privacy

- Uploaded images are processed for the current request only.
- Extracted label data and application data are not persisted by the app.
- No database is used for the MVP.
- Deployment-owned API keys and secrets belong only in environment variables or provider settings.
- If a reviewer uses the temporary frontend OpenAI key field, the key is kept only in browser memory
  for the current page session and in the HTTPS request body for verification. Refreshing the page
  clears it.
- `.env`, `backend/.env`, and `frontend/.env` are ignored and were not tracked during the final
  audit.
- Public API errors must not expose stack traces, provider internals, API keys, local paths, raw
  images, or unhandled exceptions.
- Source requirement documents and PDFs should not be edited during final submission work.

## Performance And Accessibility

Performance:

- Single-label responses include `latency_ms`.
- Target single-label latency is under 5 seconds for reasonable label images.
- Image preprocessing downscales and re-encodes before provider calls.
- Batch verification uses bounded concurrency with a default limit of 3.
- Local tests passed; live latency measurement remains pending until deployment is available.

Accessibility:

- The first screen is the verification tool, not a marketing page.
- Controls use large, clear labels and obvious actions.
- The UI includes loading, error, and result states.
- Results emphasize verdict and field-level PASS/FAIL states.
- Phase 6 targets included readable font sizes, high contrast, labels, and touch-friendly controls.

## Future Work

- Add final deployed URLs and public repository URL before instructor submission.
- Run deployed `/health`, single-label, batch, warning exact-match, imperfect-image, and browser CORS
  verification.
- Verify real OpenAI extraction live with approved sample images and provider environment settings.
- Record actual deployed `latency_ms` values.
- Add optional warning-style evidence only after an explicit contract update and tests.
- Add more sample labels for beverage classes and degraded image conditions.

## Instructor Checklist

- Public repo: pending, no git remote configured in this checkout.
- Live frontend URL: pending.
- Live backend URL: pending.
- Setup instructions: included.
- Run instructions: included.
- Test commands: included.
- Deployment instructions: included.
- Approach and tools: included.
- Assumptions and limitations: included.
- Security and privacy notes: included.
- No committed secrets found by Phase 7 scan.
- No tracked `.env`, `backend/.env`, or `frontend/.env` found.
- No tracked generated junk found.
- Source requirement documents were not edited in Phase 7.
