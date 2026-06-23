# Logging Events

## Format

Logs are JSON lines readable in Railway.

```json
{
  "timestamp": "2026-06-23T00:00:00.000Z",
  "level": "info",
  "service": "ara",
  "environment": "production",
  "correlation_id": "uuid",
  "event": "run.started",
  "message": "Import run started.",
  "duration_ms": 123,
  "metadata": {}
}
```

## Events

- `run.started`
- `run.completed`
- `run.failed`
- `apollo.search.started`
- `apollo.search.completed`
- `apollo.search.failed`
- `candidate.normalized`
- `candidate.rejected`
- `hubspot.preview.completed`
- `hubspot.sync.started`
- `hubspot.sync.completed`
- `hubspot.sync.failed`
- `database.write.failed`
- `configuration.invalid`
- `authorization.denied`
- `http.request.started`
- `http.request.completed`
- `http.request.failed`
- `server.started`
- `server.stopping`
- `server.stopped`
- `server.startup_failed`

## Redaction

The logger redacts:

- tokens
- API keys
- authorization headers
- secrets
- passwords

It masks:

- emails
- phone numbers

Use `correlation_id` to locate a run across logs.
