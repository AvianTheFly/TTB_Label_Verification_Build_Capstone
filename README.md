# TTB Label Verification

AI-powered proof-of-concept for checking alcohol beverage label images against structured application data.

This repository is intentionally organized for AI-agent implementation using the seven phases in Part 3 of `TTB_Label_Verification_Build_Playbook 1.pdf`. The current foundation is Phase 0: deployable skeleton, PDF-aligned contracts, and guardrails for future prompts.

## Source Of Truth

Read these before planning or executing any phase. These two documents are authoritative:

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

Then read these implementation guardrails:

- `project-guidelines.md`
- `product-build-overview.md`
- `AGENTS.md`
- `docs/phase-control.md`
- `docs/requirements-traceability.md`

Authoritative source copies and a source index live in `docs/source/` for reviewer visibility.

## Phase Map

| Phase | Purpose | Primary Output |
| --- | --- | --- |
| 0 | Scaffold, secrets, deploy skeleton | `/health`, frontend health check, deploy-ready config |
| 1 | Data models and comparison engine | Pure typed comparison logic with unit tests |
| 2 | Vision service | Mockable image extraction boundary |
| 3 | `/verify` endpoint | Single-label backend orchestration |
| 4 | Single-label frontend | Accessible upload/data/results flow |
| 5 | Batch upload | Batch backend and frontend summary/drill-down |
| 6 | Hardening | Latency, validation, imperfect images, accessibility |
| 7 | Submission | README, deployed URL, secret audit, final demo |

## Phase Control

Use [docs/phase-control.md](docs/phase-control.md) before asking AI agents to execute a phase. It defines owned files, allowed dependencies, required regression checks, and the handoff criteria that keep a fix in one phase from degrading another phase.

## Local Setup

Create a local environment file from the placeholder-only example:

```bash
cp .env.example .env
```

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

Open `http://localhost:5173`. The frontend should display the backend health response.

## Tests

Backend:

```bash
cd backend
uv run pytest
```

Frontend:

```bash
cd frontend
npm run typecheck
```

## Phase 0 Deployment

Phase 0 is intended to prove deployment before real verification features are added. The
recommended free-tier path is Render for both services: a Python web service for the backend and a
static site for the Vite frontend.

### Backend on Render

Create a new Render Web Service connected to this repository.

- Root directory: `backend`
- Runtime: Python 3
- Build command: `pip install uv && uv sync`
- Start command: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`

Set these environment variables in Render:

```text
APP_ENV=production
APP_NAME=TTB Label Verification
APP_VERSION=0.1.0
SERVICE_SLUG=ttb-label-verification
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_UPLOAD_MB=10
VISION_PROVIDER=fake
VISION_MODEL=
OPENAI_API_KEY=
```

After the backend deploy finishes, verify:

```bash
curl https://<backend-service>.onrender.com/health
```

Expected response:

```json
{"status":"ok","service":"ttb-label-verification","version":"0.1.0"}
```

### Frontend on Render

Create a new Render Static Site connected to this repository.

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

Set this environment variable in Render:

```text
VITE_API_BASE_URL=https://<backend-service>.onrender.com
```

Because Vite reads `VITE_*` variables at build time, rebuild the frontend after changing this
value.

### Connect CORS

After the frontend deploys, update the backend Render environment variable so the deployed
frontend origin is allowed:

```text
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://<frontend-site>.onrender.com
```

Do not add a trailing slash to any origin. Redeploy the backend after changing CORS. Then open:

```text
https://<frontend-site>.onrender.com
```

The page should display the deployed backend health response. Free Render web services can spin
down after idle time, so the first request after a quiet period may take longer while the backend
wakes up. That is acceptable for this prototype scaffold, but Phase 0 is not complete until the
live frontend shows the live backend health response.

## Canonical API Fields

All API contracts use these exact snake_case fields:

- `brand_name`
- `class_type`
- `abv`
- `net_contents`
- `producer`
- `country_of_origin`
- `government_warning`

Do not introduce `alcohol_content`, `producer_name_address`, camelCase, or alternate API names.

## Current Status

Phase 0 foundation scaffolding is present. Phase 0 is not complete until the playbook's exit check is true: the app loads at a live URL and the frontend shows the health response. Later phases should be implemented by running the PLAN, REVIEW, and EXECUTE prompts from Part 3 of the playbook in order.
