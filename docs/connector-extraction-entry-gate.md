# Connector Extraction Entry Gate

Do not start Connector Extraction until all gates are approved.

## Required Gates

| Gate | Status Required |
|---|---|
| Safety Baseline approved | Required |
| PR reviewed into `develop` | Required |
| Staging environment designed | Required |
| Staging DB separated from production | Required |
| Smoke tests defined and passing | Required |
| `ARA_WRITE_MODE=disabled` in staging | Required |
| `ARA_EXTERNAL_SERVICES_MODE=mock` or approved `sandbox` | Required |
| HTTP contracts stable | Required |
| Automated tests passing | Required |
| Secret scan clean | Required |
| No unintended commercial logic changes | Required |
| Rollback documented | Required |

## Connector Extraction Scope

Allowed after gate approval:

- Apollo Connector interface.
- HubSpot Connector interface.
- Mock connector implementations.
- Sandbox connector configuration.
- Connector-level contract tests.
- Explicit runtime selection based on `ARA_EXTERNAL_SERVICES_MODE`.

Not allowed without further approval:

- Multi-tenant credential store.
- RBAC.
- Engagement/email sending.
- Redis/distributed rate limiting.
- Live production external services.
- `ARA_Leads` creation in HubSpot.
- `ara_*` production properties.

## Recommended First Step

Extract connector interfaces behind the existing `src/clients.js` behavior while preserving current tests. Add mock implementations first, then sandbox implementations.

## Operational Summary (ES)

No iniciar conectores hasta que el PR esté revisado en `develop`, staging esté aislado, el smoke test pase y `ARA_EXTERNAL_SERVICES_MODE` esté en `mock` o sandbox aprobado.

