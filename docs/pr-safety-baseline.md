# Pull Request Plan: Safety Baseline

## Target

From: `feature/ara-safety-baseline`  
To: `develop`

Do not merge until review gates are approved.

## Purpose

Close the ARA 0.1 Safety Baseline before staging and Connector Extraction. The PR makes the current Apollo to HubSpot system safer, testable, auditable, and ready for isolated Railway staging.

## Context

ARA will evolve into a multi-agent revenue platform. This PR protects the current internal tool before adding connectors, agents, scoring, approvals, and future multi-tenant behavior.

## Summary By Phase

### A1 Safety Baseline

- Internal API auth.
- Write guard with `ARA_WRITE_MODE`.
- Correlation ID.
- Structured logs and sanitization.
- Typed errors.
- Safe config validation.

### A2 HTTP Application Testability

- `createApp()` extracted from listener.
- `src/server.js` owns startup and shutdown.
- HTTP tests run in memory.
- Public error contract introduced.

### A3 Endpoint Hardening

- Diagnostics disabled by default.
- Audit endpoint sanitized.
- Candidate endpoint separated and paginated.
- JSON content-type and body validation.
- Temporary local rate limiting.
- UI updated for structured errors and candidate visibility.

### A4 Staging Readiness

- `develop` integration branch strategy.
- `ARA_EXTERNAL_SERVICES_MODE` documented and validated.
- Mock staging smoke script.
- Railway staging runbook.
- Rollback and Connector Extraction entry gate.

## Contract Changes

- API errors:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe public message."
  },
  "correlation_id": "uuid"
}
```

- Audit summary:

```json
{
  "found": true,
  "run": {
    "id": "run-id",
    "correlation_id": "uuid",
    "status": "complete",
    "candidate_count": 5,
    "accepted_count": 4,
    "rejected_count": 1,
    "error_count": 1
  }
}
```

- Candidate operations:

`GET /api/import-runs/:runId/candidates?page=1&page_size=25`

## New Variables

- `ARA_ADMIN_TOKEN`
- `ARA_WRITE_MODE`
- `ARA_EXTERNAL_SERVICES_MODE`
- `ARA_DIAGNOSTICS_ENABLED`
- `ARA_RATE_LIMIT_ENABLED`
- `ARA_RATE_LIMIT_WINDOW_MS`
- `ARA_RATE_LIMIT_MAX_REQUESTS`
- `ARA_MAX_BODY_BYTES`
- `LOG_LEVEL`

## Migration

`import_runs.correlation_id` is added idempotently:

```sql
ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS correlation_id text;
```

## Validation

Required before merge:

```bash
npm run lint
npm test
npm run check
npm run smoke:staging
```

Expected current status:

- 44 automated tests pass.
- Staging smoke test passes with mock dependencies.
- No real Apollo calls.
- No real HubSpot writes.
- No Railway deployment.

## Rollback

Code:

- Revert PR or redeploy previous Railway build.

Database:

- Column is additive and nullable.
- If rollback requires removal after backup:

```sql
ALTER TABLE import_runs DROP COLUMN IF EXISTS correlation_id;
```

Configuration:

- Restore previous variables.
- Revoke `ARA_ADMIN_TOKEN` if exposed.
- Keep `ARA_WRITE_MODE=disabled` during incident review.

## Review Checklist

- [ ] No secrets committed.
- [ ] Docs are tracked.
- [ ] `/health` contract accepted.
- [ ] Protected API auth accepted.
- [ ] Audit/candidate endpoint split accepted.
- [ ] Staging runbook approved.
- [ ] Rollback plan approved.
- [ ] Smoke test reproducible.

## Operational Summary (ES)

Este PR no debe ir directo a `main`. Primero debe revisarse contra `develop`, validar smoke test y confirmar que no hubo llamadas externas ni escrituras reales.

