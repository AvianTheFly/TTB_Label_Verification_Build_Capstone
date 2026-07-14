# TTB Label Verification

Live frontend: https://fed-stack-capstone.vercel.app/

Live backend health: https://ttb-label-verification-api-0i68.onrender.com/health

Public repository: https://github.com/AvianTheFly/TTB_Label_Verification_Build_Capstone

AI-assisted proof-of-concept for checking alcohol beverage label images against structured
application data. The app is standalone, stateless, and does not integrate with COLA or use a
database.

## Source Requirements

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`
- Supplemental audit: `docs/technical-requirements-audit.md`

## What It Does

- Upload one or more JPG, PNG, or WEBP label images.
- Create one application review card per image.
- Enter the seven TTB-style application fields for each label.
- Verify one application or verify the full batch.
- Review `APPROVED` or `NEEDS_REVIEW` verdicts with per-field expected-vs-found details.
- Use Ctrl+B in the government warning application and AI-detected fields to mark the warning
  lead-in as bold during review.
- Edit AI-detected text and re-run backend comparison through `/compare`.
- Download reviewed results as JSON from the browser.

The first screen is the actual verification tool, not a marketing page. Manual deployed checks for
single-label, batch, and accessibility/UX were recorded as passed before final submission cleanup.

## Canonical Fields

Public API payloads use these exact snake_case names:

- `brand_name`
- `class_type`
- `abv`
- `net_contents`
- `producer`
- `country_of_origin`
- `government_warning`

User-facing labels may say friendly names such as "Alcohol Content", but API and model contracts
keep the canonical names.

## Architecture

```text
frontend/
  React + TypeScript + Vite
  upload surface, application cards, detail review, results, batch verification

backend/
  FastAPI + Pydantic v2 + uv
  /health, /verify, /verify/batch, /extract, /compare
  request validation, image preprocessing, vision provider boundary, comparison engine
```

Key boundaries:

- `backend/app/domain/`: pure comparison logic, no FastAPI, files, network, or provider clients.
- `backend/app/services/vision.py`: explicit `VisionService` provider interface.
- `backend/app/services/image_preprocess.py`: request-scoped image validation and re-encoding.
- `frontend/src/types/api.ts`: TypeScript types that mirror backend API field names.

## Comparison Rules

- `brand_name`, `class_type`, `producer`: fuzzy match after normalization.
- `country_of_origin`: synonym normalization, such as `USA` and `United States`.
- `abv`: numeric alcohol-content comparison with tolerance.
- `net_contents`: unit normalization to mL.
- `government_warning`: exact, case-sensitive comparison after whitespace collapse only.

Verdict rule:

- all fields `PASS` -> `APPROVED`
- any field `FAIL` -> `NEEDS_REVIEW`

Government warning failures always include the extracted warning text in `found` so a reviewer can
inspect OCR/model mistakes.

## Warning Style Detection

The source requirements call out `GOVERNMENT WARNING:` as all caps and bold. This app enforces the
text exactness requirement and also asks the vision provider for best-effort visual evidence. The
frontend also lets reviewers use Ctrl+B in the government warning application and AI-detected fields
to mark the lead-in bold after manual review.

- `government_warning_lead_in_bold=true`: text can pass and the result message notes bold was detected.
- `government_warning_lead_in_bold=false`: the warning field fails and needs review.
- `government_warning_lead_in_bold=null`: text can pass, but the message notes bold styling was not confirmed.

This is intentionally documented as weak evidence. Font weight detection from a label photo can be
uncertain, especially with blur, glare, compression, small text, or unusual fonts.

## Performance

Single-label responses include backend `latency_ms`.

Measured deployed timing from `docs/deployed-timing-results.md`:

| Metric | Result |
| --- | ---: |
| Deployed `latency_ms` p50 | 1501 ms |
| Deployed `latency_ms` p95 | 2527 ms |
| Deployed round-trip p50 | 1676 ms |
| Deployed round-trip p95 | 2694 ms |

These warm deployed p50/p95 results are under the 5-second target. Free-tier hosting can still add a
cold-start delay before the backend is warm; the frontend shows a visible startup/loading status so
the user is not left guessing during that delay.

## Environment

Secrets belong only in local `.env` files or deployment-provider environment settings.

Backend:

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | Runtime environment name. |
| `BACKEND_CORS_ORIGINS` | Comma-separated allowed frontend origins. |
| `MAX_UPLOAD_MB` | Maximum uploaded image size. |
| `MAX_BATCH_ITEMS` | Maximum labels per batch request. |
| `BATCH_CONCURRENCY_LIMIT` | Maximum concurrent batch items. |
| `IMAGE_MAX_DIMENSION` | Maximum preprocessed image dimension. |
| `IMAGE_JPEG_QUALITY` | JPEG quality for re-encoded images. |
| `IMAGE_REENCODE_THRESHOLD_BYTES` | Size threshold for re-encoding. |
| `VISION_PROVIDER` | `openai`, `demo`, or `fake`. Production uses `openai`. |
| `VISION_MODEL` | OpenAI model used by the real provider. |
| `OPENAI_TIMEOUT_SECONDS` | OpenAI client timeout. |
| `OPENAI_API_KEY` | Backend-only OpenAI API key. |

Frontend:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend origin used by the deployed or local frontend. |

## Setup

Backend requires Python 3.12. Frontend requires Node 22.

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

Backend with local demo extraction fixtures:

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

For real extraction, run the backend with `VISION_PROVIDER=openai`, `VISION_MODEL` set, and
`OPENAI_API_KEY` set in the backend environment.

## API Summary

`GET /health`

```json
{
  "status": "ok",
  "service": "ttb-label-verification",
  "version": "0.1.0"
}
```

`POST /verify`

- Multipart fields: `image`, `application_data`.
- Returns `VerificationResult` with `results`, `overall_verdict`, `latency_ms`, and optional
  `extracted_formatting`.

`POST /verify/batch`

- Multipart fields: repeated `images`, repeated `application_data`.
- Uses bounded concurrency.
- One bad item returns an item-level error instead of failing the full batch.
- Summary contains `passed`, `needs_review`, and `total`.

`POST /extract`

- Multipart field: `image`.
- Returns extracted label fields plus optional style evidence.

`POST /compare`

- JSON fields: `application_data`, `extracted_data`, optional `extracted_formatting`, optional
  `field_decisions`.
- Recomputes backend comparison without calling the vision provider.

See `docs/interfaces/api-contracts.md` and `docs/interfaces/error-contracts.md` for exact shapes.

## Checks

Backend:

```bash
cd backend
uv run --extra dev python --version
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

