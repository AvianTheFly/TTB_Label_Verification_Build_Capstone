# TTB Label Verification

Live frontend: https://fed-stack-capstone.vercel.app/

AI-assisted proof-of-concept for checking alcohol beverage label images against user-entered
application data. The app is standalone, stateless, and does not integrate with COLA or use a
database.

## Source Requirements

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

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
VISION_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_SECONDS=4.5
IMAGE_MAX_DIMENSION=1600
IMAGE_JPEG_QUALITY=85
```

`gpt-4.1-mini` is the configured default model for the OpenAI vision provider.

Supported providers:

- `openai`: real provider for production and deployed verification.
- `demo`: filename-keyed fixture extraction for explicit local demonstrations.
- `fake`: deterministic test double for automated tests and explicit local development only.

## Environment Variables

Copy the example file and fill deployment-local values:

```bash
cp .env.example .env
```

Backend:

```text
APP_ENV=local
APP_NAME=TTB Label Verification
APP_VERSION=0.1.0
SERVICE_SLUG=ttb-label-verification
API_HOST=127.0.0.1
API_PORT=8000
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_UPLOAD_MB=10
MAX_BATCH_ITEMS=25
BATCH_CONCURRENCY_LIMIT=3
IMAGE_MAX_DIMENSION=1600
IMAGE_JPEG_QUALITY=85
VISION_PROVIDER=openai
VISION_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_SECONDS=4.5
OPENAI_API_KEY=
```

Frontend:

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

For local development without a real provider key, explicitly set `VISION_PROVIDER=demo` or
`VISION_PROVIDER=fake`. Do not use those providers for production verification.

## Run Locally

Backend:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## API Overview

`GET /health`

Returns service status.

`POST /verify`

- Multipart parts: `image`, `application_data`
- Returns `VerificationResult` with `results`, `overall_verdict`, and `latency_ms`

`POST /verify/batch`

- Multipart parts: repeated `images`, repeated `application_data`
- Returns batch `items` plus `summary`

`POST /compare`

- JSON body: `application_data`, `extracted_data`, optional `field_decisions`
- Recomputes comparison after reviewer edits extracted text
- Does not accept images and does not call the vision service

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

Live deployed image testing with the real provider is planned for the final verification pass.

## Deployment

Committed deployment config:

- `render.yaml` for the FastAPI backend.
- `vercel.json` for the Vite frontend.

Backend deployment requirements:

- Set `OPENAI_API_KEY` only in the deployment provider environment.
- Keep `VISION_PROVIDER=openai`.
- Keep `OPENAI_TIMEOUT_SECONDS` at `4.5` or lower.
- Set `BACKEND_CORS_ORIGINS` to the deployed frontend origin.

Frontend deployment requirements:

- Set `VITE_API_BASE_URL` to the deployed backend origin.
- Rebuild after changing `VITE_API_BASE_URL`.

## Security And Privacy

- Uploaded images, extracted data, and application data are processed only for the current request.
- No database is used.
- Real keys and secrets must live only in local `.env` files or deployment-provider settings.
- `.env`, `backend/.env`, and `frontend/.env` are ignored.
- API errors must not expose stack traces, provider internals, API keys, local paths, or raw images.

## Assumptions And Limitations

- This is a review aid, not an official TTB approval system.
- Government warning text exactness is implemented; bold styling detection for the
  `GOVERNMENT WARNING:` lead-in is not claimed.
- Free-tier hosting may add cold-start latency outside request-scoped `latency_ms`.
- Final live testing with real sample images still needs to be run before submission.
