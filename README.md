# TTB Label Verification

Free-tier cloud link: https://fed-stack-capstone.vercel.app/

AI-assisted proof-of-concept for checking alcohol beverage label images against user-entered
application data. The app lets a reviewer select label images, enter the seven required
application fields, run verification, inspect expected-vs-found results, optionally correct
extracted text, and download reviewed results.

## Source Requirements

This project follows:

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

The prototype is standalone. It does not integrate with COLA, does not use a database, and does not
persist uploaded images, extracted label data, or application data beyond the lifetime of each
request.

## Current Status

- Public repository: https://github.com/AvianTheFly/TTB_Label_Verification_Build_Capstone
- Live frontend: https://fed-stack-capstone.vercel.app/
- Live backend verification with real OpenAI extraction: pending until `OPENAI_API_KEY` is available.
- Measured deployed p50/p95 latency: pending until real-provider live verification is run.

## Tech Stack

- Backend: Python 3.12, FastAPI, Pydantic v2, Pillow, OpenAI Python SDK, `uv`
- Frontend: React, TypeScript, Vite, npm
- Default OpenAI vision model target: `gpt-4.1-mini`
- Model verification status: public OpenAI model documentation was reviewed on 2026-07-13; final
  account-backed model availability and live extraction verification are pending until an
  `OPENAI_API_KEY` is available.

## Features

- Single-label image verification with seven user-entered application fields.
- Batch image workflow with one application row per uploaded image.
- Image preview confirmation before images are added to the workflow.
- Backend-owned comparison and verdict logic.
- Editable extracted fields with backend recomparison through `/compare`.
- Reviewed-results JSON download from the browser.
- Bounded backend batch concurrency and item-level error isolation.
- Required `latency_ms` on every single-label result and each successful batch item.
- Exact, case-sensitive government warning comparison after whitespace collapse.
- Extracted government warning text is surfaced on warning failure for human review.
- Fake/demo vision paths for deterministic local testing.
- Real OpenAI vision-service adapter behind an explicit `VisionService` interface.

Canonical API fields:

```text
brand_name
class_type
abv
net_contents
producer
country_of_origin
government_warning
```

## Architecture

```text
Frontend
  - Image upload and preview confirmation
  - One application row per selected image
  - Seven-field application data entry
  - Results and reviewer corrections
  - Calls backend APIs; does not implement comparison rules

Backend
  - FastAPI routes: /health, /verify, /verify/batch, /compare
  - Upload validation and error shaping
  - Image preprocessing
  - VisionService extraction boundary
  - Pure comparison engine
  - Stateless request handling
```

Provider-specific code is isolated behind `VisionService`. Tests use fake or mocked extraction and
do not require real model calls.

## Environment Variables

Secrets belong only in local `.env` files or deployment-provider environment settings. Do not
commit real keys and do not add real keys to documentation.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `APP_ENV` | No | `local` | Names the runtime environment. |
| `APP_NAME` | No | `TTB Label Verification` | FastAPI application title. |
| `APP_VERSION` | No | `0.1.0` | Public service version returned by `/health`. |
| `SERVICE_SLUG` | No | `ttb-label-verification` | Public service slug returned by `/health`. |
| `API_HOST` | No | `127.0.0.1` | Local backend host used by setup/run docs. |
| `API_PORT` | No | `8000` | Local backend port used by setup/run docs. |
| `BACKEND_CORS_ORIGINS` | Yes in deploy | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated frontend origins allowed to call the backend. |
| `MAX_UPLOAD_MB` | No | `10` | Maximum uploaded image size per file. |
| `MAX_BATCH_ITEMS` | No | `25` | Maximum labels accepted in one batch request. |
| `BATCH_CONCURRENCY_LIMIT` | No | `3` | Maximum concurrent batch verification tasks. |
| `VISION_PROVIDER` | Yes in deploy | `fake` | Vision provider selector. Use `fake` for deterministic tests and `openai` for real extraction. |
| `VISION_MODEL` | Yes for real extraction | `gpt-4.1-mini` | OpenAI model used by the real vision provider. |
| `OPENAI_API_KEY` | Yes for real extraction | empty | OpenAI API key. Backend environment only. |
| `VITE_API_BASE_URL` | Yes for frontend | `http://127.0.0.1:8000` | Frontend API base URL. |

