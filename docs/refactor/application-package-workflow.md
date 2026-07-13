# Application Package Workflow Contract

Phase: 8A - Application Package Workflow Contract And Demo Data

Status: contract only. This document does not change backend or frontend behavior. It defines the durable workflow target for a later implementation phase.

## Purpose

The package workflow lets a reviewer upload one or more application packages. Each package contains:

- one label image,
- one JSON file,
- an `image_filename` value in the JSON that names the matching image file,
- seven canonical application fields under `application_data`.

The frontend pairs JSON to image by filename, pre-populates read-only application values from JSON, sends data to the backend for verification, lets the reviewer edit AI/vision extracted values, and exports reviewed results as JSON.

## Canonical Fields

Every application input, extracted-data object, reviewed-data object, comparison payload, and export must use exactly these seven field names:

```text
brand_name
class_type
abv
net_contents
producer
country_of_origin
government_warning
```

Do not introduce API or model aliases such as `alcohol_content`, `producer_name_address`, or camelCase variants.

## Application Input JSON Schema

Each application JSON file must contain only `image_filename` and `application_data`. `application_data` must contain all seven canonical fields and no extra fields.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TTB Label Verification Application Package Input",
  "type": "object",
  "additionalProperties": false,
  "required": ["image_filename", "application_data"],
  "properties": {
    "image_filename": {
      "type": "string",
      "minLength": 1,
      "description": "Exact filename of the matching uploaded label image."
    },
    "application_data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "brand_name",
        "class_type",
        "abv",
        "net_contents",
        "producer",
        "country_of_origin",
        "government_warning"
      ],
      "properties": {
        "brand_name": { "type": "string" },
        "class_type": { "type": "string" },
        "abv": { "type": "string" },
        "net_contents": { "type": "string" },
        "producer": { "type": "string" },
        "country_of_origin": { "type": "string" },
        "government_warning": { "type": "string" }
      }
    }
  }
}
```

Empty strings are invalid for reviewer workflow purposes even though the schema only expresses string shape. Later implementation tests must reject blank or whitespace-only canonical field values with readable validation errors.

## Image Pairing Rule

Pairing is by filename, not upload order.

1. The frontend reads all uploaded JSON files and label image filenames.
2. For each JSON file, `image_filename` must exactly match one uploaded image file basename.
3. Matching is case-sensitive and extension-sensitive.
4. The same `image_filename` may appear in only one JSON file in the uploaded set.
5. JSON files without a matching image and images without a matching JSON are validation errors.
6. Only JPG, JPEG, PNG, and WEBP images are supported for this workflow.

The package pairing rule is a frontend workflow rule. It does not change the current `/verify/batch` multipart API pairing contract until a later API contract phase explicitly changes that endpoint.

## Internal Frontend Application Record Shape

The frontend should normalize each valid package into one application record. Field names that mirror API/domain data remain snake_case.

```ts
type VisibleStatus = "Pending Check" | "Approved" | "Needs Review";

type ApplicationData = {
  brand_name: string;
  class_type: string;
  abv: string;
  net_contents: string;
  producer: string;
  country_of_origin: string;
  government_warning: string;
};

type ExtractedData = {
  brand_name: string | null;
  class_type: string | null;
  abv: string | null;
  net_contents: string | null;
  producer: string | null;
  country_of_origin: string | null;
  government_warning: string | null;
};

