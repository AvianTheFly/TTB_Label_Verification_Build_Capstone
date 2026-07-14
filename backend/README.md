# Backend

FastAPI backend for the TTB Label Verification proof-of-concept.

## Runtime

- Python 3.12
- `uv`
- FastAPI
- Pydantic v2

## Run

```bash
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

For local demo extraction without a real provider key:

```bash
VISION_PROVIDER=demo OPENAI_API_KEY= uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Test

```bash
uv run --extra dev ruff check .
uv run --extra dev pytest
```

## Structure

```text
app/
  api/        FastAPI routes, request parsing, dependency wiring, HTTP error mapping
  core/       settings, canonical API errors, global exception handlers
  domain/     pure models, normalization, comparison rules, verdict rules
  services/   vision provider boundary, fake/demo vision, image preprocessing
  use_cases/  single-label, extraction, recomparison, and batch workflows
tests/        backend regression tests
```

## Endpoints

- `GET /health`
- `POST /verify`
- `POST /verify/batch`
- `POST /extract`
- `POST /compare`

See `../docs/interfaces/api-contracts.md` and `../docs/interfaces/error-contracts.md`.

## Rules

- Keep domain logic pure and typed.
- Keep HTTP handlers thin.
- Keep provider code behind `VisionService`.
- Keep public application-data fields canonical and snake_case.
- Do not persist uploaded images, extracted labels, application data, API keys, or request state.
- Warning text comparison is exact after whitespace collapse; warning lead-in bold detection is
  best-effort visual evidence. Reviewer-edited bold state is accepted through
  `extracted_formatting` on `/compare`.
