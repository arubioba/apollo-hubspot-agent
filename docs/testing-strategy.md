# Testing Strategy

## Current Command

```bash
npm test
```

Full validation:

```bash
npm run check
```

## Safety Rules

- No automated test should call Apollo.
- No automated test should write to HubSpot.
- No automated test should require real credentials.
- Tests should force `ARA_WRITE_MODE=disabled` or `preview`.

## Current Coverage

- Phone mapping.
- Work HQ exclusion.
- Correlation ID generation and propagation.
- Internal auth accept/reject.
- Environment validation.
- Write guard.
- Preview behavior without `fetch`.
- Disabled write behavior without `fetch`.
- Email and phone masking.
- Secret redaction.
- HTTP app behavior without opening an external listener.
- Public health check.
- Protected endpoint authentication.
- Sanitized HTTP errors.
- Correlation headers and body values.
- Diagnostics disabled by default and sanitized when enabled.
- Audit summary without candidate PII or raw provider payloads.
- Paginated candidate endpoint preserving commercial visibility.
- Wrong content type, invalid JSON and oversized payload errors.
- Local rate limiter behavior.
- Sanitized provider, database and unexpected errors.

## Remaining Gaps

- Full mocked run execution.
- Apollo rate-limit path through `findApolloCandidates`.
- HubSpot duplicate handling with mocked search.
- Database persistence failure in full run execution.
