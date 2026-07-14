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

Provider selection and credentials are backend configuration only. The frontend must never send API keys, model names, or real-vs-mock provider flags. Production uses the environment-configured vision provider; automated tests inject a mocked `VisionService`.

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

## `POST /extract`

Phase: 5/6 repair.

Request: `multipart/form-data`

- `image`: label image file.

Provider selection and credentials are backend configuration only. The frontend must never send API keys, model names, or real-vs-mock provider flags.

Success response:

```json
{
  "brand_name": "Old Tom Distillery",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol. (90 Proof)",
  "net_contents": "750ml",
  "producer": "OLD TOM DISTILLERY, LOUISVILLE KY",
  "country_of_origin": "USA",
  "government_warning": "GOVERNMENT WARNING: Test warning text.",
  "raw_text": null,
  "extraction_confidence": null
}
```

Rules:

- `/extract` runs image preprocessing and the configured `VisionService`.
- `/extract` does not accept application data and does not compare fields.
- Unknown or unclear fields are `null`, not guessed.
- Public extracted field names remain the canonical snake_case fields.

## `POST /compare`

Phase: 8B.

Request: `application/json`

- `application_data`: JSON object containing the seven canonical application fields.
- `extracted_data`: JSON object containing the seven canonical extracted fields. Values may be strings or `null`; missing fields and extra fields are invalid.
- `field_decisions`: optional JSON object containing reviewer overrides by canonical field. Values must be `pass` or `fail`.

Request body:

```json
{
  "application_data": {
    "brand_name": "OLD TOM DISTILLERY",
    "class_type": "Kentucky Straight Bourbon Whiskey",
    "abv": "45% Alc./Vol. (90 Proof)",
    "net_contents": "750 mL",
    "producer": "Old Tom Distillery, Louisville, KY",
    "country_of_origin": "United States",
    "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  },
  "extracted_data": {
    "brand_name": "Old Tom Distillery",
    "class_type": "Kentucky Straight Bourbon Whiskey",
    "abv": "45% Alc./Vol. (90 Proof)",
    "net_contents": "750ml",
    "producer": "OLD TOM DISTILLERY, LOUISVILLE KY",
    "country_of_origin": "USA",
    "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  },
  "field_decisions": {
    "brand_name": "pass",
    "government_warning": "fail"
  }
}
```

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
      "message": "Values match after fuzzy normalization."
    }
  ],
  "overall_verdict": "APPROVED",
  "latency_ms": 12
}
```

Rules:

- `/compare` does not accept images and does not call the vision service.
- `/compare` exists for reviewer-edited extracted values after initial vision extraction.
- The backend remains the sole owner of comparison logic. The frontend must not reimplement PASS/FAIL, normalization, fuzzy comparison, ABV parsing, net contents parsing, country synonyms, exact government warning comparison, or verdict rules.
- `extracted_data` must use exactly the seven canonical fields. Provider metadata such as `raw_text` or confidence scores is not accepted by this endpoint.
- `field_decisions` is optional and may include any subset of the seven canonical fields. Extra fields and unknown decision values are invalid.
- Reviewer decisions are applied after backend comparison. `pass` forces that field result to `PASS`; `fail` forces that field result to `FAIL` with a reviewer-decision message.
- `overall_verdict` is `APPROVED` only when all fields pass.
- Any field failure returns `NEEDS_REVIEW`.
- Government warning failures must include the submitted extracted warning text in `found`; if the reviewer submits `null`, `found` is `null`.

## `POST /verify/batch`

Phase: 5.

Request: `multipart/form-data`

- `images`: repeated label image file parts.
- `application_data`: repeated JSON string parts containing the canonical fields.

Frontend note: users upload label images only. The frontend creates these `application_data` parts from the editable application-data inputs; users do not upload application JSON files.

Provider selection and credentials are backend configuration only. The frontend must never send API keys, model names, or real-vs-mock provider flags. Production uses the environment-configured vision provider; automated tests inject a mocked `VisionService`.

Pairing rule:

- Items are paired by the order of provided multipart parts.
- The first provided `images` part is verified with the first provided `application_data` part.
- The second provided `images` part is verified with the second provided `application_data` part, and so on.
- The frontend should submit only complete rows, with one image and one application-data object for each label.
- If the counts differ, trailing unpaired parts return item-level errors. For example, a third `application_data` part with only two `images` parts returns an item-level missing-image error for index `2`.
- Because this simple multipart shape has no explicit item ID, a missing middle item cannot be represented reliably unless a caller sends a placeholder or invalid part at that position. This is acceptable for the MVP because the frontend owns request construction.
- One missing or bad item does not fail the whole batch.
- An empty batch or a request that cannot be parsed as the batch envelope returns the normal top-level error envelope from `docs/interfaces/error-contracts.md`.

Success response:

```json
{
  "items": [
    {
      "index": 0,
      "result": {
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
      },
      "error": null
    },
    {
      "index": 1,
      "result": null,
      "error": {
        "code": "unsupported_file_type",
        "message": "Please upload a JPG, PNG, or WEBP label image.",
        "details": {
          "field": "image"
        }
      }
    }
  ],
  "summary": {
    "passed": 1,
    "needs_review": 1,
    "total": 2
  }
}
```

Rules:

- One bad item must not fail the whole batch.
- Each item must contain exactly one of:
  - `result`: a full `VerificationResult`, including per-item `latency_ms`.
  - `error`: a readable per-item error object.
- Item-level errors use `{ "code": string, "message": string, "details": object }`. They are not wrapped in the top-level `{ "error": ... }` envelope.
- `summary.passed` counts items with `overall_verdict` of `APPROVED`.
- `summary.needs_review` counts `NEEDS_REVIEW` results plus item-level errors.
- `summary.total` equals `items.length`.
- Concurrency must be bounded. Batch total latency may exceed 5 seconds for larger batches; bounded concurrency protects provider stability, cost/rate limits, and per-item latency while the frontend progress state makes longer processing obvious.