## Setup

```bash
cp .env.example .env
```

Backend:

```bash
cd backend
uv sync
```

Frontend:

```bash
cd frontend
npm install
```

## Run Locally

Local fake-provider mode does not require an API key:

```bash
cd backend
VISION_PROVIDER=fake OPENAI_API_KEY= uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Open `http://localhost:5173`.

For real extraction, run the backend with `VISION_PROVIDER=openai`, `VISION_MODEL=gpt-4.1-mini`,
and `OPENAI_API_KEY` set in the backend environment.

## API Examples

### `GET /health`

```bash
curl -sS http://127.0.0.1:8000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "ttb-label-verification",
  "version": "0.1.0"
}
```

### `POST /verify`

```bash
APPLICATION_DATA='{
  "brand_name": "NORTHERN LIGHT RIESLING",
  "class_type": "White Wine Blend",
  "abv": "13.8% Alc./Vol.",
  "net_contents": "700 mL",
  "producer": "Northstar Vineyards, Traverse City, MI",
  "country_of_origin": "Canada",
  "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
}'

curl -sS http://127.0.0.1:8000/verify \
  -F "image=@demo-data/inputs/northstar-riesling.png;type=image/png" \
  -F "application_data=${APPLICATION_DATA}"
```

Expected success shape:

```json
{
  "results": [
    {
      "field": "brand_name",
      "match_type": "fuzzy",
      "expected": "NORTHERN LIGHT RIESLING",
      "found": "Northstar Riesling",
      "status": "PASS",
      "message": "Values match after normalization."
    }
  ],
  "overall_verdict": "APPROVED",
  "latency_ms": 1240
}
```

### `POST /verify/batch`

```bash
APPLICATION_DATA_ONE="$(jq -c '.application_data' demo-data/inputs/evergreen-amber-bourbon.application.json)"
APPLICATION_DATA_TWO="$(jq -c '.application_data' demo-data/inputs/coastal-pear-cider.application.json)"

curl -sS http://127.0.0.1:8000/verify/batch \
  -F "images=@demo-data/inputs/evergreen-amber-bourbon.png;type=image/png" \
  -F "application_data=${APPLICATION_DATA_ONE}" \
  -F "images=@demo-data/inputs/coastal-pear-cider.png;type=image/png" \
  -F "application_data=${APPLICATION_DATA_TWO}"
```

Expected success shape:

```json
{
  "items": [
    {
      "index": 0,
      "result": {
        "results": [],
        "overall_verdict": "APPROVED",
        "latency_ms": 1240
      },
      "error": null
    }
  ],
  "summary": {
    "passed": 1,
    "needs_review": 0,
    "total": 1
  }
}
```

Expected error shape:

```json
{
  "error": {
    "code": "unsupported_file_type",
    "message": "Please upload a JPG, PNG, or WEBP label image.",
    "details": {
      "field": "image"
    }
  }
}
```

## Live Smoke Check

Single-run deployed check:

```bash
cd backend
uv run python scripts/live_checklist.py \
  --url https://YOUR_BACKEND_ORIGIN \
  --image ../demo-data/inputs/northstar-riesling.png \
  --application-data ../demo-data/inputs/northstar-riesling.application.json
```

Expected output:

```text
Live checklist passed: overall_verdict=NEEDS_REVIEW latency_ms=1240 round_trip_ms=1500
```

Latency measurement command for the later real-provider pass:

```bash
cd backend
uv run python scripts/live_checklist.py \
  --url https://YOUR_BACKEND_ORIGIN \
  --image ../demo-data/inputs/northstar-riesling.png \
  --application-data ../demo-data/inputs/northstar-riesling.application.json \
  --runs 20
```

Expected output includes:

```text
latency_p50_ms=...
latency_p95_ms=...
round_trip_p50_ms=...
round_trip_p95_ms=...
```

