# TTB Label Verification

AI-assisted proof of concept for comparing alcohol label images with application data. Reviewers can
verify one label or a workload of hundreds, inspect field-level differences, and flag uncertain
results for human review.

[Live application](https://ttb-label-verification-build-capsto.vercel.app/) ·
[API health](https://ttb-label-verification-api-0i68.onrender.com/health) ·
[Approach, tools, and assumptions](DOCUMENTATION.md) ·
[API contracts](docs/interfaces/api-contracts.md)

> This is a review aid, not an official TTB approval system. It does not connect to COLA and does
> not persist uploaded images or application data.

## Setup and run

### Prerequisites

- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)
- Node.js 22 and npm

### 1. Start the backend

The demo provider works without an OpenAI key and is the quickest way to run the project locally.

```bash
cd backend
cp ../.env.example .env
uv sync --extra dev
VISION_PROVIDER=demo OPENAI_API_KEY= uv run uvicorn app.main:app \
  --reload --host 127.0.0.1 --port 8000
```

The API is available at `http://127.0.0.1:8000`; interactive API documentation is at
`http://127.0.0.1:8000/docs`.

To use real AI extraction, set these values in `backend/.env`, then start the same server without
the inline demo variables:

```dotenv
VISION_PROVIDER=openai
VISION_MODEL=gpt-5.4-nano
OPENAI_TIMEOUT_SECONDS=4.5
OPENAI_API_KEY=your_key_here
```

Never commit the `.env` file or expose the API key to the frontend.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```

Open `http://localhost:5173`. Use **Sample Labels** in the app if you do not have label images ready.

### 3. Run the checks

Backend:

```bash
cd backend
OPENAI_TIMEOUT_SECONDS=4.5 uv run --extra dev ruff check .
OPENAI_TIMEOUT_SECONDS=4.5 uv run --extra dev pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

Latest local result: 140 backend tests and 40 frontend tests passing.

## How to use it

1. Upload JPG, PNG, or WEBP label images.
2. Enter the seven application fields for each label.
3. Select **Verify** for one label or **Verify Batch** for the full workload.
4. Review the overall verdict and each expected-versus-detected field.
5. Correct extracted text or warning-style metadata and run the comparison again when needed.

The frontend automatically divides workloads larger than 25 labels into ordered requests and
combines their results in the same review screen. A failed group does not prevent later groups from
running.

## What is verified

| Field | Comparison |
| --- | --- |
| Brand name, class/type, producer | Normalized fuzzy match |
| Alcohol by volume | Numeric match with tolerance |
| Net contents | Unit-normalized match in milliliters |
| Country of origin | Synonym-normalized match |
| Government warning | Exact, case-sensitive match to the canonical statement after whitespace collapse |
| Warning lead-in boldness | Best-effort AI evidence; uncertain or non-bold results require review |

All fields passing produces `APPROVED`; any failed or uncertain field produces `NEEDS_REVIEW`.

## Project structure

```text
backend/       FastAPI API, pure comparison rules, provider adapters, and tests
frontend/      React review workflow, API client, styling, and tests
docs/          API contracts, error contracts, technical audit, and timing evidence
demo-data/     Synthetic sample labels for local demonstrations
```

Start with [DOCUMENTATION.md](DOCUMENTATION.md) for the implementation approach, design decisions,
tools, assumptions, limitations, and performance notes. More detailed references are listed in
[Documentation map](#documentation-map).

## API summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service readiness and effective batch limit |
| `POST` | `/verify` | Extract and compare one label |
| `POST` | `/verify/batch` | Verify up to 25 labels with bounded concurrency |
| `POST` | `/extract` | Extract canonical fields from one label |
| `POST` | `/compare` | Recompare edited data without another model call |

Public payloads use these canonical snake_case fields: `brand_name`, `class_type`, `abv`,
`net_contents`, `producer`, `country_of_origin`, and `government_warning`.

## Configuration

Copy `.env.example` into `backend/.env` for local backend configuration. Important values are:

| Variable | Purpose | Default/example |
| --- | --- | --- |
| `VISION_PROVIDER` | `openai`, `demo`, or `fake` extraction | `openai` |
| `VISION_MODEL` | Model used by the OpenAI provider | `gpt-5.4-nano` |
| `OPENAI_API_KEY` | Backend-only provider credential | empty |
| `OPENAI_TIMEOUT_SECONDS` | Provider timeout, capped at 4.5 seconds | `4.5` |
| `MAX_UPLOAD_MB` | Maximum size of one image | `10` |
| `MAX_BATCH_ITEMS` | Maximum labels in one API request | `25` |
| `BATCH_CONCURRENCY_LIMIT` | Concurrent items inside a batch | `3` |
| `BACKEND_CORS_ORIGINS` | Allowed frontend origins | local Vite origins |
| `VITE_API_BASE_URL` | Backend URL used by the frontend | `http://127.0.0.1:8000` |

See [.env.example](.env.example) for all supported settings.
Upload size, batch size, and batch concurrency settings must be positive integers; invalid values
stop the backend during startup instead of producing a partially working deployment.

## Deployment

- The backend is configured for Render in [render.yaml](render.yaml).
- The frontend is configured for Vercel in [vercel.json](vercel.json).
- Production secrets must be set in the hosting provider, never committed.
- A free-tier backend cold start can delay the first request; the UI shows startup/loading state.

## Documentation map

- [Approach, tools, and assumptions](DOCUMENTATION.md) — concise project design documentation.
- [Backend guide](backend/README.md) — backend commands, layout, and rules.
- [Frontend guide](frontend/README.md) — frontend commands, layout, and workflow.
- [API contracts](docs/interfaces/api-contracts.md) — request and response shapes.
- [Error contracts](docs/interfaces/error-contracts.md) — safe error behavior.
- [Technical requirements audit](docs/technical-requirements-audit.md) — requirement traceability.
- [Deployed timing results](docs/deployed-timing-results.md) — recorded latency evidence.

## Current limitations

- AI extraction can be wrong or return unknown values when images are small, blurred, angled, or
  affected by glare.
- Bold-style detection is weak evidence. Unknown boldness always requires human review.
- Large workloads are processed as sequential groups of 25, not as resumable background jobs.
- Free-tier hosting may introduce a cold-start delay even though warm verification meets the target.
- This prototype does not provide authentication, a database, audit retention, COLA integration, or
  production federal compliance controls.