Final local verification from cleanup:

- backend ruff passed
- backend tests passed: `131 passed`
- frontend typecheck passed
- frontend tests passed: `35 passed`
- frontend production build passed
- deployed backend `/health` returned `ok`
- deployed frontend returned HTTP 200

## Deployment

Committed deployment config:

- `render.yaml` for the FastAPI backend.
- `vercel.json` for the Vite frontend.

Backend deployment requirements:

- Python 3.12.
- `VISION_PROVIDER=openai`.
- `OPENAI_API_KEY` set only in Render environment variables.
- `BACKEND_CORS_ORIGINS=https://fed-stack-capstone.vercel.app`.

Frontend deployment requirements:

- Node 22.
- `VITE_API_BASE_URL=https://ttb-label-verification-api-0i68.onrender.com`.

## Security And Privacy

- No database is used.
- Uploaded images, extracted data, and application data are processed only for the current request.
- Real API keys must never be committed.
- `.env`, `backend/.env`, and `frontend/.env` are ignored.
- The frontend never accepts or sends provider API keys.
- Public API errors use a safe error envelope and do not expose stack traces, provider internals,
  API keys, local paths, or raw image contents.

## Assumptions And Limitations

- This is a review aid, not an official TTB approval system.
- It does not submit to TTB, COLA, or any external government system.
- Vision extraction depends on visible label text and may return `null` for unclear fields.
- Warning text exactness is enforced; warning bold detection is best-effort and should be reviewed
  by a human when style is uncertain. Ctrl+B formatting is preserved as review metadata, not as
  hidden text in the canonical application fields.
- Free-tier cold starts may delay first contact with the backend, but a visible frontend loading
  state is present.
- Demo/fake providers are for local tests and demonstrations only.

## Demo Data

Synthetic demo inputs live in `demo-data/inputs/` and `frontend/public/demo-data/inputs/`.

These are workflow fixtures, not real labels and not official TTB records.
