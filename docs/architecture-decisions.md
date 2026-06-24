# Architecture Decisions

## ADR-001 - Evolve Existing System Instead Of Replacing

Decision: ARA 0.1 evolves the current Apollo to HubSpot system.

Rationale:

- The current flow has validated value.
- Apollo search, HubSpot mapping and test-before-import are reusable.

Consequence:

- Refactor must protect current behavior with tests.

## ADR-002 - Internal-first, Multi-tenant-ready

Decision: ARA starts as internal Freelan software but must be designed for future client tenants.

Rationale:

- Future plug and play revenue system requires per-client Apollo and HubSpot accounts.

Consequence:

- Every operation must include `tenant_id`.
- Global credentials must be replaced by tenant credential references.

## ADR-003 - ARA_Leads Is An Active List

Decision: `ARA_Leads` is a HubSpot active contact list driven by properties.

Rationale:

- Active list membership is reversible, observable and property-driven.

Consequence:

- ARA must write `ara_*` properties.
- ARA must not manually add contacts to the active list.

## ADR-004 - Discovery Does Not Directly Write To HubSpot

Decision: ARA Discovery Agent produces candidates and evidence; HubSpot writes are handled by HubSpot Connector after approval.

Rationale:

- Separation improves safety, auditability and reuse.

Consequence:

- Current `importCandidate()` flow must be split.

## ADR-005 - Latenode Is Optional

Decision: Latenode is not required for ARA 0.1.

Rationale:

- The current footprint should stay small until an event integration need is concrete.

Consequence:

- Architecture leaves an optional integration point.

## ADR-006 - No Email Sending In ARA 0.1

Decision: ARA 0.1 will not send emails.

Rationale:

- Discovery and HubSpot sync safety come first.

Consequence:

- Engagement Agent remains future interface only.

## ADR-007 - Railway Remains Initial Deployment Platform

Decision: Railway remains the initial platform for MVP/staging.

Rationale:

- It already hosts the current system and is fast for iteration.

Consequence:

- Add staging service and database before production changes.

## ADR-008 - Temporary Internal Token Authentication

Decision: ARA 0.1 uses `X-ARA-Admin-Token` backed by `ARA_ADMIN_TOKEN`.

Rationale:

- It provides immediate protection without delaying Safety Baseline for full OAuth/RBAC.

Consequence:

- Replace with proper user auth and roles in a later phase.

## ADR-009 - HubSpot Writes Are Controlled By ARA_WRITE_MODE

Decision: HubSpot writes require `ARA_WRITE_MODE=enabled`; default is `disabled`.

Rationale:

- Prevents accidental writes in development, tests and staging.

Consequence:

- Operators must explicitly enable writes in controlled environments.

## ADR-010 - HTTP App Factory Is Separate From Listener

Decision: `src/app.js` exports `createApp()` and `src/server.js` owns `listen()`.

Rationale:

- Endpoint tests must run without opening ports or initializing production services.

Consequence:

- Runtime dependencies are injected into the app factory.
- Startup and shutdown are explicit in the server entry point.

## ADR-011 - Separate Audit Summary From Candidate Operations

Decision: `/api/audit/latest-import` returns only run-level counts, status and correlation data. Candidate visibility moves to `GET /api/import-runs/:runId/candidates`, protected with the internal admin token and paginated.

Rationale:

- ARA needs commercial operators to review contacts.
- Audit endpoints should not expose full candidate PII or raw Apollo/HubSpot payloads.

Consequence:

- The UI must call the candidate endpoint when it needs operational contact rows.

## ADR-012 - Diagnostics Disabled By Default

Decision: `ARA_DIAGNOSTICS_ENABLED=false` is the default. Diagnostics can be enabled explicitly in development/test and remain authenticated when enabled.

Rationale:

- Diagnostics are technical debugging data, not the business console.

Consequence:

- `/health` remains the safe liveness endpoint.

## ADR-013 - Local Rate Limiting Is Temporary

Decision: ARA 0.1 uses local in-memory HTTP rate limiting for user-triggered and Apollo-consuming endpoints.

Rationale:

- Immediate protection is useful before introducing infrastructure.

Consequence:

- This is not distributed and must migrate to Redis or equivalent before multi-instance or multi-tenant usage.

## ADR-014 - Develop Is The ARA Integration Branch

Decision: `develop` is created from `main` and becomes the integration branch for ARA work.

Rationale:

- `main` remains the stable or production reference.
- ARA will add connectors and agents that need integration validation before stable release.

Consequence:

- `feature/*` branches prepare PRs into `develop`, not directly into `main`.

## ADR-015 - External Services Mode Is Declared Before Connector Extraction

Decision: `ARA_EXTERNAL_SERVICES_MODE=mock | sandbox | live` is documented and validated in A4, but runtime switching remains deferred to Connector Extraction.

Rationale:

- New environments must declare whether they intend to use mock, sandbox or live providers.
- Implementing actual switching belongs with connector extraction to avoid duplicate client logic.

Consequence:

- A4 staging defaults to `mock`.
- `src/clients.js` behavior is not changed by this variable yet.

## ADR-016 - ARA Candidate Is The Central Commercial Entity

Decision: ARA introduces `ARA Candidate` as a durable commercial entity separate from HubSpot contacts.

Rationale:

- Discovery must not automatically imply HubSpot synchronization.
- Operators need to review candidates before CRM writes.
- Future agents need a shared entity for evidence, scores, approval and handoff.

Consequence:

- Current `import_runs.candidates` remains for compatibility.
- B2 starts with Candidate Repository and adapter from current Apollo-normalized candidates.

## ADR-017 - Agent Handoffs Require Validated Results

Decision: A candidate must not advance to another agent only because it was saved in the database. Each handoff requires structured result, evidence, confidence, state, next action, correlation ID, agent version and audit event.

Rationale:

- ARA is an operating system, not passive storage.
- Handoffs must be explainable, resumable and auditable.

Consequence:

- The Orchestrator validates agent results before invoking the next agent.
- MVP may execute synchronously, but contracts remain async-ready.

## ADR-018 - Approval Status Is Separate From Lifecycle Status

Decision: `lifecycle_status` represents the candidate's commercial/operational state; `approval_status` represents human governance. Approval is stored as a durable event.

Rationale:

- Operators need simple labels and clear actions.
- Governance decisions must be auditable.

Consequence:

- Candidate rows store current aggregate statuses.
- `ara_approvals` stores the decision history.

## ADR-019 - MVP Tenant Is Freelan But Tenant Context Is Required

Decision: MVP uses `freelan` as the default tenant through `ARA_DEFAULT_TENANT_ID=freelan`, but interfaces, contracts, repositories, idempotency keys and audit events require tenant context.

Rationale:

- Internal Freelan MVP must move quickly.
- Future client deployments should not require rewriting domain contracts.

Consequence:

- No tenant onboarding, dynamic credentials, billing or tenant RBAC in B1/B2.
- New components must receive tenant context instead of hardcoding `freelan` in business logic.
