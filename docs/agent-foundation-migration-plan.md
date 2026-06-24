# Agent Foundation Migration Plan

## Strangler Strategy

1. Add contract schemas.
2. Add Candidate Repository.
3. Adapt current normalized Apollo candidates to `ARA Candidate`.
4. Add Candidate Inbox API.
5. Wrap current Apollo search behind Apollo Search Connector.
6. Add Approval Repository and Approval API.
7. Add HubSpot Sync boundary.
8. Mark `executeTest()` as legacy compatibility path.
9. Retire direct Discovery-to-HubSpot writes after parity.

## Compatibility Rules

- Do not remove `import_runs.candidates` during B2.
- Do not remove `executeTest()` until the new flow covers search, normalization, persistence, visualization, approval, preview and controlled sync.
- Do not change commercial filters in connector extraction.
- Do not write automatically to HubSpot after discovery.

## Legacy `executeTest()`

Starting B2 it should be documented/marked as:

- Legacy compatibility path.
- No new capabilities.
- No new commercial logic.
- Emits usage metric/event.
- Retirement condition: new approval + preview + controlled HubSpot sync covers current operator workflow.

## First Commercial Milestone

- Execute current search.
- Convert results into durable ARA Candidates.
- Query candidates from console.
- Show score, evidence, status and next action.
- Do not write automatically to HubSpot.

## Rollback

- Disable new Candidate Inbox API if needed.
- Continue run-based UI fallback.
- Preserve legacy preview/import routes.
- Keep HubSpot write guard enabled.

