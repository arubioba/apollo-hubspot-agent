# ARA Migration Backlog

## Phase A - Safety Baseline

### A1 - Add correlation IDs and structured logging

Description: Add per-request correlation IDs and structured logs without changing business behavior.

Acceptance criteria:

- Every API request has correlation ID.
- Logs include `run_id` when available.
- No secrets or raw tokens in logs.

Dependencies: none.

Risk: Low.

Size: S.

Files likely: `src/server.js`, new logging utility.

Tests: request logging unit/smoke tests.

### A2 - Add environment validation tests

Description: Test required environment variable detection and secret normalization.

Acceptance criteria:

- Missing variables are detected.
- Bearer/comma/quote normalization behavior is covered.

Dependencies: none.

Risk: Low.

Size: XS.

Files likely: `src/config.js`, `test/config.test.js`.

Tests: unit tests.

### A3 - Protect diagnostics and setup endpoints

Description: Add internal protection for diagnostic and HubSpot setup endpoints.

Acceptance criteria:

- `/api/setup/hubspot-properties` is not publicly callable.
- Diagnostics require internal auth or are disabled in production.

Dependencies: auth decision.

Risk: Medium.

Size: M.

Files likely: `src/server.js`.

Tests: endpoint auth tests.

## Phase B - Connector Extraction

### B1 - Extract Apollo Connector

Description: Move Apollo request and search payload logic behind `ApolloConnector`.

Acceptance criteria:

- Current search behavior is preserved.
- Apollo payload is testable without network.
- Connector accepts tenant credential reference.

Dependencies: A1.

Risk: Medium.

Size: M.

Files likely: `src/clients.js`, `src/connectors/apollo/*`.

Tests: contract tests with mocked fetch.

### B2 - Extract HubSpot Connector

Description: Move HubSpot search/create/update/associate operations behind `HubSpotConnector`.

Acceptance criteria:

- Current upsert behavior is preserved.
- Fill-blank-only behavior is covered.
- Phone mapping tests still pass.

Dependencies: A1.

Risk: High.

Size: L.

Files likely: `src/clients.js`, `src/connectors/hubspot/*`.

Tests: connector contract tests.

### B3 - Extract OpenAI ICP Interpreter

Description: Move OpenAI logic behind an interpretation client with versioned prompt/schema.

Acceptance criteria:

- Prompt/schema version is recorded.
- Fake interpreter can be used in tests.

Dependencies: A1.

Risk: Medium.

Size: M.

Files likely: `src/interpreter.js`.

Tests: schema parsing tests.

## Phase C - Domain Extraction

### C1 - Introduce tenant domain model

Description: Add tenant-aware domain model and repositories.

Acceptance criteria:

- Every new repository method requires `tenant_id`.
- No fallback global tenant except explicit bootstrap.

Dependencies: A2.

Risk: High.

Size: L.

Files likely: `src/db.js`, new domain/repository files.

Tests: tenant isolation tests.

### C2 - Add audit event model

Description: Add append-only audit event design and repository.

Acceptance criteria:

- State changes and provider calls can be audited.
- Audit events include `tenant_id`.

Dependencies: C1.

Risk: Medium.

Size: M.

Files likely: DB/repository files.

Tests: append-only tests.

## Phase D - Discovery Agent

### D1 - Create typed Discovery Agent interface

Description: Convert current discovery flow into typed input/output contract.

Acceptance criteria:

- Discovery can run without HubSpot writes.
- Output includes candidates, evidence and score placeholders.

Dependencies: B1, B3, C1.

Risk: High.

Size: L.

Files likely: `src/agent.js`, new discovery files.

Tests: discovery flow tests.

### D2 - Add deduplication service

Description: Separate dedupe logic and HubSpot duplicate checks.

Acceptance criteria:

- Dedupes by email within run.
- Supports duplicate state output.

Dependencies: B2, D1.

Risk: Medium.

Size: M.

Tests: dedupe tests.

## Phase E - ARA_Leads Integration

### E1 - Implement ARA property specification

Description: Add code/spec support for `ara_*` properties in controlled environment.

Acceptance criteria:

- No production creation by default.
- Dry-run property diff is possible.

Dependencies: B2, C2.

Risk: High.

Size: M.

Tests: property spec tests.

### E2 - Sync contacts with ARA_Leads properties

Description: Update HubSpot sync to write `ara_*` properties that drive active list membership.

Acceptance criteria:

- Contact enters list by properties.
- Rejected/disqualified/archived contacts exit.

Dependencies: E1, state machine.

Risk: High.

Size: L.

Tests: membership predicate tests and staging validation.

## Phase F - Multi-tenant Preparation

### F1 - Add tenant configuration service

Description: Load tenant-specific credentials, mappings, limits, ICP and feature flags.

Acceptance criteria:

- Freelan tenant works.
- Second staging tenant can be configured.

Dependencies: C1.

Risk: High.

Size: L.

Tests: tenant config tests.

### F2 - Add tenant-scoped feature flags

Description: Gate ARA modules by tenant-specific flags.

Acceptance criteria:

- Engagement remains disabled.
- ARA_Leads can be disabled per tenant.

Dependencies: F1.

Risk: Medium.

Size: S.

Tests: feature flag tests.

