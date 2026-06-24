# Agent Foundation Data Model

## Proposed Tables

### `ara_candidates`

Purpose: durable commercial candidate inbox.

See `docs/ara-candidate-domain.md` for full SQL.

Relationships:

- `run_id` references `import_runs(id)`.
- Approval events reference `candidate_id`.
- Agent executions may reference `candidate_id`.
- Audit events may reference `candidate_id`.

Retention:

- Keep active candidates indefinitely for MVP.
- Archive rejected/disqualified candidates instead of deleting.

### `ara_agent_executions`

```sql
CREATE TABLE ara_agent_executions (
  execution_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  campaign_id text NOT NULL,
  run_id uuid NOT NULL REFERENCES import_runs(id),
  candidate_id uuid REFERENCES ara_candidates(candidate_id),
  correlation_id text NOT NULL,
  agent text NOT NULL,
  agent_version text NOT NULL,
  requested_action text NOT NULL,
  status text NOT NULL,
  trigger jsonb NOT NULL,
  input_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_action text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ara_agent_executions_run_idx
  ON ara_agent_executions(tenant_id, run_id, created_at DESC);

CREATE INDEX ara_agent_executions_candidate_idx
  ON ara_agent_executions(tenant_id, candidate_id, created_at DESC)
  WHERE candidate_id IS NOT NULL;
```

### `ara_approvals`

See `docs/approval-contract.md`.

### `ara_audit_events`

```sql
CREATE TABLE ara_audit_events (
  audit_event_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  correlation_id text NOT NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text,
  campaign_id text,
  run_id uuid,
  candidate_id uuid,
  execution_id uuid,
  approval_id uuid,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ara_audit_events_correlation_idx
  ON ara_audit_events(tenant_id, correlation_id, created_at DESC);

CREATE INDEX ara_audit_events_candidate_idx
  ON ara_audit_events(tenant_id, candidate_id, created_at DESC)
  WHERE candidate_id IS NOT NULL;
```

## PII Fields

- `ara_candidates.professional_email`
- `ara_candidates.contact_name`
- `ara_candidates.linkedin_url`
- Candidate evidence if it includes personal context.

Do not place raw Apollo or HubSpot payloads in audit events.

## Constraints

- `tenant_id` required everywhere.
- `correlation_id` required for executions, approvals and audit events.
- Candidate handoff requires an agent result plus audit event.
- Approval requires durable event.

## Rollback Strategy

- New tables are additive.
- Stop writing to new tables.
- Keep legacy `import_runs.candidates`.
- Drop new tables only after backup and explicit approval.

