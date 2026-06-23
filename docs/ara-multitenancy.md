# ARA Multi-tenancy Design

## Goal

ARA starts internally for Freelan but must support future client onboarding with each client's own Apollo and HubSpot accounts. Multi-tenancy must be designed before broadening usage.

## Core Rule

Every operation, query, log, audit event, run, candidate, contact and company record must include `tenant_id`.

## Tenant Model

Recommended table: `tenants`

Fields:

- `id`
- `slug`
- `name`
- `status`: `ACTIVE`, `SUSPENDED`, `ARCHIVED`
- `created_at`
- `updated_at`

Initial tenant:

- `freelan`

## Tenant Configuration

Recommended table: `tenant_configurations`

Fields:

- `tenant_id`
- `hubspot_credential_ref`
- `apollo_credential_ref`
- `openai_policy_ref`
- `default_timezone`
- `daily_import_limit`
- `test_batch_size`
- `default_country_scope`
- `created_at`
- `updated_at`

## Credential References

ARA should not store raw secrets directly in ordinary relational tables.

Recommended approach for Railway MVP:

- Store secrets as Railway variables per environment.
- Store only reference keys in database, for example `railway:HUBSPOT_TOKEN_FREELAN`.
- Connector resolves reference at runtime through environment or a future secret manager.

Future approach:

- Dedicated secret manager.
- Per-tenant encrypted secret material.
- Rotation metadata and last validation result.

## Tenant-specific Field Mappings

Recommended table: `tenant_hubspot_field_mappings`

Fields:

- `tenant_id`
- `object_type`: `contact`, `company`, `deal`
- `ara_field`
- `hubspot_property`
- `write_policy`: `FILL_BLANK_ONLY`, `OVERWRITE`, `APPEND`, `READ_ONLY`
- `required`
- `created_at`
- `updated_at`

Default mapping includes the current HubSpot mapping plus `ara_*` properties.

## Tenant-specific ICP

Recommended table: `tenant_icp_profiles`

Fields:

- `tenant_id`
- `icp_id`
- `name`
- `industries`
- `employee_min`
- `employee_max`
- `countries`
- `roles`
- `disqualifiers`
- `signals`
- `status`

## Tenant-specific Scoring

Recommended table: `tenant_scoring_rules`

Fields:

- `tenant_id`
- `rule_id`
- `score_type`: `ICP`, `CONTACT`, `OPPORTUNITY`, `DATA_CONFIDENCE`
- `condition`
- `weight`
- `enabled`

## Tenant-specific HubSpot List Configuration

Recommended table: `tenant_hubspot_list_configurations`

Fields:

- `tenant_id`
- `ara_leads_list_id`
- `ara_leads_list_name`
- `membership_strategy`: `ACTIVE_LIST_BY_PROPERTIES`
- `snapshot_lists_enabled`
- `created_at`
- `updated_at`

Initial Freelan list:

- `ARA_Leads`

## Tenant-specific Approval Rules

Recommended table: `tenant_approval_rules`

Fields:

- `tenant_id`
- `action`
- `threshold`
- `required_role`: `OPERATOR`, `ADMIN`, `COMMERCIAL_APPROVER`
- `expires_after_minutes`
- `enabled`

Example:

- Import more than 50 contacts requires `COMMERCIAL_APPROVER`.

## Tenant-specific Feature Flags

Recommended table: `tenant_feature_flags`

Fields:

- `tenant_id`
- `flag`
- `enabled`
- `metadata`

Initial flags:

- `ara.discovery.enabled`
- `ara.hubspot_sync.enabled`
- `ara.static_snapshot_lists.enabled`
- `ara.latenode.enabled`
- `ara.engagement.enabled` default `false`

## Isolation Requirements

- No shared cache keys without tenant prefix.
- No logs with PII unless tenant scoped and access controlled.
- No cross-tenant run lookup.
- No cross-tenant audit lookup.
- No connector call without tenant configuration.
- No fallback to global credentials when tenant credentials are missing.

## Test Requirements

- Tenant A cannot read Tenant B runs.
- Tenant A cannot use Tenant B credential reference.
- Tenant A cannot sync to Tenant B HubSpot list.
- Audit events are always tenant scoped.
- Feature flags are tenant scoped.

