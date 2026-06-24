# ARA Candidate Domain

## Definition

An ARA Candidate is a person at a company identified as a possible commercial opportunity. It is not necessarily a HubSpot contact yet.

## Field Classification

### Required For MVP

| Field | Type | Notes |
|---|---|---|
| `candidate_id` | uuid | ARA-owned ID. |
| `tenant_id` | text | MVP default from `ARA_DEFAULT_TENANT_ID=freelan`. |
| `campaign_id` | uuid/text | Required even if initially mapped from run. |
| `run_id` | uuid | Current `import_runs.id`. |
| `source` | text | `apollo`, `manual`, future sources. |
| `apollo_person_id` | text | Nullable but indexed when present. |
| `apollo_organization_id` | text | Nullable. |
| `hubspot_contact_id` | text | Nullable until sync. |
| `hubspot_company_id` | text | Nullable until sync. |
| `contact_name` | text | Display name. |
| `job_title` | text | Current title. |
| `company_name` | text | Display company. |
| `domain` | text | Dedup and company lookup. |
| `country` | text | Company/contact country from source. |
| `professional_email` | text | PII. |
| `linkedin_url` | text | PII-ish public profile. |
| `company_icp_score` | numeric | 0-100. |
| `contact_relevance_score` | numeric | 0-100. |
| `opportunity_score` | numeric | 0-100. |
| `recommendation` | text | `recommended`, `not_recommended`, `needs_review`. |
| `positive_factors` | jsonb | Query-light evidence. |
| `negative_factors` | jsonb | Query-light evidence. |
| `evidence` | jsonb | Structured evidence, no raw payload dumps. |
| `lifecycle_status` | text | Primary commercial lifecycle. |
| `approval_status` | text | Human governance sub-state. |
| `hubspot_sync_status` | text | Sync sub-state. |
| `next_action` | text | Console action. |
| `created_at` | timestamptz | Audit. |
| `updated_at` | timestamptz | Audit. |
| `correlation_id` | text | Traceability. |

### Recommended

- `seniority`
- `department`
- `industry`
- `employee_range`
- `commercial_signals`
- `confidence`
- `assigned_owner`
- `agent_version`
- `scoring_version`
- `rejection_reason`
- `approval_actor_id`
- `approval_reason`

### Future

- `enrichment_status`
- `context_status`
- `engagement_status`
- `pdf_report_id`
- `sequence_id`
- `buyer_committee_group_id`
- `learning_feedback`

## PII Policy

PII fields include:

- `professional_email`
- `contact_name`
- `linkedin_url`
- phone fields if added later
- free-text evidence that may mention a person

Rules:

- Do not store full raw Apollo or HubSpot payloads by default.
- Store normalized operational fields.
- Store external IDs and source references.
- Use JSONB only for evidence/metadata that is not frequently queried.
- Keep audit logs sanitized.

## Proposed SQL

```sql
CREATE TABLE ara_candidates (
  candidate_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  campaign_id text NOT NULL,
  run_id uuid NOT NULL REFERENCES import_runs(id),
  source text NOT NULL,
  apollo_person_id text,
  apollo_organization_id text,
  hubspot_contact_id text,
  hubspot_company_id text,
  contact_name text NOT NULL,
  job_title text,
  seniority text,
  department text,
  company_name text NOT NULL,
  domain text NOT NULL,
  country text,
  industry text,
  employee_range text,
  professional_email text NOT NULL,
  linkedin_url text,
  company_icp_score numeric(5,2),
  contact_relevance_score numeric(5,2),
  opportunity_score numeric(5,2),
  confidence numeric(5,4),
  recommendation text NOT NULL,
  positive_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  commercial_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  lifecycle_status text NOT NULL,
  approval_status text NOT NULL,
  hubspot_sync_status text NOT NULL,
  enrichment_status text NOT NULL DEFAULT 'not_started',
  context_status text NOT NULL DEFAULT 'not_started',
  engagement_status text NOT NULL DEFAULT 'not_started',
  next_action text NOT NULL,
  assigned_owner text,
  agent_version text,
  scoring_version text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text NOT NULL,
  UNIQUE (tenant_id, professional_email, campaign_id)
);

CREATE INDEX ara_candidates_tenant_status_idx
  ON ara_candidates(tenant_id, lifecycle_status, approval_status);

CREATE INDEX ara_candidates_run_idx
  ON ara_candidates(tenant_id, run_id);

CREATE INDEX ara_candidates_domain_idx
  ON ara_candidates(tenant_id, domain);

CREATE INDEX ara_candidates_hubspot_contact_idx
  ON ara_candidates(tenant_id, hubspot_contact_id)
  WHERE hubspot_contact_id IS NOT NULL;
```

## Migration From `import_runs.candidates`

1. Keep current JSONB candidates untouched.
2. Add `ara_candidates` in B2.
3. Backfill only new runs initially.
4. Create adapter from current normalized Apollo candidate to ARA Candidate.
5. Use Candidate Inbox API from `ara_candidates`.
6. Retire JSONB candidate reads only after parity is proven.

## Rollback

- Stop writing to `ara_candidates`.
- Continue using `import_runs.candidates`.
- Drop new tables only after backup and review.

