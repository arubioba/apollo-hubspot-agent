# ARA 0.1 State Machine

## Purpose

`ara_lifecycle_status` controls ARA-managed contact lifecycle and membership in `ARA_Leads`.

## States

| State | Meaning | Previous states | Next states | Authorized service | In ARA_Leads | Recovery |
|---|---|---|---|---|---|---|
| `DISCOVERED` | Candidate found in Apollo or another source | none, `RETRY_PENDING` | `ICP_PENDING`, `DUPLICATE_FOUND`, `FAILED` | Discovery Agent | Yes if `ara_managed=true` and tenant matches | Retry discovery normalization |
| `ICP_PENDING` | Candidate awaits ICP/scoring decision | `DISCOVERED`, `RETRY_PENDING` | `ICP_ACCEPTED`, `ICP_REJECTED`, `HUMAN_REVIEW_REQUIRED`, `FAILED` | ICP and Scoring Service | Yes | Re-run scoring |
| `ICP_ACCEPTED` | Candidate meets ICP threshold | `ICP_PENDING`, `HUMAN_REVIEW_REQUIRED` | `HUBSPOT_SYNC_PENDING`, `ENRICHMENT_PENDING`, `DISQUALIFIED` | ICP and Scoring Service, Approval Service | Yes | Send to sync queue again |
| `ICP_REJECTED` | Candidate does not meet ICP | `ICP_PENDING`, `HUMAN_REVIEW_REQUIRED` | `ARCHIVED`, `ICP_PENDING` by override | ICP and Scoring Service, Approval Service | No | Admin override with reason |
| `DUPLICATE_FOUND` | Duplicate detected by email/domain/provider ID | `DISCOVERED`, `HUBSPOT_SYNC_PENDING` | `HUMAN_REVIEW_REQUIRED`, `ARCHIVED`, `HUBSPOT_SYNC_PENDING` | Deduplication Service | Yes unless archived/disqualified | Manual merge/override |
| `HUBSPOT_SYNC_PENDING` | Approved candidate waiting for HubSpot sync | `ICP_ACCEPTED`, `DUPLICATE_FOUND`, `RETRY_PENDING` | `HUBSPOT_SYNCED`, `FAILED`, `RETRY_PENDING` | ARA Core | Yes | Retry sync |
| `HUBSPOT_SYNCED` | Contact/company written or enriched in HubSpot | `HUBSPOT_SYNC_PENDING`, `RETRY_PENDING` | `ENRICHMENT_PENDING`, `HUMAN_REVIEW_REQUIRED`, `DISQUALIFIED`, `ARCHIVED` | HubSpot Connector | Yes | Audit and verify HubSpot object IDs |
| `ENRICHMENT_PENDING` | More data is needed before next action | `ICP_ACCEPTED`, `HUBSPOT_SYNCED` | `HUMAN_REVIEW_REQUIRED`, `HUBSPOT_SYNC_PENDING`, `DISQUALIFIED`, `FAILED` | Data Intelligence Agent or ARA Core | Yes | Re-run enrichment |
| `HUMAN_REVIEW_REQUIRED` | Needs human decision | `ICP_PENDING`, `DUPLICATE_FOUND`, `ENRICHMENT_PENDING`, `FAILED` | `ICP_ACCEPTED`, `ICP_REJECTED`, `DISQUALIFIED`, `HUBSPOT_SYNC_PENDING`, `ARCHIVED` | Approval Service | Yes unless reason excludes | Human decision |
| `DISQUALIFIED` | Not eligible due to business/legal rules | any non-terminal state | `ARCHIVED`, `HUMAN_REVIEW_REQUIRED` by override | Approval Service, ARA Core | No | Commercial/Admin override |
| `ARCHIVED` | Removed from active ARA operations | any state | `HUMAN_REVIEW_REQUIRED` by Admin override | ARA Core, Approval Service | No | Admin restore |
| `FAILED` | Processing failed and is not yet scheduled for retry | any processing state | `RETRY_PENDING`, `HUMAN_REVIEW_REQUIRED`, `ARCHIVED` | ARA Core | Yes unless excluded | Classify error |
| `RETRY_PENDING` | Retry scheduled after transient failure | `FAILED` | prior processing state, `FAILED`, `HUMAN_REVIEW_REQUIRED` | ARA Core | Yes unless excluded | Retry with backoff |

## Terminal-like States

- `ICP_REJECTED`
- `DISQUALIFIED`
- `ARCHIVED`

These can be reversed only through an audited Approval Service action.

## Membership Effect

Contacts are excluded from `ARA_Leads` when:

- `ara_lifecycle_status = ICP_REJECTED`
- `ara_lifecycle_status = DISQUALIFIED`
- `ara_lifecycle_status = ARCHIVED`
- `ara_managed = false`
- `ara_tenant_id` does not match list tenant

## State Change Audit

Every state change must record:

- `tenant_id`
- contact reference
- previous state
- next state
- service
- actor or system principal
- reason
- evidence
- timestamp

