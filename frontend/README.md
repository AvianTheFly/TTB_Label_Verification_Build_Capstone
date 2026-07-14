# Frontend

React, TypeScript, and Vite frontend for the TTB Label Verification proof-of-concept.

## Runtime

- Node 22
- React
- TypeScript
- Vite

Set `VITE_API_BASE_URL` to the backend origin before running or deploying.

Local example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Deployed example:

```bash
VITE_API_BASE_URL=https://ttb-label-verification-api-0i68.onrender.com
```

## Run

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Structure

```text
src/
  api/        Backend API clients and safe API error handling
  app/        Top-level app composition
  features/   Package workflow UI, state, validation, search, export
  styles/     Global and feature CSS
  types/      TypeScript API contracts mirroring backend snake_case fields
```

## Workflow

- Users upload one or more label images.
- Each image becomes an application review card.
- Users enter seven application-data fields in the detail view.
- Users verify one application or the full batch.
- Results show status, expected values, AI-detected values, and readable messages.
- Ctrl+B in the government warning application and AI-detected fields marks the warning lead-in as
  bold for review.
- A visible backend startup/loading status is shown for free-tier cold starts.

The frontend does not accept OpenAI keys and does not implement comparison rules; comparison stays
backend-owned.
