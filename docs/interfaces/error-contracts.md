# Error Contracts

All top-level public API errors use this envelope:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Application data must be valid JSON.",
    "details": {
      "field": "application_data"
    }
  }
}
```

Rules:

- `message` is plain English and safe to show in the UI.
- `code` is stable enough for frontend branching.
- `details` contains only safe field-level context.
- Errors must not expose stack traces, provider internals, API keys, local paths, raw image bytes, or
  raw unhandled exception text.

Current top-level codes:

- `bad_request`
- `validation_error`
- `unsupported_file_type`
- `file_too_large`
- `vision_timeout`
- `vision_quota_exceeded`
- `vision_unavailable`
- `extraction_failed`
- `internal_error`

Batch item errors use the same safe fields, but item errors are embedded directly under
`items[].error` instead of wrapped in the top-level envelope.
