# TTB Label Verification

Live frontend: https://fed-stack-capstone.vercel.app/

AI-assisted proof-of-concept for checking alcohol beverage label images against user-entered
application data. The app is standalone, stateless, and does not integrate with COLA or use a
database.

## Source Requirements

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

## Current Status

- Public repository: https://github.com/AvianTheFly/TTB_Label_Verification_Build_Capstone
- Live frontend: https://fed-stack-capstone.vercel.app/
- Local real OpenAI live verification: passed on 2026-07-13 with backend `.env` credentials.
- Measured deployed p50/p95 latency: pending until Render real-provider verification is run.

## Current Workflow

1. User selects one or more label images.
2. The frontend shows an image preview confirmation before adding the images.
3. Each accepted image becomes one application.
4. User opens an application and enters the seven application fields.
5. User selects `Verify`.
6. Frontend sends the image and application data together to `POST /verify`.
7. Backend validates and preprocesses the image, extracts label text, compares fields, and returns
   `APPROVED` or `NEEDS_REVIEW`.

## Features

- Single-label verification with image upload, seven application fields, loading state, and result
  view.
- Batch upload with preview confirmation, per-image removal, bounded backend concurrency, and
  per-item error isolation.
- Backend-owned comparison logic with per-field `PASS` or `FAIL`.
- Overall verdict rule: all fields pass -> `APPROVED`; any field fails -> `NEEDS_REVIEW`.
- Exact, case-sensitive government-warning comparison after whitespace collapse.
- Extracted government-warning text is surfaced on failures for human review.
- Request-scoped image preprocessing before provider calls.
- Editable extracted fields with backend recomparison through `/compare`.
- Reviewed-results JSON download from the browser.
- Real OpenAI vision adapter behind a `VisionService` interface.
- Explicit local-only demo and test vision providers.

## Architecture

```text
frontend/
  React + TypeScript + Vite
  image preview, application fields, result display

backend/
  FastAPI
  /health, /verify, /verify/batch, /compare
  image validation and preprocessing
  VisionService provider boundary
  pure comparison engine
```

The frontend mirrors backend API field names exactly:

- `brand_name`
- `class_type`
- `abv`
- `net_contents`
- `producer`
- `country_of_origin`
- `government_warning`

## Vision Provider Configuration

Provider choice and credentials are backend environment configuration only. The frontend never
accepts or sends API keys, model names, or provider-selection flags.

Production defaults:

```text
VISION_PROVIDER=openai
VISION_MODEL=gpt-5.4-nano
OPENAI_TIMEOUT_SECONDS=30
IMAGE_MAX_DIMENSION=1600
IMAGE_JPEG_QUALITY=60
IMAGE_REENCODE_THRESHOLD_BYTES=500000
```

`gpt-5.4-nano` is the configured default model for the OpenAI vision provider. Public OpenAI model
documentation was reviewed on 2026-07-13. Local account-backed extraction was verified on
2026-07-13 with `VISION_PROVIDER=openai` and the API key stored only in `backend/.env`.

Supported providers:

- `openai`: real provider for production and deployed verification.
- `demo`: filename-keyed fixture extraction for explicit local demonstrations.
- `fake`: deterministic test double for automated tests and explicit local development only.

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
| `IMAGE_MAX_DIMENSION` | No | `1600` | Maximum image dimension after preprocessing. |
| `IMAGE_JPEG_QUALITY` | No | `60` | JPEG quality used for preprocessed images. |
| `IMAGE_REENCODE_THRESHOLD_BYTES` | No | `500000` | Small images at or below this size are sent unchanged unless resizing or transparency handling is needed. |
| `VISION_PROVIDER` | Yes in deploy | `openai` | Vision provider selector. Use `openai` for production. |
| `VISION_MODEL` | Yes for real extraction | `gpt-5.4-nano` | OpenAI model used by the real vision provider. |
| `OPENAI_TIMEOUT_SECONDS` | No | `30` | OpenAI client safety timeout used while measuring live response duration. |
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

Run without a real provider key:

```bash
cd backend
VISION_PROVIDER=demo OPENAI_API_KEY= uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Open `http://localhost:5173`.

For real extraction, run the backend with `VISION_PROVIDER=openai`, `VISION_MODEL=gpt-5.4-nano`,
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
APPLICATION_DATA_ONE='{
  "brand_name": "EVERGREEN AMBER BOURBON",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol. (90 Proof)",
  "net_contents": "750 mL",
  "producer": "Evergreen Spirits LLC, Louisville, KY",
  "country_of_origin": "United States",
  "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
}'
APPLICATION_DATA_TWO='{
  "brand_name": "COASTAL PEAR CIDER",
  "class_type": "Hard Cider",
  "abv": "6.8% Alc./Vol.",
  "net_contents": "12 fl oz",
  "producer": "Coastal Orchard Works, Portland, OR",
  "country_of_origin": "United States",
  "government_warning": "Government Warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
}'

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

