# Diagnostics Policy

Diagnostics are technical debugging endpoints. They are not the ARA commercial console.

## Default

`ARA_DIAGNOSTICS_ENABLED=false`

When disabled, diagnostic endpoints are blocked and return a sanitized error. This must not block:

- `/health`
- Normal agent operation.
- Run queries.
- Candidate queries.
- Commercial approval workflows.

## Environments

| Environment | Default | Requirement |
|---|---|---|
| `development` | Disabled | May be enabled explicitly. |
| `test` | Disabled | May be enabled explicitly in tests. |
| `staging` | Disabled | Must require auth when enabled. |
| `production` | Disabled | Must require auth when enabled. |

## Returned Data

Diagnostics return only provider, status and checked timestamp. They must not return tokens, headers, raw provider responses, account details, stack traces or configuration inventories.

