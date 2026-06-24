# Data Exposure Policy

## Principle

ARA must expose the least data necessary for each workflow. Technical audit endpoints and commercial operating endpoints are separate contracts.

## Audit Summary

`GET /api/audit/latest-import` returns a sanitized run summary:

```json
{
  "found": true,
  "run": {
    "id": "run-123",
    "correlation_id": "11111111-1111-4111-8111-111111111111",
    "status": "complete",
    "mode": "preview",
    "started_at": "2026-06-23T00:00:00.000Z",
    "completed_at": "2026-06-23T00:05:00.000Z",
    "candidate_count": 5,
    "accepted_count": 4,
    "rejected_count": 1,
    "error_count": 1
  },
  "correlationId": "22222222-2222-4222-8222-222222222222"
}
```

It must not return:

- Apollo raw payloads.
- HubSpot raw payloads.
- API keys, tokens, headers or request bodies.
- Full candidate objects.
- Unneeded PII such as phone payloads.
- Stack traces or SQL/provider internals.

## Candidate Operations

`GET /api/import-runs/:runId/candidates?page=1&page_size=25` returns only the fields needed for commercial review:

```json
{
  "run": {
    "id": "run-123",
    "correlation_id": "11111111-1111-4111-8111-111111111111",
    "status": "test_ready"
  },
  "pagination": {
    "page": 1,
    "page_size": 25,
    "total": 5
  },
  "candidates": [
    {
      "contact_id": "apollo-person-id",
      "company_id": "hubspot-company-id",
      "name": "Ana Diaz",
      "company": "Example SA",
      "title": "CIO",
      "email": "ana@example.com",
      "linkedin_url": "https://linkedin.com/in/example",
      "icp_score": 87,
      "contact_relevance_score": 91,
      "status": "candidate",
      "reasons": ["verified_email", "company_domain_available"],
      "hubspot_sync_status": "pending"
    }
  ]
}
```

This endpoint is protected by `X-ARA-Admin-Token` and paginated. It preserves ARA's ability to show contacts found without turning the audit endpoint into a PII dump.

