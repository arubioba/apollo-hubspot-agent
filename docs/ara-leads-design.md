# ARA_Leads Design

## Decision

`ARA_Leads` will be a HubSpot active contact list. ARA will not manually add contacts to the list. Membership will be derived from `ara_*` contact properties.

## Justification For Active List

An active list is safer than manual list membership because:

- HubSpot membership is derived from explicit state.
- ARA can reverse membership by changing properties.
- The list remains understandable to CRM operators.
- It supports tenant-specific operational views.
- It avoids treating HubSpot list membership as the source of truth.

Source of truth:

1. HubSpot `ara_*` properties.
2. ARA operational database.
3. ARA audit history.

## Initial Membership Criteria

A contact belongs to `ARA_Leads` when all criteria are true:

- `ara_managed = true`
- `ara_tenant_id = freelan`
- `ara_lifecycle_status` is not `ICP_REJECTED`
- `ara_lifecycle_status` is not `DISQUALIFIED`
- `ara_lifecycle_status` is not `ARCHIVED`

Recommended additional criteria before production:

- `ara_lifecycle_status` is one of `ICP_ACCEPTED`, `HUBSPOT_SYNCED`, `ENRICHMENT_PENDING`, `HUMAN_REVIEW_REQUIRED`, `RETRY_PENDING`
- Contact has not opted out of communication if ARA later adds engagement features.

## Required Properties

| Property | Type | Allowed values | Owner service |
|---|---|---|---|
| `ara_managed` | boolean | `true`, `false` | HubSpot Connector |
| `ara_tenant_id` | single-line text or enumeration | tenant IDs, initially `freelan` | Tenant Configuration Service |
| `ara_campaign_id` | single-line text | ARA campaign IDs | ARA Core |
| `ara_run_id` | single-line text | run UUIDs | ARA Core |
| `ara_lifecycle_status` | enumeration | see state machine | ARA Core |
| `ara_icp_score` | number | 0-100 | ICP and Scoring Service |
| `ara_contact_score` | number | 0-100 | ICP and Scoring Service |
| `ara_opportunity_score` | number | 0-100 | ICP and Scoring Service |
| `ara_source` | enumeration | `APOLLO`, `MANUAL`, `IMPORT`, `HUBSPOT`, `OTHER` | Discovery Agent |
| `ara_discovered_at` | datetime | ISO datetime | Discovery Agent |
| `ara_last_processed_at` | datetime | ISO datetime | ARA Core |
| `ara_owner_approval_status` | enumeration | `NOT_REQUIRED`, `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` | Approval Service |
| `ara_exclusion_reason` | multi-line text or enumeration plus text | reason codes | ARA Core / Approval Service |
| `ara_data_confidence` | number | 0-100 | ICP and Scoring Service |
| `ara_current_agent` | enumeration | `DISCOVERY`, `DATA_INTELLIGENCE`, `ACCOUNT_INTELLIGENCE`, `ENGAGEMENT`, `HUBSPOT_CONNECTOR`, `NONE` | ARA Core |

## Rules Of Update

- `ara_managed` is set to `true` only after ARA decides the contact is under ARA control for the tenant.
- `ara_tenant_id` is immutable after first write except by Admin override.
- `ara_campaign_id` can change only through ARA Core.
- `ara_run_id` stores the last run that processed the contact.
- Scores are recalculated by Scoring Service, never manually.
- `ara_lifecycle_status` changes only through the state machine.
- `ara_owner_approval_status` changes only through Approval Service.
- `ara_exclusion_reason` must be populated when status becomes `ICP_REJECTED`, `DISQUALIFIED` or `ARCHIVED`.

## Entry Rules

A contact enters the active list when:

1. ARA sets `ara_managed = true`.
2. ARA sets `ara_tenant_id`.
3. Status is not an exclusion state.
4. HubSpot active list recalculates membership.

Recommended entry status for new accepted contacts:

- `HUBSPOT_SYNCED` after successful HubSpot sync.

## Exit Rules

A contact exits the active list when:

- `ara_managed = false`
- `ara_tenant_id` no longer matches the list tenant
- `ara_lifecycle_status = ICP_REJECTED`
- `ara_lifecycle_status = DISQUALIFIED`
- `ara_lifecycle_status = ARCHIVED`

## Rejected Contacts

Rejected contacts:

- Status: `ICP_REJECTED`
- Must include `ara_exclusion_reason`.
- Stay in ARA audit history.
- Do not belong to `ARA_Leads`.
- Can be reconsidered only through explicit Admin or Commercial Approver action.

## Disqualified Contacts

Disqualified contacts:

- Status: `DISQUALIFIED`.
- Must include reason.
- Do not belong to `ARA_Leads`.
- Should not be rediscovered unless the tenant's disqualification policy expires or is overridden.

## Current Customers

Recommended rule:

- If contact belongs to a current customer account, do not include in acquisition `ARA_Leads` by default.
- Set status to `HUMAN_REVIEW_REQUIRED` or `DISQUALIFIED` depending on tenant policy.
- Add `ara_exclusion_reason = CURRENT_CUSTOMER` if excluded.

## Open Opportunities

Recommended rule:

- If a contact is associated with an open opportunity/deal, avoid duplicate prospecting.
- Set `HUMAN_REVIEW_REQUIRED` unless campaign is explicitly expansion/cross-sell.

## Opt-out Contacts

For ARA 0.1 there is no email sending, but opt-out still matters.

Recommended rule:

- If HubSpot indicates opt-out or legal basis restriction, keep contact out of engagement workflows.
- For pure discovery, status may remain visible, but `ara_current_agent` must not move to `ENGAGEMENT`.

## Optional Static Lists

Static lists may be created later as historical campaign or run snapshots:

- `ARA_Run_<run_id>`
- `ARA_Campaign_<campaign_id>`

Rules:

- Static lists are not source of truth.
- Static lists are optional.
- Static lists require approval if created in production.
- Static list creation should be audited.

## Reversal Plan

To reverse ARA_Leads inclusion:

1. Set `ara_lifecycle_status = ARCHIVED` or `ara_managed = false`.
2. Keep audit event.
3. Confirm active list recalculation.
4. If a property was incorrectly written, restore previous value from audit snapshot where available.
5. Do not delete HubSpot contacts automatically.

