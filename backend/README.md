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
```

## Phase Notes

The current backend is Phase 0 only. Phase 1 should add pure domain models and comparison tests before any AI or endpoint orchestration is added.
