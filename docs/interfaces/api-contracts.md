# API Contracts

This document defines the public API shapes expected across the backend and frontend. It should be updated in the same phase as any contract-changing code.

## Canonical Fields

All request and response objects use these exact field names:

```json
{
  "brand_name": "OLD TOM DISTILLERY",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol. (90 Proof)",
  "net_contents": "750 mL",
  "producer": "Old Tom Distillery, Louisville, KY",
  "country_of_origin": "United States",
  "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
}
```

## `GET /health`

Response:

```json
{
  "status": "ok",
  "service": "ttb-label-verification",
  "version": "0.1.0"
}
```

## `POST /verify`

Phase: 3.

Request: `multipart/form-data`

- `image`: label image file.
- `application_data`: JSON string containing the canonical fields.

Success response:

```json
{
  "results": [
    {
      "field": "brand_name",
      "match_type": "fuzzy",
      "expected": "OLD TOM DISTILLERY",
      "found": "Old Tom Distillery",
      "status": "PASS",
      "message": "Values match after normalization."
    }
  ],
  "overall_verdict": "APPROVED",
  "latency_ms": 1240
}
```

Rules:

- `status` is `PASS` or `FAIL`.
- `overall_verdict` is `APPROVED` only when all fields pass.
- Any field failure returns `NEEDS_REVIEW`.
- Failure results include expected and found values whenever available.
- Government warning failures must include the extracted warning text in `found`.
- The API contract requires exact warning-text comparison. If warning styling detection is added later, document the optional evidence field before implementation; do not change the required seven-field application-data contract casually.

## `POST /verify/batch`

Phase: 5.

Request: `multipart/form-data` containing multiple image and application-data pairs. The exact encoding should be finalized in Phase 5 and documented here before implementation.

Success response:

```json
{
  "items": [],
  "summary": {
    "passed": 0,
    "needs_review": 0,
    "total": 0
  }
}
```

Rules:

- One bad item must not fail the whole batch.
- Each item must contain either a verification result or a readable per-item error.
- Concurrency must be bounded.
