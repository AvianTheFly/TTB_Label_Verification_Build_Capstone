# Frontend

React, TypeScript, and Vite frontend for the TTB Label Verification proof-of-concept.

Set `VITE_API_BASE_URL` to the backend URL before running or deploying the frontend.

Local example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Deployed example:

```bash
VITE_API_BASE_URL=https://your-deployed-backend.example.com
```

## Run

```bash
npm install
npm run dev
```

## Checks

```bash
npm run typecheck
npm run test
npm run build
```

## App Structure

```text
src/
  api/        Backend API clients and API error handling
  app/        Top-level app composition
  components/ Shared app-wide components when needed
  features/   Feature-owned UI, workflow state, and utilities
  styles/     Global CSS
  types/      TypeScript types that mirror backend API contracts
```

Package workflow feature:

```text
features/package-workflow/
  PackageWorkflow.tsx       Workflow coordinator and state owner
  components/               Screen sections and reusable workflow UI
  constants.ts              Feature constants
  filePreviews.ts           Browser object URL helpers
  packageWorkflowUtils.ts   Package parsing and export utilities
  recordStatus.ts           Review status, summaries, and decision helpers
  searchFilters.ts          Search and advanced-filter logic
  types.ts                  Feature-local TypeScript types
```

Keep API payload keys snake_case and aligned with `src/types/api.ts`.
