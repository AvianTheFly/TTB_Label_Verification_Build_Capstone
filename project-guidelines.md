# Global Constraints Document

This file is supplemental guidance for coding agents. If it conflicts with `TTB_Label_Verification_Build_Playbook 1.pdf` or `Additional Project Requirements`, those source-of-truth documents win.

## Technology Stack

- Backend: Python 3.12, FastAPI, Pydantic v2.
- Backend package manager: `uv`.
- Frontend: React, TypeScript, Vite.
- Tests: `pytest` for backend, Vitest or Playwright for frontend when added.
- Persistence: no database for MVP; requests are stateless.
- Integration: no COLA integration for the prototype.
- Data retention: do not persist uploads, extracted fields, or application data for the MVP.

## Naming Conventions

- API and backend model fields use snake_case.
- Frontend TypeScript types mirror API field names.
- Do not introduce alternate API field names for canonical label fields.
- Use `producer`, not `producer_name_address`, at API/model boundaries.
- Use `abv`, not `alcohol_content`, at API/model boundaries.

## Coding Standards

- Keep domain logic pure and independent of FastAPI, file I/O, and network calls.
- Keep HTTP handlers thin.
- Keep external services behind explicit interfaces.
- Keep provider-specific vision code behind a service boundary because target networks may block outbound model endpoints.
- Prefer typed models over dictionaries at module boundaries.
- Add tests before or with behavior changes.
- Keep modules small enough for AI agents to reason about locally.

## Error Standards

All public API errors use the canonical error envelope from `docs/interfaces/error-contracts.md`.

Errors must not expose:

- stack traces,
- provider internals,
- API keys,
- local absolute paths,
- raw unhandled exceptions.

## Logging Standards

Logs should be useful for debugging but safe for deployment.

Required:

- request timing for verification endpoints,
- provider timeout or failure reason category,
- batch item counts and needs-review item counts.

Forbidden:

- secrets,
- full uploaded image contents,
- raw API keys,
- unnecessary personally identifying details.

## Performance Constraints

- Single-label verification target: under 5 seconds on deployed app.
- Batch processing must use bounded concurrency.
- Image preprocessing must reduce oversized images before model calls.
- Every single-label response must include `latency_ms`.

## Security Constraints

- Secrets live in environment variables only.
- `.env` must not be committed.
- `.env.example` may contain variable names and safe placeholders only.
- Deployment secrets live in host/provider settings.

## UX Constraints

- Primary app screen is the usable verification tool, not a marketing page.
- Single-label flow must be understandable without instructions.
- Errors must be plain English.
- Results must show per-field status and expected-vs-found details.
- Government warning failure must surface the extracted warning text.

## Documentation Constraints

- Module specs must follow MAP v1 required structure.
- Interface changes must update dependent module specs.
- Original requirement files remain in `docs/source/`.
