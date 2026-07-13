# Phase 0 Foundation

## 1. Purpose

Provide a minimal deployable backend and frontend skeleton so later phases can build against known conventions.

This module does not implement label comparison, vision extraction, `/verify`, or batch behavior.

## 2. Phase

Phase 0 - Scaffold, Secrets, Deploy Skeleton.

## 3. Ownership

Backend health/config, frontend shell, repository setup, and documentation.

## 4. Inputs And Outputs

Input:

- Browser request to frontend.
- HTTP request to backend `/health`.

Output:

- Backend health JSON.
- Frontend display of backend status.

## 5. Public Interfaces

- `GET /health`
- Frontend `getHealth()`

## 6. Dependencies

- FastAPI
- Pydantic settings
- React
- Vite

Forbidden in Phase 0:

- Real vision provider calls.
- Comparison rules.
- Database or persistence.

## 7. Error Behavior

Backend public errors must use the canonical error envelope in `docs/interfaces/error-contracts.md`.

The frontend health check may display a plain-English connection error when the backend is unavailable.

## 8. Tests Required

- Backend test for `/health`.
- Frontend typecheck.

## 9. Exit Criteria

- Backend starts locally.
- Frontend starts locally.
- Frontend displays `/health` response.
- `.env` is ignored and `.env.example` contains placeholders only.
- Live deployment path is proven before starting real features.

## 10. Files Likely Touched

- `.env.example`
- `.gitignore`
- `README.md`
- `backend/pyproject.toml`
- `backend/app/main.py`
- `backend/app/api/health.py`
- `backend/app/core/config.py`
- `backend/app/core/errors.py`
- `backend/tests/test_health.py`
- `frontend/package.json`
- `frontend/src/app/App.tsx`
- `frontend/src/api/health.ts`
- `frontend/src/styles/global.css`
