# Backend

FastAPI backend for the TTB Label Verification proof-of-concept.

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Test

```bash
uv run pytest
uv run ruff check .
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
  tests/      backend regression tests by endpoint or module
```

## Ownership Rules

- Keep route handlers thin. They should parse HTTP input, call one use case, log safe metadata, and return models.
- Keep `domain/` pure. No FastAPI, files, network, settings, or provider imports.
- Put workflow logic in `use_cases/`. Single-label and batch verification live there.
- Put provider and preprocessing boundaries in `services/`.
- Public API/model fields must stay snake_case and canonical: `brand_name`, `class_type`, `abv`, `net_contents`, `producer`, `country_of_origin`, `government_warning`.
- Do not store uploads, extracted labels, application data, API keys, or request state beyond the request lifetime.
