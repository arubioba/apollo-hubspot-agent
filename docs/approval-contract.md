# Approval Contract

## Purpose

Approvals are durable business events. They are not just boolean fields on a candidate.

## Roles

- `operator`
- `admin`
- `commercial_approver`

Full RBAC is out of scope for B1.

## Actions

- `approve_candidate`
- `reject_candidate`
- `request_review`
- `override_score`
- `add_comment`
- `assign_owner`
- `request_hubspot_sync`
- `block_future_processing`

## Event Shape

```json
{
  "approval_id": "uuid",
  "tenant_id": "freelan",
  "candidate_id": "uuid",
  "decision": "approved",
  "action": "approve_candidate",
  "actor_id": "internal-operator",
  "actor_role": "commercial_approver",
  "reason": "Strong ICP match and verified contact.",
  "previous_lifecycle_status": "PENDING_APPROVAL",
  "new_lifecycle_status": "APPROVED",
  "previous_approval_status": "PENDING",
  "new_approval_status": "APPROVED",
  "score_override": null,
  "owner_assignment": "owner-id",
  "correlation_id": "uuid",
  "created_at": "ISO-8601"
}
```

## Proposed SQL

```sql
CREATE TABLE ara_approvals (
  approval_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  candidate_id uuid NOT NULL REFERENCES ara_candidates(candidate_id),
  action text NOT NULL,
  decision text NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  reason text,
  previous_lifecycle_status text NOT NULL,
  new_lifecycle_status text NOT NULL,
  previous_approval_status text NOT NULL,
  new_approval_status text NOT NULL,
  score_override numeric(5,2),
  owner_assignment text,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ara_approvals_candidate_idx
  ON ara_approvals(tenant_id, candidate_id, created_at DESC);
```

## Console Display

Show:

- Candidate state.
- Approval decision pending/taken.
- Actor.
- Reason.
- Next action.

Do not expose raw event internals unless viewing audit detail.

