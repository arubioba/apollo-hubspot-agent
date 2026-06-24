# Agent Foundation Backlog

Ordered by commercial value.

## 1. Contract Schemas

- Business value: every agent/result has a stable interface.
- Technical scope: JSON schemas or JS validators for execution/result contracts.
- Acceptance: invalid contracts rejected; tests cover required fields.
- Dependencies: none.
- Risk: over-modeling.
- Size: S.
- Tests: contract validation tests.

## 2. Candidate Repository

- Business value: durable candidate inbox foundation.
- Technical scope: `ara_candidates` table migration, repository CRUD/query.
- Acceptance: candidates persist and query by tenant/run/status.
- Dependencies: contract schemas.
- Risk: PII handling.
- Size: M.
- Tests: repository tests with synthetic data.

## 3. Current Candidate Adapter

- Business value: current Apollo search becomes ARA-visible.
- Technical scope: map `normalizeCandidate()` output to ARA Candidate.
- Acceptance: existing search can produce candidate rows with scores/evidence/status.
- Dependencies: Candidate Repository.
- Risk: lossy mapping.
- Size: S.
- Tests: adapter mapping tests.

## 4. Candidate Inbox API

- Business value: operators see durable ARA candidates.
- Technical scope: protected paginated API.
- Acceptance: UI/API returns score, evidence, status, next action.
- Dependencies: Candidate Repository.
- Risk: exposing PII/raw payloads.
- Size: M.
- Tests: HTTP contract tests.

## 5. Apollo Search Connector Interface

- Business value: search provider can evolve without touching agents.
- Technical scope: interface + adapter around current Apollo code.
- Acceptance: current tests pass through connector.
- Dependencies: adapter.
- Risk: accidental behavior change.
- Size: M.
- Tests: mock connector and current-client adapter tests.

## 6. Mock Providers

- Business value: staging can demo without credits.
- Technical scope: deterministic Apollo/HubSpot mocks behind provider factory.
- Acceptance: smoke test uses provider factory.
- Dependencies: connector interface.
- Risk: mocks drifting from reality.
- Size: M.
- Tests: smoke and fixture tests.

## 7. Provider Factory

- Business value: explicit mock/sandbox/live intent.
- Technical scope: resolve providers by context and `ARA_EXTERNAL_SERVICES_MODE`.
- Acceptance: mock mode blocks external calls.
- Dependencies: connectors/mocks.
- Risk: global config leakage.
- Size: S.
- Tests: provider resolution tests.

## 8. Approval Repository

- Business value: human decisions become auditable.
- Technical scope: `ara_approvals`, event writes, aggregate approval status.
- Acceptance: approval event updates candidate approval status.
- Dependencies: Candidate Repository.
- Risk: state transition bugs.
- Size: M.
- Tests: approval event/state tests.

## 9. Approval API

- Business value: operator can approve/reject from console.
- Technical scope: protected endpoints for approval actions.
- Acceptance: approve/reject/request review records durable event.
- Dependencies: Approval Repository.
- Risk: insufficient role model.
- Size: M.
- Tests: HTTP + auth tests.

## 10. HubSpot Sync Boundary

- Business value: approved candidates sync safely.
- Technical scope: service that uses read/write connectors with approval ref.
- Acceptance: only approved candidates can sync.
- Dependencies: Approval API, HubSpot connectors.
- Risk: partial sync.
- Size: L.
- Tests: preview/write guard/idempotency tests.

## 11. HubSpot Read Connector

- Business value: avoid duplicates and detect relationships.
- Technical scope: find contact/company/current lifecycle.
- Acceptance: deterministic read interface.
- Dependencies: provider factory.
- Risk: HubSpot property variance.
- Size: M.
- Tests: mock read tests.

## 12. HubSpot Write Connector

- Business value: controlled CRM sync.
- Technical scope: create/update/associate with approval/idempotency/audit.
- Acceptance: write guard required in all methods.
- Dependencies: Sync Boundary.
- Risk: accidental writes.
- Size: L.
- Tests: write guard and idempotency tests.

## 13. Discovery Orchestration

- Business value: Discovery becomes a real agent.
- Technical scope: Orchestrator invokes Discovery Agent via contract.
- Acceptance: agent result drives candidate state and next action.
- Dependencies: connectors, candidate repo.
- Risk: duplicated legacy flow.
- Size: L.
- Tests: orchestration tests.

## 14. Migration Tests

- Business value: legacy and new flow remain compatible.
- Technical scope: side-by-side characterization.
- Acceptance: current behavior unchanged while new candidates persist.
- Dependencies: repository/adapter.
- Risk: missing edge cases.
- Size: M.
- Tests: migration fixtures.

## 15. UI Adaptation

- Business value: real ARA Candidate Inbox.
- Technical scope: show durable candidates and approval actions.
- Acceptance: console shows candidate, score, evidence, status, next action.
- Dependencies: Candidate Inbox API, Approval API.
- Risk: UI complexity.
- Size: M.
- Tests: smoke/manual.

