# Safety Baseline Closure

## Status

Safety Baseline A1-A3 is ready for pull request review from `feature/ara-safety-baseline` into `develop`.

No deployment, merge, Apollo live call, HubSpot write, Railway change, `ara_*` property creation, or `ARA_Leads` creation is part of this closure.

## Branch Review

Current integration strategy:

- `main`: stable or production reference.
- `develop`: ARA integration branch created from `main`.
- `feature/*`: phase or component work.

The safety branch introduces:

- HTTP app factory separated from server listener.
- Internal API authentication through `X-ARA-Admin-Token`.
- Safe write control through `ARA_WRITE_MODE`.
- Correlation IDs across requests and run persistence.
- Structured logging with secret and PII sanitization.
- Typed public error contract.
- Diagnostics disabled by default.
- Temporary in-memory rate limiting.
- Sanitized audit summary endpoint.
- Protected paginated candidate endpoint.
- Idempotent `import_runs.correlation_id` migration.
- UI support for internal token, structured errors, and candidates endpoint.
- Documentation and automated tests.

## Security Gate

| Gate | Status | Evidence |
|---|---|---|
| No secrets in code | Pass | Secret scan pattern returned no matches. |
| No tokens in logs | Pass | Logger redacts keys matching token/key/secret/password/credential. |
| PII sanitized in logs | Pass | Email and phone masking covered by tests. |
| Diagnostics blocked by default | Pass | `ARA_DIAGNOSTICS_ENABLED=false`; tests cover disabled diagnostics. |
| Sensitive endpoints require auth | Pass | All `/api/*` routes use internal auth except no public API routes exist. |
| Write mode default disabled | Pass | `ARA_WRITE_MODE=disabled` in `.env.example` and config default. |
| Tests cannot use enabled writes | Pass | Config validation rejects `ARA_WRITE_MODE=enabled` during test. |
| No stack exposure in public errors | Pass | Public errors are sanitized by `toPublicError()`. |
| No raw Apollo/HubSpot payload exposure | Pass | Audit and candidate serializers exclude raw provider payloads. |

## Functional Gate

| Gate | Status | Evidence |
|---|---|---|
| Existing flow works with mocks | Pass | Unit and HTTP tests use mocks/stubs. |
| Candidates remain visible | Pass | `GET /api/import-runs/:runId/candidates`. |
| Preview remains available | Pass | `ARA_WRITE_MODE=preview` behavior covered by tests. |
| UI shows results | Pass | `public/app.js` fetches candidates endpoint with fallback. |
| New error contract works | Pass | HTTP tests cover structured errors. |
| Commercial filters unchanged | Pass | No intentional ICP/filter logic change in A4. |
| ICP logic unchanged | Pass | No scoring or ICP changes in A4. |
| Phone mapping unchanged | Pass | Phone mapping tests pass. |
| Current deduplication unchanged | Pass | Existing email dedupe remains in `agent.js`. |

## Technical Gate

| Gate | Status | Evidence |
|---|---|---|
| `npm test` passes | Pass | 44/44 tests passing. |
| `npm run lint` passes | Pass | Syntax check passes. |
| `npm run check` passes | Pass | Lint plus tests pass. |
| App import does not start listener | Pass | Listener is owned by `src/server.js`. |
| Tests do not open ports | Pass | Tests call Express in memory. |
| No external calls in tests | Pass | Mocks/stubs only. |
| Migration is idempotent | Pass | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS correlation_id`. |
| Rollback documented | Pass | See Railway staging runbook and PR plan. |
| Official docs tracked | Ready | Docs must be added to PR. |

## Merge Risks

1. `develop` is newly created from `main`; remote publication is still pending.
2. API consumers must send `X-ARA-Admin-Token`.
3. Existing callers of `/api/audit/latest-import` must migrate to the candidate endpoint for contact rows.
4. Startup is strict: missing config or DB initialization failure prevents server startup.
5. Local rate limiting is not distributed and must not be used as the final multi-instance design.

## Incompatible Contract Changes

- `/health` now returns safe service metadata and correlation ID.
- API errors use `{ error: { code, message }, correlation_id }`.
- Protected API routes require `X-ARA-Admin-Token`.
- JSON write endpoints require `Content-Type: application/json`.
- `/api/audit/latest-import` no longer returns full contacts or filters.
- Diagnostics are unavailable unless explicitly enabled and authenticated.

## Operational Summary (ES)

El Safety Baseline queda listo para revisión en PR hacia `develop`. No se debe desplegar todavía. Antes de staging real, Railway debe tener DB separada, variables completas, `ARA_WRITE_MODE=disabled`, `ARA_EXTERNAL_SERVICES_MODE=mock` y el smoke test aprobado.