type ApplicationPackageRecord = {
  package_id: string;
  json_filename: string;
  image_filename: string;
  image_file: File;
  image_preview_url: string;
  application_data: ApplicationData;
  original_extracted_data: ExtractedData | null;
  reviewed_extracted_data: ExtractedData | null;
  comparison_result: VerificationResult | null;
  status: VisibleStatus;
  validation_errors: PackageValidationError[];
};
```

`application_data` is read-only in the detail view because it represents the submitted application record. `reviewed_extracted_data` is editable by the reviewer because it represents corrected AI/vision output.

## Extracted Data Shape

Vision extraction and reviewer-edited extracted values use the same nullable shape:

```json
{
  "brand_name": "EVERGREEN AMBER BOURBON",
  "class_type": "Kentucky Straight Bourbon Whiskey",
  "abv": "45% Alc./Vol. (90 Proof)",
  "net_contents": "750 mL",
  "producer": "Evergreen Spirits LLC, Louisville, KY",
  "country_of_origin": "United States",
  "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
}
```

Unknown or unclear extracted fields must be `null`, not guessed. The government warning must be copied verbatim whenever possible.

## Reviewed Export JSON Shape

The export/download file should contain enough information for a reviewer to audit what was uploaded, what the model found, what was edited, and what the backend comparison returned.

```json
{
  "schema_version": "application-package-review-v1",
  "generated_at": "2026-06-20T00:00:00.000Z",
  "summary": {
    "passed": 1,
    "needs_review": 0,
    "pending": 1,
    "total": 2
  },
  "applications": [
    {
      "application_id": "application-1",
      "json_filename": "evergreen-amber-bourbon.application.json",
      "image_filename": "evergreen-amber-bourbon.png",
      "status": "Approved",
      "application_data": {
        "brand_name": "EVERGREEN AMBER BOURBON",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750 mL",
        "producer": "Evergreen Spirits LLC, Louisville, KY",
        "country_of_origin": "United States",
        "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
      },
      "reviewed_extracted_data": {
        "brand_name": "Evergreen Amber Bourbon",
        "class_type": "Kentucky Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750 mL",
        "producer": "Evergreen Spirits LLC, Louisville, KY",
        "country_of_origin": "United States",
        "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
      },
      "field_results": [
        {
          "field": "brand_name",
          "match_type": "fuzzy",
          "expected": "EVERGREEN AMBER BOURBON",
          "found": "Evergreen Amber Bourbon",
          "status": "PASS",
          "message": "Values match after fuzzy normalization."
        }
      ],
      "overall_verdict": "APPROVED",
      "errors": []
    },
    {
      "application_id": "application-2",
      "json_filename": "northstar-riesling.application.json",
      "image_filename": "northstar-riesling.png",
      "status": "Pending Check",
      "application_data": {
        "brand_name": "NORTHSTAR RIESLING",
        "class_type": "White Wine",
        "abv": "12.5% Alc./Vol.",
        "net_contents": "750 mL",
        "producer": "Northstar Cellars, Traverse City, MI",
        "country_of_origin": "United States",
        "government_warning": "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
      },
      "reviewed_extracted_data": null,
      "field_results": [],
      "overall_verdict": null,
      "errors": []
    }
  ]
}
```

Exported files must not include raw image data, local absolute paths, API keys, provider internals, or stack traces. Pending applications must use `status` of `Pending Check`, `reviewed_extracted_data` of `null`, empty `field_results`, and `overall_verdict` of `null`.

Reviewer field decisions are sent to the backend `/compare` endpoint as optional `field_decisions` values. Supported decisions are `pass` and `fail`. The backend applies those decisions after running comparison and returns the updated `VerificationResult`; the frontend must use that backend response for displayed field status and exported field results.

## Visible Statuses

Application records use only these visible statuses:

- `Pending Check`: the package is valid and has not received a backend comparison result yet.
- `Approved`: the latest backend comparison result has `overall_verdict` equal to `APPROVED`.
- `Needs Review`: the latest backend comparison result has `overall_verdict` equal to `NEEDS_REVIEW`, or the item has a readable item-level processing error.

Package import validation errors should be shown as blocking upload errors. Invalid packages should not be silently converted to `Pending Check`.

## Validation Errors

Package validation must produce readable, safe messages. Use stable codes for branching.

| Code | Condition | Message guidance |
| --- | --- | --- |
| `invalid_json` | A JSON file cannot be parsed as JSON. | "This application JSON could not be read." |
| `missing_image_filename` | The JSON object has no `image_filename` value. | "The application JSON is missing image_filename." |
| `missing_application_data` | The JSON object has no `application_data` object. | "The application JSON is missing application_data." |
| `missing_canonical_fields` | `application_data` lacks one or more of the seven canonical fields. | Include the missing field names. |
| `extra_non_canonical_fields` | `application_data` includes fields outside the seven canonical fields. | Include the extra field names. |
| `duplicate_image_filename` | More than one JSON file names the same image filename. | Include the duplicate filename. |
| `json_with_no_matching_image` | A JSON file names an image not present in the upload set. | Include the expected image filename. |
| `image_with_no_matching_json` | An uploaded image has no JSON file naming it. | Include the image filename. |
| `unsupported_image_type` | An image is not JPG, JPEG, PNG, or WEBP. | "Please upload a JPG, PNG, or WEBP label image." |

Validation errors must not expose local absolute paths, raw file contents, stack traces, or provider internals.

## API Usage Rules

- Use `POST /verify` for one valid application package.
- Use `POST /verify/batch` for multiple valid application packages.
- The frontend owns package validation and filename pairing before sending requests.
- When using the current `/verify/batch` API, the frontend must submit already-paired images and `application_data` parts in matching order because the existing API contract is order-based.
- `POST /compare` accepts `application_data` plus reviewer-edited extracted values and returns backend comparison results without calling vision extraction.
- Do not implement frontend comparison logic. The frontend may display backend results and collect reviewer edits, but backend comparison remains authoritative.

## Backend Comparison Ownership

All comparison logic belongs to the backend. This includes normalization, fuzzy comparison, ABV parsing, net contents parsing, country synonyms, exact government warning comparison, field PASS/FAIL results, and final verdict rules.

The frontend must not reimplement pass/fail rules for edited extracted values. After reviewer edits, the frontend must call `/compare` and display the backend response.

## Views

Overview view:

- shows uploaded valid applications,
- shows each package's `image_filename`,
- shows visible status,
- highlights packages needing review,
- provides an export/download action for reviewed results JSON.

Detail view:

- shows a large label image,
- shows read-only application values,
- shows editable extracted values after vision extraction,
- shows backend comparison results,
- lets the reviewer return to the overview.

## Later Phase Test Requirements

Later implementation phases must add tests for:

- valid package import with filename-based JSON/image pairing,
- package order changes not changing JSON/image pairing,
- invalid JSON,
- missing `image_filename`,
- missing `application_data`,
- missing canonical fields,
- extra non-canonical fields,
- duplicate `image_filename`,
- JSON with no matching image,
- image with no matching JSON,
- unsupported image type,
- read-only application fields in the detail view,
- editable extracted fields in the detail view,
- Overview status transitions from `Pending Check` to `Approved` or `Needs Review`,
- `/verify` usage for one application package,
- `/verify/batch` usage for multiple valid packages,
- `/compare` usage after reviewer edits,
- export JSON shape and summary counts.

## Demo Data

Synthetic demo fixtures live in:

- `demo-data/inputs/`
- `demo-data/outputs/`

The demo fixtures are not real alcohol labels and must not be treated as official TTB records.
