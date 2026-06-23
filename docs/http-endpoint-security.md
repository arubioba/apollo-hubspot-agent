# HTTP Endpoint Security

## Endpoint Inventory

| Endpoint | Method | Classification | Auth | Notes |
|---|---:|---|---|---|
| `/health` | GET | Public | No | Safe health only. No secrets, no config inventory. |
| `/` and static files | GET | Public | No | Serves the internal UI. |
| `/api/diagnostics/hubspot` | GET | Protected technical diagnostics | `X-ARA-Admin-Token` | Disabled unless `ARA_DIAGNOSTICS_ENABLED=true`. |
| `/api/diagnostics/openai` | GET | Protected technical diagnostics | `X-ARA-Admin-Token` | Disabled unless `ARA_DIAGNOSTICS_ENABLED=true`. |
| `/api/audit/latest-import` | GET | Protected audit summary | `X-ARA-Admin-Token` | Summary only; no candidate PII or provider payloads. |
| `/api/import-runs/:runId/candidates` | GET | Protected commercial operations | `X-ARA-Admin-Token` | Paginated candidate list with minimum operational fields. |
| `/api/setup/hubspot-properties` | POST | Write-protected setup | `X-ARA-Admin-Token` | Subject to `ARA_WRITE_MODE`. |
| `/api/runs` | POST | Protected campaign start | `X-ARA-Admin-Token` | Rate limited. |
| `/api/runs/:id/configure` | POST | Protected run configuration | `X-ARA-Admin-Token` | Requires JSON. |
| `/api/runs/:id/analyze` | POST | Protected AI filter analysis | `X-ARA-Admin-Token` | Requires JSON. |
| `/api/runs/:id/approve-roles` | POST | Protected Apollo-consuming operation | `X-ARA-Admin-Token` | Rate limited. |
| `/api/runs/:id/relax` | POST | Protected Apollo-consuming operation | `X-ARA-Admin-Token` | Rate limited. |
| `/api/runs/:id/test` | POST | Write-protected HubSpot preview/test | `X-ARA-Admin-Token` | Subject to `ARA_WRITE_MODE`. |
| `/api/runs/:id/import` | POST | Write-protected HubSpot import | `X-ARA-Admin-Token` | Subject to `ARA_WRITE_MODE` and approval code when required. |

## Common HTTP Controls

- API responses include `X-Correlation-ID`.
- API responses set `Cache-Control: no-store`.
- All responses set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: no-referrer`.
- `POST`, `PUT`, and `PATCH` under `/api/*` that expect JSON require `Content-Type: application/json`.
- Invalid JSON returns `INVALID_JSON`.
- Oversized JSON returns `PAYLOAD_TOO_LARGE`.
- Wrong content type returns `UNSUPPORTED_CONTENT_TYPE`.

## Rate Limiting

ARA 0.1 uses local in-memory rate limiting as a temporary protection. It is intended for external/manual requests, authentication attempts, diagnostics, repeated campaign starts, and endpoints that can trigger Apollo consumption.

This is not distributed. It must be replaced with Redis or another shared store before running multiple Railway replicas, multiple tenants, or parallel high-volume processing.

