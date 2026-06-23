# ARA 0.1 Migration Blueprint

## Executive Direction

ARA 0.1 evolves the current deployed Apollo to HubSpot app into the first modular version of ARA. The current system is not replaced. Its working discovery flow becomes the foundation for ARA Discovery Agent.

ARA 0.1 will be internal-first, Railway-hosted and GitHub-managed, while preparing for future client-specific Apollo and HubSpot accounts.

## Technical Decisions

| Area | Decision |
|---|---|
| Product name | ARA - Autonomous Revenue Architects |
| Ownership | Freelan |
| Initial audience | Internal Freelan team |
| Future model | Plug and play multi-client |
| Deployment | Railway |
| Version control | GitHub |
| Latenode | Optional integration, not required |
| HubSpot lead control | Active list `ARA_Leads` driven by `ara_*` properties |
| Email sending | Out of scope for ARA 0.1 |
| Approval levels | Operator, Admin, Commercial Approver |

## Current-to-Target Refactor Plan

| Current component | Current responsibility | Target responsibility | Action | Dependencies | Risk | Migration order | Tests required |
|---|---|---|---|---|---|---|---|
| `src/server.js` | Express API, static files, route wrapper | ARA API controller, auth boundary, tenant context boundary | REFACTOR | Express, ARA Core | Exposed mutation endpoints | A1 | Endpoint smoke, auth/tenant middleware |
| `src/agent.js` | Run state, validation, Apollo search, HubSpot import, quota | ARA Core orchestration plus extracted Discovery workflow | REFACTOR | DB, connectors, scoring | High coupling | C/D | Run lifecycle, state transitions |
| `src/clients.js` | Apollo, HubSpot, mapping, normalization | Split into Apollo Connector, HubSpot Connector, mapping utilities | REFACTOR | Provider APIs | Provider errors not isolated | B | Connector contract tests |
| `src/interpreter.js` | OpenAI filter interpretation | ICP interpretation tool used by Discovery/Data Intelligence | REFACTOR | OpenAI | Prompt/version drift | B/D | Schema output, prompt version tests |
| `src/db.js` | Runtime table creation, run state, daily count | Repository layer plus migrations, tenant filtering, audit events | REFACTOR | PostgreSQL | PII in JSONB and no migrations | C | Repository and tenant isolation tests |
| `public/` | Internal chat UI | Temporary ARA operator console | REUSE_WITH_MINOR_CHANGES | API | No auth/state fragility | A/F | UI smoke tests |
| `test/phone-mapping.test.js` | Phone mapping tests | Keep and expand connector tests | REUSE_AS_IS | node:test | Low coverage | A/B | Existing plus new mapping cases |
| `Dockerfile` | Production image | Same for MVP | REUSE_WITH_MINOR_CHANGES | Node | No migration step | A/F | Build smoke |
| `railway.toml` | Railway build/deploy config | Production service plus staging pattern | REUSE_WITH_MINOR_CHANGES | Railway | Single environment pattern | F | Healthcheck verification |
| `/api/runs/:id/configure` | Legacy configure path not used by UI | Remove after confirming no clients | REMOVE | API | Unknown external callers | Later | Route removal regression |

## Migration Phases

### Phase A - Safety Baseline

Goal: preserve current production behavior while reducing operational risk.

Scope:

- Branch protection.
- Environment validation.
- Secret review.
- Improved logging.
- Correlation IDs.
- Error handling.
- Tests around current behavior.
- Production baseline.

Exit criteria:

- No behavior regression.
- Existing tests pass.
- New tests cover current critical behavior.
- Staging can run without touching production HubSpot.

### Phase B - Connector Extraction

Goal: isolate Apollo, HubSpot and OpenAI access.

Scope:

- Apollo Connector.
- HubSpot Connector.
- OpenAI/ICP interpretation client.
- Interfaces.
- Mocks.
- Contract tests.
- Provider error taxonomy.

Exit criteria:

- Existing app still works through connectors.
- Tests do not require Apollo, HubSpot or OpenAI network calls.

### Phase C - Domain Extraction

Goal: introduce ARA domain objects.

Domain objects:

- Tenant.
- Campaign.
- ICP.
- Prospect.
- Company.
- Contact.
- Agent run.
- Audit event.

Exit criteria:

- Every persisted record has `tenant_id`.
- Every query filters by `tenant_id`.
- Audit events are append-only.

### Phase D - Discovery Agent

Goal: convert the current flow into ARA Discovery Agent.

Scope:

- Typed inputs/outputs.
- Explainable scoring.
- Deduplication.
- Idempotency.
- State machine.
- Evidence.

Exit criteria:

- Discovery can run without writing to HubSpot.
- Approved sync is a separate step.

### Phase E - ARA_Leads Integration

Goal: write ARA-managed contacts into HubSpot through properties that power the active list.

Scope:

- Create properties in sandbox or controlled environment.
- Configure active list.
- Validate membership.
- Validate exit rules.
- Validate reversal.
- No production use until approval.

Exit criteria:

- Contacts enter and leave `ARA_Leads` based only on `ara_*` properties.
- Static campaign snapshots are optional and never the source of truth.

### Phase F - Multi-tenant Preparation

Goal: prepare plug and play client onboarding.

Scope:

- Tenant configuration.
- Credential references.
- Tenant isolation tests.
- Feature flags.
- Tenant field mappings.

Exit criteria:

- A second tenant can be configured in staging without seeing Freelan data.

## Contradictions With Current System

1. Current system writes directly to HubSpot from the discovery workflow; target architecture separates discovery from HubSpot sync.
2. Current system has global credentials; target requires tenant-specific credential references.
3. Current system has no auth; target requires role-based approvals.
4. Current system stores run state as JSONB with PII; target requires tenant-aware, auditable and minimized data.
5. Current system does not manage `ARA_Leads`; target requires `ara_*` properties to drive active list membership.

## First Technical Issue Recommended

Implement Phase A issue: add correlation IDs, structured logs and environment validation tests without changing external behavior. This creates the observability baseline needed before connector extraction.