## Performance

Target: single-label verification should complete under 5 seconds for reasonable label images.

Current implemented controls:

- `/verify` responses include backend `latency_ms`.
- `backend/scripts/live_checklist.py` asserts `latency_ms <= 5000` by default.
- Batch verification uses bounded concurrency with a default limit of `3`.
- Images are validated and preprocessed before vision extraction.

Live measurement status:

| Metric | Value | How measured |
| --- | --- | --- |
| Deployed `/verify` p50 `latency_ms` | Pending | Run `backend/scripts/live_checklist.py --runs 20` after `OPENAI_API_KEY` is configured. |
| Deployed `/verify` p95 `latency_ms` | Pending | Same 20-run script output, warm deployed service preferred. |
| Cold-start round trip | Pending | Record first `round_trip_ms` separately on free-tier deploys. |

These values are intentionally pending because real OpenAI live verification has not been run yet.

## Testing

Backend:

```bash
cd backend
uv run ruff check app
uv run pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

## Deployment

Backend deployment environment:

- Set `APP_ENV=production`.
- Set `BACKEND_CORS_ORIGINS` to the deployed frontend origin.
- Set `VISION_PROVIDER=openai` only when the backend has a valid `OPENAI_API_KEY`.
- Set `VISION_MODEL=gpt-4.1-mini`.
- Keep `OPENAI_API_KEY` in provider settings only.

Frontend deployment environment:

- Set `VITE_API_BASE_URL` to the deployed backend origin.
- Rebuild and redeploy the frontend after changing the backend URL.

Before submission:

- Confirm `/health` works on the deployed backend.
- Run the live smoke check against the deployed backend.
- Run single-label and batch flows from the deployed frontend.
- Confirm browser devtools shows no CORS errors.

## How To Use

1. Open the frontend.
2. Select or drop one or more JPG, PNG, or WEBP label images.
3. Review the image preview window.
4. Remove any incorrect image or cancel the upload if needed.
5. Accept the selected images.
6. Open an application row.
7. Enter the seven application fields.
8. Select the verify action.
9. Review the overall verdict and each field's expected-vs-found result.
10. If extracted text needs correction, edit the extracted value and recheck it through the backend.
11. Download reviewed results JSON when finished.

The app does not submit results to TTB, COLA, or any external system.

## Demo Data

Synthetic demo files live in:

- `demo-data/inputs/`
- `demo-data/outputs/reviewed-results.example.json`

These are placeholder workflow fixtures, not real labels and not official TTB records.

Use the standard government warning text when testing warning exactness:

```text
GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.
```

## Assumptions And Limitations

- The prototype is a standalone review aid, not an official TTB approval system.
- Every verification request is self-contained and stateless.
- Government warning text comparison is implemented, but warning lead-in bold styling detection is
  not claimed.
- Real OpenAI extraction has not been verified live yet because production API keys are not
  available.
- Measured deployed p50/p95 latency remains pending until the real-provider live pass.
- Free-tier hosting may introduce cold-start latency separate from backend `latency_ms`.
- Demo/fake providers are for local tests and demos only; they are not a substitute for production
  vision extraction.

## Security And Privacy

- Uploaded images are processed for the current request only.
- Extracted label data and application data are not persisted by the app.
- No database is used for the MVP.
- API keys and secrets belong only in backend environment variables or deployment-provider settings.
- The frontend never accepts or sends provider API keys.
- `.env`, `backend/.env`, and `frontend/.env` are ignored.
- Public API errors must not expose stack traces, provider internals, API keys, local paths, raw
  images, or unhandled exceptions.

## Final Submission Checklist

- Public repo URL documented.
- Live frontend URL documented.
- Backend deployment URL verified through `/health`.
- Live smoke check run against deployed `/verify`.
- Batch flow verified from the deployed frontend.
- Real-provider extraction verified after `OPENAI_API_KEY` is configured.
- p50 and p95 single-label latency recorded in this README.
- Secret audit confirms no `.env` files or real keys are tracked.
