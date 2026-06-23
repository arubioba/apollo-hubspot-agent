# ARA Testing Strategy

## Goals

- Protect the current deployed behavior.
- Enable safe refactoring.
- Avoid real Apollo credits and HubSpot writes in tests.
- Validate tenant isolation.
- Validate ARA_Leads membership logic before production.

## Current Coverage

Existing tests:

- `test/phone-mapping.test.js`
  - mobile maps to `hs_whatsapp_phone_number`
  - `work_hq` is excluded from contact phone
  - direct phone maps to `phone`

Coverage gaps:

- Endpoint flows.
- Apollo search payloads.
- HubSpot upsert behavior.
- Deduplication.
- Daily limit.
- Approval.
- Tenant isolation.
- State machine.
- Audit events.

## Test Layers

### Unit Tests

Targets:

- Filter validation.
- Phone mapping.
- Contact/company property mapping.
- State machine transitions.
- Score calculations.
- `ARA_Leads` membership predicates.

### Connector Contract Tests

Targets:

- Apollo Connector request shape.
- HubSpot Connector search/create/update/associate behavior.
- OpenAI interpretation schema handling.

Rules:

- Use mocks/fakes.
- No network calls in CI.
- No Apollo credits.
- No HubSpot writes.

### Repository Tests

Targets:

- Tenant filtering.
- Audit append-only events.
- Daily quota by tenant.
- Run state persistence.

### Integration Tests

Targets:

- Start run.
- Analyze filters with fake interpreter.
- Approve query.
- Produce candidates from fake Apollo.
- Score/dedupe.
- Sync to fake HubSpot.
- Audit all steps.

### Staging Validation

Targets:

- Railway staging health.
- Staging DB migrations.
- HubSpot sandbox/control environment property creation.
- `ARA_Leads` active list membership.
- Rollback by property update.

## Required Tests By Phase

| Phase | Tests |
|---|---|
| A | existing behavior, env validation, logging/correlation ID |
| B | connector contract tests, timeout/retry behavior |
| C | tenant isolation, repository tenant filters, audit event tests |
| D | discovery agent input/output, scoring, dedupe, idempotency |
| E | `ARA_Leads` membership predicates and sandbox validation |
| F | multi-tenant credential reference and feature flag tests |

## CI Recommendation

Minimum GitHub checks:

- `npm test`
- lint/format later if tooling is introduced
- no-secret scan
- docs check for required files

No deployment should run from feature branches to production.

