# Railway Staging Runbook

## Goal

Create an isolated Railway staging environment for ARA without touching production resources.

Do not deploy until explicitly authorized.

## Proposed Architecture

- Service: `ara-staging-web`
- Database: separate Railway PostgreSQL staging instance.
- Runtime: same Node.js web process as current application.
- Workers: none for ARA 0.1 staging unless introduced later.
- Redis: not required yet.
- Domain: separate staging domain.
- Branch: deploy from `develop` after PR review.

## Required Isolation

Do not reuse:

- Production database.
- Production admin token.
- Production webhook URLs.
- Production HubSpot portal credentials unless explicitly authorized.
- Production Apollo credentials during first staging deploy.

## Initial Variables

```text
NODE_ENV=staging
ARA_WRITE_MODE=disabled
ARA_EXTERNAL_SERVICES_MODE=mock
ARA_DIAGNOSTICS_ENABLED=false
ARA_RATE_LIMIT_ENABLED=true
ARA_ADMIN_TOKEN=<staging-secret>
DATABASE_URL=<staging-postgres-url>
APOLLO_API_KEY=<mock-or-sandbox-placeholder>
HUBSPOT_PRIVATE_APP_TOKEN=<mock-or-sandbox-placeholder>
OPENAI_API_KEY=<mock-or-sandbox-placeholder>
APPROVAL_CODE=<staging-secret>
OPENAI_MODEL=gpt-4.1-mini
TZ=America/Mexico_City
DAILY_IMPORT_LIMIT=50
TEST_BATCH_SIZE=5
ARA_MAX_BODY_BYTES=262144
```

Do not invent real credentials. If the app requires variables to start before Connector Extraction, use explicit staging placeholders only with `ARA_EXTERNAL_SERVICES_MODE=mock` and `ARA_WRITE_MODE=disabled`.

## External Services Mode

`ARA_EXTERNAL_SERVICES_MODE=mock | sandbox | live`

### mock

- Intended initial staging mode.
- Must not call Apollo.
- Must not call HubSpot.
- Must not consume credits.
- Must not write records.
- Runtime switching is not implemented in A4; Connector Extraction will implement it.

### sandbox

- May use controlled Apollo/HubSpot accounts.
- Requires explicit approval.
- Starts with `ARA_WRITE_MODE=disabled` or `preview`.

### live

- Not allowed in A4.
- Requires later approval, valid credentials, stronger controls and Connector Extraction.

## Startup And Health

A4 keeps strict startup:

- Missing configuration prevents startup.
- Failed DB initialization prevents startup.
- `/health` is available only once the app process has started.

Future phase:

- Split liveness from readiness.
- Liveness: process is running.
- Readiness: config, DB and required dependencies are ready.

## Database Migration

The app initializes:

```sql
ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS correlation_id text;
```

Verification:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'import_runs'
  AND column_name = 'correlation_id';
```

Rollback after backup:

```sql
ALTER TABLE import_runs DROP COLUMN IF EXISTS correlation_id;
```

If the column already exists, migration is a no-op. If migration fails, do not proceed with staging validation; inspect Railway logs and DB connectivity.

## PII And Test Data

Tables with PII risk:

- `import_runs.candidates`
- `import_runs.test_results`
- `import_runs.final_results`

Do not copy production PII into staging. Use synthetic fixtures:

- Names: `Alicia Smoke`, `Bruno Example`
- Companies: `Smoke Example SA`
- Emails: `*@example.test`
- Phones: reserved or clearly fake values such as `+525500000001`

## Railway Log Checks

Search by:

- `correlation_id`
- `event`
- `level`
- `AUTHENTICATION_ERROR`
- `HUBSPOT_WRITE_BLOCKED`
- `DIAGNOSTICS_DISABLED`
- `RATE_LIMITED`
- `DATABASE_ERROR`

Events to inspect:

- Startup: `server.started`, `server.startup_failed`
- Shutdown: `server.stopping`, `server.stopped`
- Failed requests: `http.request.failed`
- Auth denied: `authorization.denied`
- Write blocked: `HUBSPOT_WRITE_BLOCKED` or `authorization.denied`
- Diagnostics blocked: `DIAGNOSTICS_DISABLED`
- Rate limits: `RATE_LIMITED`

## Rollback

Code:

- Redeploy previous Railway deployment.
- Revert PR if already merged into `develop`.

Database:

- Restore staging DB backup if needed.
- Drop `correlation_id` only after confirming no process depends on it.

Configuration:

- Set `ARA_WRITE_MODE=disabled`.
- Revoke staging `ARA_ADMIN_TOKEN`.
- Disable staging service if isolation is uncertain.

Operation:

- Confirm production was never touched.
- Confirm no external writes occurred.
- Preserve correlation IDs and logs for review.

## Operational Summary (ES)

Staging debe vivir separado de producción: otra DB, otro token, otro dominio y `ARA_WRITE_MODE=disabled`. Para el primer despliegue usar `ARA_EXTERNAL_SERVICES_MODE=mock`. No usar datos reales de clientes ni credenciales productivas hasta que se autorice sandbox/live.

