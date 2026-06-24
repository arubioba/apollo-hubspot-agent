# Agent Result Contract

## Purpose

Agent results are the only valid way for an agent to report completion, evidence, warnings, errors and recommended next action.

## Contract

```json
{
  "contract_version": "1.0",
  "tenant_id": "freelan",
  "campaign_id": "campaign_001",
  "run_id": "run_001",
  "candidate_id": "candidate_001",
  "correlation_id": "uuid",
  "agent": "discovery",
  "agent_version": "0.1",
  "status": "completed",
  "decision": "recommended",
  "confidence": 0.91,
  "output": {},
  "evidence": [],
  "warnings": [],
  "errors": [],
  "metrics": {
    "duration_ms": 0,
    "external_calls": 0,
    "estimated_cost": 0
  },
  "next_action": "commercial_approval",
  "completed_at": "ISO-8601"
}
```

## Statuses

| Status | Terminal | Retryable | Meaning |
|---|---:|---:|---|
| `queued` | No | No | Accepted but not started. |
| `running` | No | No | Currently executing. |
| `completed` | Yes | No | Finished successfully. |
| `partially_completed` | Yes | Yes | Some work finished, some failed. |
| `blocked` | Yes | Conditional | Cannot proceed without input or dependency. |
| `failed` | Yes | Conditional | Failed execution. Retry only for transient errors. |
| `retry_pending` | No | Yes | Waiting for retry. |
| `human_review_required` | No | No | Needs operator/approver. |
| `cancelled` | Yes | No | Stopped intentionally. |

## Decisions

- `recommended`
- `not_recommended`
- `needs_review`
- `approved`
- `rejected`
- `no_decision`

## Validation Requirements

The Orchestrator must verify:

- Contract version is supported.
- Tenant/run/campaign context matches request.
- Correlation ID is present.
- Agent and version are known.
- Status transition is allowed.
- Required evidence exists for recommendations.
- Next action is allowed from current candidate lifecycle state.

## Error Shape

Errors must be safe and structured:

```json
{
  "code": "PROVIDER_RATE_LIMIT",
  "message": "Provider rate limit reached.",
  "retryable": true,
  "provider": "apollo"
}
```

Do not include provider tokens, raw payloads or stack traces.

