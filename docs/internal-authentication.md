# Internal Authentication

## Scope

ARA 0.1 uses temporary internal admin authentication.

This is not full RBAC, sessions or OAuth. It is a safety gate for internal use while the system evolves.

## Header

Send:

```text
X-ARA-Admin-Token: <token>
```

The token is stored in Railway as:

```text
ARA_ADMIN_TOKEN
```

Do not put the token in URLs.

## Protected Endpoints

All API endpoints are protected except:

- `GET /health`
- static frontend assets

Protected examples:

- create run
- analyze filters
- Apollo search
- HubSpot preview/test/import
- diagnostics
- latest import audit

Denied attempts log `authorization.denied` without logging the token.

## Headers

- Correlation: `X-Correlation-ID`
- Temporary admin auth: `X-ARA-Admin-Token`

The admin token is never reflected in responses.
