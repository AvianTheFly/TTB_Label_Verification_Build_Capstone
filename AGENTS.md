# Agent Notes

You are helping maintain the finalized TTB Label Verification proof-of-concept.

Primary source of truth:

- `TTB_Label_Verification_Build_Playbook 1.pdf`
- `Additional Project Requirements`

Current final docs:

- `README.md`
- `docs/technical-requirements-audit.md`
- `docs/interfaces/api-contracts.md`
- `docs/interfaces/error-contracts.md`
- `docs/deployed-timing-results.md`

Standing rules:

- Backend: Python 3.12, FastAPI, Pydantic v2, `uv`.
- Frontend: React, TypeScript, Vite, Node 22.
- No database, no COLA integration, no persisted uploaded images or extracted/application data.
- Secrets live only in environment variables.
- Public application-data fields use canonical snake_case names:
  `brand_name`, `class_type`, `abv`, `net_contents`, `producer`, `country_of_origin`,
  `government_warning`.
- Do not introduce alternate public aliases such as `alcohol_content`, `producer_name_address`, or
  camelCase API fields.
- Single-label responses include `latency_ms`.
- Batch verification is required and uses bounded concurrency with per-item error isolation.
- Government warning text comparison is exact and case-sensitive after whitespace collapse.
- Warning failure must surface extracted warning text.
- Warning lead-in bold detection is best-effort only and must be documented as weak evidence.
- Ctrl+B formatting in the frontend warning fields is review metadata and must not replace the
  canonical plain-text application fields.
- Keep HTTP handlers thin, domain logic pure, and provider code behind explicit interfaces.
- Tests must not require real model calls.
