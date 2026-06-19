# Phase 6 Checklist

Phase: Robustness, Performance, Accessibility.

Scope guardrails:

- No new product features.
- No canonical field changes.
- No `/verify` or `/verify/batch` contract changes.
- No error envelope or batch item-error shape changes.
- No COLA lookup, persistence, database, login, or authentication.
- No tuning that increases false PASS risk. Uncertain, partial, blurry, glare-heavy,
  angled, ambiguous, or incomplete extraction must return null/partial fields and
  allow comparison to produce `NEEDS_REVIEW`.

## Coverage

| Checklist item | Local automated coverage | Manual or conditional coverage |
| --- | --- | --- |
| Valid label | Backend `/verify`, batch, and comparison tests with fake vision | Local smoke test |
| Intentional mismatches | Backend single-label and batch `NEEDS_REVIEW` tests | Frontend result readability smoke |
| Case-only brand difference | Comparison test | None needed |
| ABV normalization | Comparison test | None needed |
| Net contents/unit normalization | Comparison tests | None needed |
| Country synonym normalization | Comparison test | None needed |
| Missing government warning | Comparison and endpoint tests for null extracted warning | None needed |
| Wrong-caps government warning | Comparison and endpoint warning-failure tests | None needed |
| Correct government warning | Comparison and valid endpoint tests | None needed |
| Imperfect image | Vision prompt tests and endpoint/batch partial-extraction tests | Real sample-image test if provider credentials and samples are available |
| Wrong file type | Vision, `/verify`, and batch tests | Frontend validation smoke |
| Empty submit | Backend missing-field tests and frontend validation tests | Manual UI smoke |
| Batch summary | Backend and frontend batch summary tests | Local smoke test |
| Single-label speed under 5 seconds | `latency_ms` response and timing-breakdown logs | Real provider/live p95 only if deployed URLs, credentials, and sample images are available |

## Targets

- Single-label total latency: p95 under 5 seconds for reasonable label images.
- Image preprocessing: p95 under 300 ms.
- Vision/provider time: p95 under 4300 ms.
- Comparison time: p95 under 50 ms.
- Non-provider endpoint overhead: p95 under 500 ms.
- Tap targets: at least 44 by 44 CSS pixels.
- Minimum readable font size: 18 px for primary workflow controls and text; no critical text below 16 px.
- Contrast: WCAG AA, at least 4.5:1 for normal text and 3:1 for large text and UI indicators.
- Batch concurrency: bounded, default limit 3.

## Required Local Commands

Backend:

```bash
cd /Users/micdrop/Documents/FedStack/Capstone/backend
.venv/bin/python -m ruff check app
.venv/bin/python -m pytest
```

Frontend:

```bash
cd /Users/micdrop/Documents/FedStack/Capstone/frontend
npm run typecheck
npm test
npm run build
```

Live verification remains pending unless a deployed frontend URL, deployed backend URL,
`OPENAI_API_KEY`, and sample label images are all available and tested.
