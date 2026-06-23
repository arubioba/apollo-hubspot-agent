# Railway Staging Strategy For ARA

## Current Service

The current app is deployed on Railway from GitHub using:

- `Dockerfile`
- `railway.toml`
- `npm start`
- `/health` healthcheck

Production should remain intact until ARA 0.1 is validated in staging.

## Recommended Railway Layout

Services:

- `apollo-hubspot-agent-production`: current production.
- `ara-staging`: staging service from `develop` or feature branch.
- `ara-staging-postgres`: staging database.

Future:

- `ara-production`
- `ara-production-postgres`

## Environment Variables

Shared variable names:

- `DATABASE_URL`
- `APOLLO_API_KEY` or tenant-specific secret references
- `HUBSPOT_PRIVATE_APP_TOKEN` or tenant-specific secret references
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `APPROVAL_CODE` during transition only
- `TZ`
- `DAILY_IMPORT_LIMIT`
- `TEST_BATCH_SIZE`
- `APOLLO_API_BASE`
- `HUBSPOT_API_BASE`

Environment-specific values:

- Database URL.
- Apollo key.
- HubSpot token.
- Approval/role configuration.
- Feature flags.
- Tenant credential references.

## Staging Database

Staging must use a separate PostgreSQL database.

Rules:

- No production data copy unless sanitized.
- No shared `DATABASE_URL`.
- Tenant isolation tests run against staging.
- Migrations run in staging before production.

## Migration Process

ARA should move from runtime `CREATE TABLE IF NOT EXISTS` toward versioned migrations.

Recommended process:

1. Add migration tooling in a later implementation issue.
2. Run migrations in staging.
3. Verify healthcheck and smoke tests.
4. Backup production before promotion.
5. Run production migrations during controlled window.

## Health Checks

Current:

- `/health`

Recommended split:

- `/health/live`: process alive.
- `/health/ready`: DB and required configuration ready.
- `/api/diagnostics/*`: protected, not public.

## Rollback

Rollback strategy:

- Keep previous Railway deployment available.
- Use feature flags to disable ARA modules.
- Avoid irreversible HubSpot writes in staging.
- In production, rollback code first and use audit trail for data reversal if needed.

## Logs

Minimum log fields:

- timestamp
- level
- environment
- tenant_id
- run_id
- correlation_id
- service
- action
- provider
- result
- sanitized error code

Do not log raw secrets, full tokens or unneeded PII.

## Feature Flags

Initial flags:

- `ara.discovery.enabled`
- `ara.hubspot_sync.enabled`
- `ara.ara_leads.enabled`
- `ara.static_snapshot_lists.enabled`
- `ara.multitenancy.enabled`
- `ara.latenode.enabled`
- `ara.engagement.enabled=false`

## Promotion Conditions

Promote staging to production only when:

- Existing tests pass.
- Connector contract tests pass.
- Tenant isolation tests pass.
- HubSpot sandbox/control test validates `ARA_Leads`.
- Rollback plan is documented.
- Commercial Approver approves production writes.
- No secrets are present in repo or logs.

