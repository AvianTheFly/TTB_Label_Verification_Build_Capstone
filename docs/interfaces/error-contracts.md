# Error Contracts

All public API errors use the same envelope.

```json
{
  "error": {
    "code": "bad_request",
    "message": "Please upload a JPG or PNG label image.",
    "details": {}
  }
}
```

## Rules

- `message` must be plain English and safe to show in the UI.
- `code` must be stable enough for frontend branching.
- `details` may contain safe field-level context.
- Do not expose stack traces, provider internals, API keys, local paths, raw images, or raw unhandled exceptions.

## Initial Codes

- `bad_request`
- `validation_error`
- `unsupported_file_type`
- `file_too_large`
- `vision_timeout`
- `vision_quota_exceeded`
- `vision_unavailable`
- `extraction_failed`
- `internal_error`
