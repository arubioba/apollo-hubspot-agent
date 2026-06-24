# ARA 0.1 Safety Baseline

## Summary

Phase A1 adds a safety layer around the existing Apollo to HubSpot flow without extracting connectors or changing the commercial workflow.

Implemented controls:

- Correlation IDs.
- Structured JSON logging.
- Secret and PII redaction.
- Safe environment validation.
- Temporary internal admin authentication.
- `ARA_WRITE_MODE`.
- Typed/classified errors.
- Characterization tests.

## Correlation IDs

Every protected API request receives a correlation ID.

Sources:

1. Incoming `X-Correlation-ID` if it is a valid UUID.
2. Incoming `X-Request-ID` if it is a valid UUID.
3. Generated UUID.

The response includes:

- Header: `X-Correlation-ID`
- Body: `correlationId`

Import runs store `correlation_id` in `import_runs` through an idempotent migration:

```sql
ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS correlation_id text;
```

## Write Modes

`ARA_WRITE_MODE=disabled | preview | enabled`

### disabled

- Blocks HubSpot writes.
- Logs `authorization.denied`.
- Returns a safe blocked-write error.

### preview

- Builds planned contact/company properties.
- Does not call HubSpot write endpoints.
- Does not increment final import counters.

### enabled

- Preserves current write behavior.
- Must not be used in tests.
- Should be used only with valid internal auth and controlled environment.

## Rollback

To return to the previous write behavior:

1. Set `ARA_WRITE_MODE=enabled`.
2. Keep `X-ARA-Admin-Token` configured.
3. Redeploy previous Railway deployment if needed.

The new DB column is additive and does not break existing rows.

## A2 HTTP Testability

The HTTP app is now created by `createApp()` in `src/app.js`.

- Importing `src/app.js` does not open a port.
- `src/server.js` owns startup, listener, DB initialization and shutdown.
- Tests call the Express app in memory without an external listener.
- Public errors use `{ error: { code, message }, correlation_id }`.
- `/health` returns only non-sensitive service metadata.

## A3 Endpoint Hardening

- `/api/audit/latest-import` exposes only a sanitized run summary.
- `/api/import-runs/:runId/candidates` exposes the protected, paginated commercial candidate view.
- Diagnostics are disabled by default through `ARA_DIAGNOSTICS_ENABLED=false`.
- JSON API writes reject wrong content type, invalid JSON and oversized payloads with safe errors.
- Temporary in-memory rate limiting protects user-triggered and Apollo-consuming endpoints; it is not distributed.
- The UI understands the structured error contract and continues to show operational candidate data.

See:

- `docs/http-endpoint-security.md`
- `docs/data-exposure-policy.md`
- `docs/diagnostics-policy.md`
- `docs/http-api-contracts.md`
