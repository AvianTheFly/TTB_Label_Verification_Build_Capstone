# Backend

FastAPI backend for the TTB Label Verification proof-of-concept.

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Test

```bash
uv run --extra dev pytest
uv run --extra dev ruff check .
```

## Live Smoke Check

After deployment, run a real `/verify` request against the deployed backend:

```bash
uv run python scripts/live_checklist.py --url https://your-backend.example.com
```

## App Structure

```text
app/
  api/        FastAPI routes, request parsing, dependency wiring, HTTP error mapping
  core/       settings, canonical API errors, global exception handlers
  domain/     pure models, normalization, and comparison rules
  services/   external-service boundaries: vision provider, fake/demo vision, image preprocessing
  use_cases/  application workflows that orchestrate domain logic and services
tests/        backend regression tests by endpoint or module
```

## Active Workflows

- Health: `GET /health` returns service status for startup/deployment checks.
- Single-label verification: `POST /verify` validates one uploaded label image plus seven canonical application fields, preprocesses the image, extracts fields through the configured vision provider, compares them, and returns a verdict.
- Batch verification: `POST /verify/batch` processes multiple image/application pairs with bounded concurrency and per-item error isolation.
- Reviewer recomparison: `POST /compare` recomputes backend-owned comparison results after a reviewer edits extracted values; it does not call vision or accept images.
- Live smoke check: `scripts/live_checklist.py` posts the bundled sample label to a local or deployed `/verify` endpoint.

Non-production providers are intentionally limited:

- `demo` is for filename-keyed local demonstrations.
- `fake` is for tests and explicit local development.

## Ownership Rules

- Keep route handlers thin. They should parse HTTP input, call one use case, log safe metadata, and return models.
- Keep `domain/` pure. No FastAPI, files, network, settings, or provider imports.
- Put workflow logic in `use_cases/`. Single-label and batch verification live there.
- Put provider and preprocessing boundaries in `services/`.
- Public API/model fields must stay snake_case and canonical: `brand_name`, `class_type`, `abv`, `net_contents`, `producer`, `country_of_origin`, `government_warning`.
- Do not store uploads, extracted labels, application data, API keys, or request state beyond the request lifetime.
