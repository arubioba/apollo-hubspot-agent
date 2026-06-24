# Orchestrator Responsibilities

## Owns

- Create or resume runs.
- Invoke agents.
- Pass versioned contracts.
- Validate results.
- Update execution state.
- Select next action.
- Route human-review tasks.
- Enforce stop conditions.
- Retry transient errors.
- Prevent duplicate execution.
- Record audit events.

## Does Not Own

- Apollo API details.
- HubSpot API details.
- PDF generation.
- Sales email generation.
- All business rules.
- Approval bypass.

## Discovery-To-Approval Sequence

```mermaid
sequenceDiagram
  participant UI as ARA Console
  participant O as Orchestrator
  participant D as Discovery Agent
  participant A as Apollo Search Connector
  participant C as Candidate Repository
  participant P as Approval Service
  participant Audit as Audit Events

  UI->>O: Start campaign/ICP run
  O->>D: discover_candidates contract
  D->>A: Search people
  A-->>D: Normalized external records
  D->>D: Score + evidence
  D->>C: Upsert ARA candidates
  D-->>O: Agent result + next_action
  O->>Audit: Validate result and record handoff
  O-->>UI: Candidate inbox ready
  UI->>P: Approve/reject candidate
  P->>Audit: Durable approval event
```

## Multiagent Handoff

```mermaid
flowchart TD
  D["Discovery Agent Result"]
  V["Orchestrator Validates Result"]
  A["Audit Event"]
  C{"Next action allowed?"}
  H["Human Review"]
  S["HubSpot Sync"]
  DI["Data Intelligence Agent"]

  D --> V --> A --> C
  C -->|commercial_approval| H
  C -->|hubspot_sync| S
  C -->|data_intelligence| DI
  C -->|blocked| H
```

## Synchronous MVP

ARA 0.1 may invoke agents synchronously inside HTTP/service calls. Contracts still include IDs, state and retry metadata so future workers can consume the same envelope.

