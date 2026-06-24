# Environment Variables

## Required Secrets

| Variable | Classification | Description |
|---|---|---|
| `DATABASE_URL` | Required, Secret, Environment-specific | PostgreSQL connection string |
| `APOLLO_API_KEY` | Required, Secret, Environment-specific | Apollo API key |
| `HUBSPOT_PRIVATE_APP_TOKEN` | Required alternative, Secret, Environment-specific | Preferred HubSpot private app token |
| `HUBSPOT_ACCESS_TOKEN` | Required alternative, Secret, Environment-specific | Compatibility fallback |
| `OPENAI_API_KEY` | Required, Secret, Environment-specific | OpenAI API key |
| `APPROVAL_CODE` | Required, Secret, Environment-specific | Legacy high-volume approval code |
| `ARA_ADMIN_TOKEN` | Required, Secret, Environment-specific | Temporary internal admin token |

## Optional Non-secrets

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `staging`, `production` |
| `PORT` | `3000` | HTTP port |
| `OPENAI_MODEL` | `gpt-4.1-mini` | OpenAI model |
| `ARA_DEFAULT_TENANT_ID` | `freelan` | Internal MVP tenant context; future tenant onboarding will replace this |
| `ARA_WRITE_MODE` | `disabled` | `disabled`, `preview`, `enabled` |
| `ARA_EXTERNAL_SERVICES_MODE` | `mock` | Service intent: `mock`, `sandbox`, `live`; runtime switching is deferred to Connector Extraction |
| `ARA_DIAGNOSTICS_ENABLED` | `false` | Enables protected technical diagnostics when explicitly set to `true` |
| `ARA_RATE_LIMIT_ENABLED` | `true` | Enables temporary local in-memory HTTP rate limiting |
| `ARA_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in milliseconds |
| `ARA_RATE_LIMIT_MAX_REQUESTS` | `60` | Max requests per window per local key |
| `ARA_MAX_BODY_BYTES` | `262144` | Max JSON body size for JSON API endpoints |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `TZ` | `America/Mexico_City` | Daily counter timezone |
| `DAILY_IMPORT_LIMIT` | `50` | Final imports per day |
| `TEST_BATCH_SIZE` | `5` | Preview/test batch size |
| `APOLLO_API_BASE` | Apollo default | Apollo base URL |
| `HUBSPOT_API_BASE` | HubSpot default | HubSpot base URL |

## Test Safety

`ARA_WRITE_MODE=enabled` is invalid when `NODE_ENV=test`.

Automated tests must not use real credentials, Apollo credits or HubSpot writes.

Diagnostics are disabled by default in every environment. Rate limiting is local and not distributed; use Redis or another shared store before multiple instances or tenants.

## Staging Defaults

Use these defaults for the first isolated Railway staging environment:

```text
NODE_ENV=staging
ARA_WRITE_MODE=disabled
ARA_DEFAULT_TENANT_ID=freelan
ARA_EXTERNAL_SERVICES_MODE=mock
ARA_DIAGNOSTICS_ENABLED=false
ARA_RATE_LIMIT_ENABLED=true
```

Do not use production credentials or production data in staging.

## Resumen Operativo

Para staging inicial, usa `ARA_EXTERNAL_SERVICES_MODE=mock` y `ARA_WRITE_MODE=disabled`. No cargues credenciales productivas ni datos reales de clientes.
