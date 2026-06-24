# ARA HubSpot Properties

## Purpose

ARA uses HubSpot contact properties as the operational control plane for `ARA_Leads`. These properties must not be created in production until approved and tested in sandbox or controlled environment.

## Property Group

Recommended group:

- Label: `ARA`
- Internal group name: `ara`

If HubSpot does not allow custom group name `ara`, use a tenant-approved group and document the final internal name.

## Contact Properties

| Internal name | Label | Type | Field type | Allowed values | Required for ARA_Leads |
|---|---|---|---|---|---|
| `ara_managed` | ARA Managed | bool | booleancheckbox | true/false | Yes |
| `ara_tenant_id` | ARA Tenant ID | string | text | tenant slug | Yes |
| `ara_campaign_id` | ARA Campaign ID | string | text | campaign ID | No |
| `ara_run_id` | ARA Run ID | string | text | run UUID | No |
| `ara_lifecycle_status` | ARA Lifecycle Status | enumeration | select | state machine values | Yes |
| `ara_icp_score` | ARA ICP Score | number | number | 0-100 | No |
| `ara_contact_score` | ARA Contact Score | number | number | 0-100 | No |
| `ara_opportunity_score` | ARA Opportunity Score | number | number | 0-100 | No |
| `ara_source` | ARA Source | enumeration | select | `APOLLO`, `MANUAL`, `IMPORT`, `HUBSPOT`, `OTHER` | No |
| `ara_discovered_at` | ARA Discovered At | datetime | date | datetime | No |
| `ara_last_processed_at` | ARA Last Processed At | datetime | date | datetime | No |
| `ara_owner_approval_status` | ARA Owner Approval Status | enumeration | select | `NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` | No |
| `ara_exclusion_reason` | ARA Exclusion Reason | string | textarea | reason text/code | No |
| `ara_data_confidence` | ARA Data Confidence | number | number | 0-100 | No |
| `ara_current_agent` | ARA Current Agent | enumeration | select | `DISCOVERY`, `DATA_INTELLIGENCE`, `ACCOUNT_INTELLIGENCE`, `ENGAGEMENT`, `HUBSPOT_CONNECTOR`, `NONE` | No |

## Status Values

`ara_lifecycle_status` values:

- `DISCOVERED`
- `ICP_PENDING`
- `ICP_ACCEPTED`
- `ICP_REJECTED`
- `DUPLICATE_FOUND`
- `HUBSPOT_SYNC_PENDING`
- `HUBSPOT_SYNCED`
- `ENRICHMENT_PENDING`
- `HUMAN_REVIEW_REQUIRED`
- `DISQUALIFIED`
- `ARCHIVED`
- `FAILED`
- `RETRY_PENDING`

## Write Policies

| Property | Policy |
|---|---|
| `ara_managed` | ARA may overwrite |
| `ara_tenant_id` | Write once, Admin override only |
| `ara_campaign_id` | ARA may overwrite with latest campaign |
| `ara_run_id` | ARA may overwrite with latest run |
| `ara_lifecycle_status` | State machine only |
| Scores | Scoring Service only |
| `ara_source` | Discovery Agent writes first source; Admin override allowed |
| Dates | System generated |
| Approval status | Approval Service only |
| Exclusion reason | Required for exclusion states |
| Current agent | ARA Core controls |

## Existing Property Compatibility

Current system writes:

- `freelan_icp_match_context`
- `hs_whatsapp_phone_number`
- standard contact fields
- company fields including `apollo_company_keywords`

Recommendation:

- Keep `freelan_icp_match_context` during migration.
- Add future `ara_icp_evidence` only if needed after ARA 0.1.
- Do not remove existing mappings in the first ARA release.

## Creation Strategy

1. Define property spec in repo.
2. Add dry-run validation script in future implementation.
3. Create in sandbox/control environment.
4. Configure active list.
5. Validate membership.
6. Require approval before production.