### `POST /compare`

`/compare` recomputes backend comparison after a reviewer edits extracted text. It accepts JSON
with `application_data`, `extracted_data`, and optional `field_decisions`. It does not accept images
and does not call the vision service.

Expected API error shape:

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
uv run python scripts/live_checklist.py --url https://YOUR_BACKEND_ORIGIN
```

By default, the script uses the bundled `northstar-riesling` sample from `demo-data/inputs`.
Image lookup can fall back to `frontend/public/demo-data/inputs` if needed. Pass `--image`
and `--application-data` to use a different sample and explicit application-data JSON.

Expected output:

```text
Live checklist passed: overall_verdict=NEEDS_REVIEW latency_ms=1240 round_trip_ms=1500
```

Latency measurement command for the real-provider pass:

```bash
cd backend
uv run python scripts/live_checklist.py \
  --url https://YOUR_BACKEND_ORIGIN \
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
- OpenAI client timeout defaults to `4.5` seconds.
- Batch verification uses bounded concurrency with a default limit of `3`.
- Images are validated and preprocessed before vision extraction.

Live measurement status:

| Metric | Value | How measured |
| --- | --- | --- |
| Local `/verify` p50 `latency_ms` | `2979` | `uv run python scripts/live_checklist.py --url http://127.0.0.1:8000 --runs 5` on 2026-07-13. |
| Local `/verify` p95 `latency_ms` | `3907` | Same 5-run local live OpenAI script output. |
| Local round-trip p50/p95 | `2984` / `3941` | Same 5-run local live OpenAI script output. |
| Deployed `/verify` p50 `latency_ms` | `1501` | `uv run python scripts/live_checklist.py --url https://ttb-label-verification-api-0i68.onrender.com --runs 20 --max-latency-ms 60000` on 2026-07-13. |
| Deployed `/verify` p95 `latency_ms` | `2527` | Same 20-run Render live OpenAI script output after warm-up. |
| Deployed round-trip p50/p95 | `1676` / `2694` | Same 20-run Render live OpenAI script output after warm-up. |
| Cold-start round trip | Not recorded | First strict deployed timing check exceeded 5000 ms, consistent with possible free-tier cold start; warm p95 passed. |

The deployed warm p95 result is under the 5 second target. Free-tier cold starts may still exceed
the target before the service is warm.

## Testing

Backend:

```bash
cd backend
uv run --extra dev ruff check .
uv run --extra dev pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

## Deployment

Committed deployment config:

- `render.yaml` for the FastAPI backend.
- `vercel.json` for the Vite frontend.

Backend deployment requirements:

- Set `OPENAI_API_KEY` only in the deployment provider environment.
- Keep `VISION_PROVIDER=openai`.
- Keep `VISION_MODEL=gpt-5.4-nano`.
- Keep `OPENAI_TIMEOUT_SECONDS=30` while measuring live response duration.
- Set `BACKEND_CORS_ORIGINS` to the deployed frontend origin.

Frontend deployment requirements:

- Set `VITE_API_BASE_URL` to the deployed backend origin.
- Rebuild after changing `VITE_API_BASE_URL`.

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

- This is a review aid, not an official TTB approval system.
- Every verification request is self-contained and stateless.
- Government warning text exactness is implemented; bold styling detection for the
  `GOVERNMENT WARNING:` lead-in is not claimed.
- Real OpenAI extraction has been verified locally and through the deployed Render backend.
- Measured deployed warm p50/p95 latency is recorded in the performance section.
- Free-tier hosting may add cold-start latency outside request-scoped `latency_ms`.
- Demo/fake providers are for local tests and demos only; they are not a substitute for production
  vision extraction.

## Security And Privacy

- Uploaded images, extracted data, and application data are processed only for the current request.
- No database is used.
- Real keys and secrets must live only in local `.env` files or deployment-provider settings.
- The frontend never accepts or sends provider API keys.
- `.env`, `backend/.env`, and `frontend/.env` are ignored.
- API errors must not expose stack traces, provider internals, API keys, local paths, or raw images.

## Final Submission Checklist

- Public repo URL documented.
- Live frontend URL documented.
- Backend deployment URL verified through `/health`.
- Live smoke check run against deployed `/verify`.
- Batch flow verified from the deployed frontend.
- Local real-provider extraction verified after `OPENAI_API_KEY` was configured.
- Local p50 and p95 single-label latency recorded in this README.
- Deployed p50 and p95 single-label latency recorded in this README after Render verification.
- Secret audit confirms no `.env` files or real keys are tracked.
