# Staging Smoke Tests

## Command

```bash
npm run smoke:staging
```

The script runs in memory and does not open a public port.

## What It Checks

1. App can be created in memory.
2. `/health` responds.
3. Correlation ID is returned.
4. Protected endpoints reject missing token.
5. Valid staging token allows protected access.
6. Diagnostics remains blocked.
7. Audit endpoint returns sanitized mock summary.
8. Candidates endpoint returns sanitized mock candidate data.
9. UI root is accessible.
10. Write mode disabled blocks write-like operation.
11. No external Apollo calls.
12. No external HubSpot calls.

## Mock Strategy

The script injects mock handlers into `createApp()` and replaces `globalThis.fetch` with a throwing function. If any code path attempts a real external HTTP call, the smoke test fails.

Mock candidate data uses synthetic `.test` addresses and fake companies. No production PII is required or allowed.

## Expected Output

Each check prints:

```text
PASS <check name>
```

Successful completion prints:

```text
Staging smoke test completed successfully.
```

Any failed assertion exits with a non-zero status.

## When To Run

- Before opening a PR into `develop`.
- After merging Safety Baseline into `develop`.
- Before first Railway staging deployment.
- After changing environment variables.
- After Connector Extraction changes.

## Limitations

- It does not verify real Railway networking.
- It does not verify real PostgreSQL connectivity.
- It does not call Apollo, HubSpot or OpenAI.
- It is a smoke test, not a full end-to-end suite.

## Operational Summary (ES)

Ejecuta `npm run smoke:staging` antes de validar staging. Si falla, no despliegues. El script usa mocks y bloquea llamadas externas para confirmar que no consume Apollo ni escribe en HubSpot.

