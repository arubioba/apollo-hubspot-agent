# HTTP API Contracts

## Error Contract

All API errors should use:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe public message."
  },
  "correlation_id": "11111111-1111-4111-8111-111111111111"
}
```

The legacy flat shape is deprecated and should not be used for new endpoints.

## UI Requirements

`public/app.js` must:

- Show a clear public error message.
- Show the correlation ID for support.
- Avoid `[object Object]`.
- Avoid stack traces, tokens and raw technical payloads.
- Continue showing candidates and their commercial state through `/api/import-runs/:runId/candidates`.

## JSON Request Rules

For `POST /api/*` endpoints that expect JSON:

- `Content-Type: application/json` is required.
- Invalid JSON returns `INVALID_JSON`.
- Oversized JSON returns `PAYLOAD_TOO_LARGE`.
- Missing or invalid business fields return endpoint-specific validation errors.

This rule is not global. It does not apply to `GET`, `/health`, static files, or future multipart/PDF upload endpoints.

