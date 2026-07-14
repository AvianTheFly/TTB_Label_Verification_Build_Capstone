# API Contracts

Public API fields use snake_case. Application data uses exactly these seven canonical fields:

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

Provider credentials and provider selection are backend configuration only. The frontend must never
send API keys, model names, or real-vs-mock flags.

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

Request: `multipart/form-data`

- `image`: JPG, PNG, or WEBP label image.
- `application_data`: JSON string containing the seven canonical fields.

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
  "latency_ms": 1240,
  "extracted_formatting": {
    "government_warning_lead_in_bold": true
  }
}
```

Rules:

- `status` is `PASS` or `FAIL`.
- `overall_verdict` is `APPROVED` only when all fields pass.
- Any field failure returns `NEEDS_REVIEW`.
- Failure results include `expected` and `found` values whenever available.
- Government warning text comparison is exact and case-sensitive after whitespace collapse.
- Government warning failures include the extracted warning text in `found`.
- If best-effort style extraction explicitly reports `government_warning_lead_in_bold=false`, the
  `government_warning` field fails.
- If warning style is unknown, text can pass and the message states that bold styling was not
  confirmed automatically.
- `extracted_formatting` carries optional style evidence from extraction or reviewer edits. It is
  separate from the seven canonical application fields.

## `POST /verify/batch`

Request: `multipart/form-data`

- `images`: repeated label image file parts.
- `application_data`: repeated JSON string parts containing the seven canonical fields.

Items are matched by multipart order: first image with first application data, second with second,
and so on. The frontend submits complete ordered pairs.

Success response:

```json
{
  "items": [
    {
      "index": 0,
      "result": {
        "results": [],
        "overall_verdict": "APPROVED",
        "latency_ms": 1240,
        "extracted_formatting": {
          "government_warning_lead_in_bold": true
        }
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

- Batch processing uses bounded concurrency.
- One missing, invalid, or failed item does not fail the whole batch.
- Each item contains either `result` or `error`.
- Item-level errors are safe plain-English objects, not top-level error envelopes.
- `summary.passed` counts `APPROVED` results.
- `summary.needs_review` counts `NEEDS_REVIEW` results plus item-level errors.
- `summary.total` equals `items.length`.

## `POST /extract`

Request: `multipart/form-data`

- `image`: JPG, PNG, or WEBP label image.

Success response:

```json
{
  "brand_name": "Old Tom Distillery",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol. (90 Proof)",
  "net_contents": "750ml",
  "producer": "OLD TOM DISTILLERY, LOUISVILLE KY",
  "country_of_origin": "USA",
  "government_warning": "GOVERNMENT WARNING: Visible text.",
  "government_warning_lead_in_bold": true,
  "raw_text": null,
  "extraction_confidence": null
}
```

Rules:

- `/extract` preprocesses the image and calls the configured `VisionService`.
- `/extract` does not accept application data and does not compare fields.
- Unknown or unclear text fields are `null`, not guessed.
- `government_warning_lead_in_bold` is best-effort style evidence and may be `true`, `false`, or
  `null`.

## `POST /compare`

Request: `application/json`

- `application_data`: JSON object containing the seven canonical application fields.
- `extracted_data`: JSON object containing the seven canonical extracted text fields.
- `extracted_formatting`: optional style evidence for the extracted label text.
- `field_decisions`: optional reviewer overrides by canonical field. Values are `pass` or `fail`.

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
  "latency_ms": 12,
  "extracted_formatting": {
    "government_warning_lead_in_bold": true
  }
}
```

Rules:

- `/compare` does not accept images and does not call the vision service.
- Backend comparison remains the sole owner of PASS/FAIL logic.
- The frontend must not reimplement fuzzy matching, ABV parsing, net-content parsing, country
  synonyms, exact warning comparison, or verdict rules.
- Reviewer decisions apply after backend comparison.
- Extra fields and unknown decision values are invalid.
- Reviewer-edited warning bold state is sent in `extracted_formatting`, not inside `extracted_data`.
