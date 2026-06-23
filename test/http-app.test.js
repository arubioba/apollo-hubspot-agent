import test from "node:test";
import assert from "node:assert/strict";
import { ServerResponse } from "node:http";
import { PassThrough, Readable, Writable } from "node:stream";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { ApolloError, ApolloRateLimitError, HubSpotError, ValidationError } from "../src/errors.js";
import { getCorrelationId, isValidCorrelationId } from "../src/context.js";
import { serializeAuditRun, serializeRunCandidates } from "../src/http-serializers.js";

const original = {
  nodeEnv: config.nodeEnv,
  writeMode: config.writeMode,
  adminToken: config.adminToken
  , diagnosticsEnabled: config.diagnosticsEnabled,
  rateLimitEnabled: config.rateLimitEnabled,
  rateLimitMaxRequests: config.rateLimitMaxRequests,
  rateLimitWindowMs: config.rateLimitWindowMs,
  maxBodyBytes: config.maxBodyBytes
};

test.afterEach(() => {
  Object.assign(config, original);
});

function makeLogger() {
  const entries = [];
  const push = level => (event, message, metadata = {}) => entries.push({ level, event, message, metadata });
  return {
    entries,
    debug: push("debug"),
    info: push("info"),
    warn: push("warn"),
    error: push("error")
  };
}

function makeHandlers(overrides = {}) {
  return {
    verifyHubSpotConnection: async () => ({ ok: true }),
    verifyOpenAIConnection: async () => ({ ok: true }),
    latestImportAudit: async () => ({ found: false }),
    ensureHubSpotProperties: async () => ({ created: false }),
    startRun: async () => ({ run: { id: "run-1" }, message: "started" }),
    configureRun: async () => ({ run: { id: "run-1" }, message: "configured" }),
    analyzeFilters: async () => ({ run: { id: "run-1" }, interpretation: {}, message: "analyzed" }),
    approveRoles: async () => ({ run: { id: "run-1", candidates: [] }, message: "searched" }),
    applyRelaxation: async () => ({ run: { id: "run-1", candidates: [] }, message: "relaxed" }),
    executeTest: async () => ({ run: { id: "run-1" }, message: "Preview terminado. No se escribio en HubSpot." }),
    executeFinal: async () => ({ run: { id: "run-1" }, missing: 0, message: "Preview terminado." }),
    listRunCandidates: async () => ({
      run: { id: "run-1", status: "test_ready" },
      pagination: { page: 1, page_size: 25, total: 1 },
      candidates: [{ contact_id: "apollo-1", name: "Ana Diaz", company: "Example", title: "CIO", email: "ana@example.com", status: "candidate" }]
    }),
    ...overrides
  };
}

function makeApp(options = {}) {
  config.nodeEnv = options.nodeEnv || "test";
  config.writeMode = options.writeMode || "disabled";
  config.adminToken = "valid-token";
  config.diagnosticsEnabled = options.diagnosticsEnabled ?? false;
  config.rateLimitEnabled = options.rateLimitEnabled ?? false;
  config.rateLimitMaxRequests = options.rateLimitMaxRequests ?? 60;
  config.rateLimitWindowMs = options.rateLimitWindowMs ?? 60000;
  config.maxBodyBytes = options.maxBodyBytes ?? 262144;
  const logger = makeLogger();
  const app = createApp({
    config,
    logger,
    isDbReady: () => options.dbReady ?? true,
    getDbError: () => options.dbError || null,
    validate: () => options.validation || { ok: true, missing: [], errors: [] },
    handlers: makeHandlers(options.handlers),
    auth: options.auth,
    rateLimit: options.rateLimit
  });
  return { app, logger };
}

async function request(app, { method = "GET", url = "/", headers = {}, body } = {}) {
  if (body === undefined && ["POST", "PUT", "PATCH"].includes(method)) body = {};
  const payload = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);
  const req = new Readable({
    read() {
      if (payload === undefined) this.push(null);
      else {
        this.push(payload);
        this.push(null);
      }
    }
  });
  req.method = method;
  req.url = url;
  req.originalUrl = url;
  req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  req.get = name => req.headers[name.toLowerCase()];
  req.socket = new PassThrough();
  req.socket.remoteAddress = "127.0.0.1";

  if (["POST", "PUT", "PATCH"].includes(method) && !req.headers["content-type"]) {
    req.headers["content-type"] = "application/json";
  }
  if (payload !== undefined && !req.headers["content-length"]) {
    req.headers["content-length"] = Buffer.byteLength(payload).toString();
  }

  const chunks = [];
  const socket = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });
  socket.destroy = () => {};
  socket.cork = () => {};
  socket.uncork = () => {};
  const res = new ServerResponse(req);
  res.assignSocket(socket);

  await new Promise(resolve => {
    res.on("finish", resolve);
    app.handle(req, res);
  });

  const raw = Buffer.concat(chunks).toString("utf8");
  const text = raw.slice(raw.indexOf("\r\n\r\n") + 4);
  const responseHeaders = Object.fromEntries(Object.entries(res.getHeaders()).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    status: res.statusCode,
    headers: responseHeaders,
    text,
    body: text ? JSON.parse(text) : undefined
  };
}

test("GET /health responds without authentication and includes safe correlation data", async () => {
  const { app } = makeApp();
  const response = await request(app, { url: "/health" });
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "ara");
  assert.equal(response.body.environment, "test");
  assert.equal(response.body.write_mode, "disabled");
  assert.equal(isValidCorrelationId(response.headers["x-correlation-id"]), true);
  assert.equal(response.body.correlation_id, response.headers["x-correlation-id"]);
  assert.equal("missingConfig" in response.body, false);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
});

test("valid incoming correlation ID is preserved", async () => {
  const { app } = makeApp();
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await request(app, { url: "/health", headers: { "X-Correlation-ID": id } });
  assert.equal(response.headers["x-correlation-id"], id);
  assert.equal(response.body.correlation_id, id);
});

test("invalid incoming correlation ID is replaced", async () => {
  const { app } = makeApp();
  const response = await request(app, { url: "/health", headers: { "X-Correlation-ID": "bad" } });
  assert.equal(isValidCorrelationId(response.headers["x-correlation-id"]), true);
  assert.notEqual(response.headers["x-correlation-id"], "bad");
});

test("sensitive endpoint without token returns 401 without exposing token details", async () => {
  const { app } = makeApp();
  const response = await request(app, { method: "POST", url: "/api/runs" });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "AUTHENTICATION_ERROR");
  assert.equal(response.text.includes("valid-token"), false);
  assert.equal(isValidCorrelationId(response.body.correlation_id), true);
});

test("sensitive endpoint with invalid token returns 401 and logs denied event", async () => {
  const { app, logger } = makeApp();
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "wrong-token" }
  });
  assert.equal(response.status, 401);
  assert.equal(response.text.includes("wrong-token"), false);
  assert.equal(logger.entries.some(entry => entry.event === "http.request.failed"), true);
});

test("sensitive endpoint with valid token continues and preserves contract", async () => {
  const { app } = makeApp();
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.id, "run-1");
  assert.equal(response.body.message, "started");
  assert.equal(isValidCorrelationId(response.body.correlationId), true);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("diagnostics are blocked by default", async () => {
  const { app } = makeApp();
  const response = await request(app, {
    method: "GET",
    url: "/api/diagnostics/hubspot",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "DIAGNOSTICS_DISABLED");
});

test("diagnostics can be enabled in test and stay sanitized", async () => {
  const { app } = makeApp({ diagnosticsEnabled: true });
  const response = await request(app, {
    method: "GET",
    url: "/api/diagnostics/hubspot",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body.diagnostic).sort(), ["checked_at", "provider", "status"]);
  assert.equal(response.text.includes("token"), false);
});

test("disabled write endpoint returns safe blocked response", async () => {
  const { app } = makeApp({
    handlers: {
      executeTest: async () => {
        throw Object.assign(new Error("HubSpot write blocked because ARA_WRITE_MODE=disabled."), {
          code: "HUBSPOT_WRITE_BLOCKED",
          status: 403,
          expose: true
        });
      }
    }
  });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs/run-1/test",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "HUBSPOT_WRITE_BLOCKED");
  assert.equal(response.text.includes("stack"), false);
});

test("preview endpoint can return simulated result without write methods", async () => {
  const { app } = makeApp({ writeMode: "preview" });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs/run-1/test",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.message, "Preview terminado. No se escribio en HubSpot.");
});

test("validation error returns controlled 400", async () => {
  const { app } = makeApp({ handlers: { analyzeFilters: async () => { throw new ValidationError("Bad filters."); } } });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs/run-1/analyze",
    headers: { "X-ARA-Admin-Token": "valid-token" },
    body: {}
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
  assert.equal(response.text.includes("stack"), false);
});

test("Apollo and HubSpot errors are sanitized", async () => {
  const { app } = makeApp({ handlers: { approveRoles: async () => { throw new ApolloError("Provider token abc failed."); } } });
  const apollo = await request(app, {
    method: "POST",
    url: "/api/runs/run-1/approve-roles",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(apollo.status, 502);
  assert.equal(apollo.body.error.code, "APOLLO_ERROR");
  assert.equal(apollo.body.error.message, "Unexpected server error.");

  const { app: app2 } = makeApp({ handlers: { executeFinal: async () => { throw new HubSpotError("HubSpot internal details."); } } });
  const hubspot = await request(app2, {
    method: "POST",
    url: "/api/runs/run-1/import",
    headers: { "X-ARA-Admin-Token": "valid-token" },
    body: {}
  });
  assert.equal(hubspot.status, 502);
  assert.equal(hubspot.body.error.code, "HUBSPOT_ERROR");
  assert.equal(hubspot.body.error.message, "Unexpected server error.");
});

test("Apollo rate limit returns controlled 429", async () => {
  const { app } = makeApp({ handlers: { approveRoles: async () => { throw new ApolloRateLimitError(); } } });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs/run-1/approve-roles",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 429);
  assert.equal(response.body.error.code, "APOLLO_RATE_LIMIT_ERROR");
});

test("unexpected errors return 500 with correlation id", async () => {
  const { app } = makeApp({ handlers: { startRun: async () => { throw new Error("boom with stack"); } } });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "UNEXPECTED_ERROR");
  assert.equal(response.body.error.message, "Unexpected server error.");
  assert.equal(isValidCorrelationId(response.body.correlation_id), true);
  assert.equal(response.text.includes("stack"), false);
});

test("handler can observe correlation id in internal context", async () => {
  let observed;
  const { app } = makeApp({ handlers: { startRun: async () => { observed = getCorrelationId(); return { ok: true }; } } });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(observed, response.headers["x-correlation-id"]);
});

test("POST API rejects incorrect content type", async () => {
  const { app } = makeApp();
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "valid-token", "Content-Type": "text/plain" },
    body: "hello"
  });
  assert.equal(response.status, 415);
  assert.equal(response.body.error.code, "UNSUPPORTED_CONTENT_TYPE");
});

test("POST API rejects invalid JSON with safe error contract", async () => {
  const { app } = makeApp();
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "valid-token" },
    body: "{"
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_JSON");
  assert.equal(response.text.includes("SyntaxError"), false);
});

test("POST API rejects oversized JSON with safe error contract", async () => {
  const { app } = makeApp({ maxBodyBytes: 16 });
  const response = await request(app, {
    method: "POST",
    url: "/api/runs",
    headers: { "X-ARA-Admin-Token": "valid-token" },
    body: { big: "x".repeat(128) }
  });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, "PAYLOAD_TOO_LARGE");
});

test("audit serializer returns summary without PII or JSONB payloads", () => {
  const result = serializeAuditRun({
    id: "run-1",
    phase: "complete",
    correlation_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-06-23T00:00:00Z",
    updated_at: "2026-06-23T00:05:00Z",
    filters: { industry: "Banca", adHocBrief: "secret-ish brief" },
    candidates: [{ email: "ana@example.com" }],
    test_results: { successful: [{ email: "ana@example.com" }], failed: [] },
    final_results: { successful: [], failed: [] }
  });
  assert.equal(result.run.candidate_count, 1);
  assert.equal(JSON.stringify(result).includes("ana@example.com"), false);
  assert.equal("filters" in result.run, false);
});

test("audit endpoint returns only sanitized run summary", async () => {
  const { app } = makeApp({
    handlers: {
      latestImportAudit: async () => serializeAuditRun({
        id: "run-1",
        phase: "complete",
        correlation_id: "11111111-1111-4111-8111-111111111111",
        created_at: "2026-06-23T00:00:00Z",
        updated_at: "2026-06-23T00:05:00Z",
        candidates: [{ email: "ana@example.com", rawPayload: { token: "secret" } }],
        test_results: { successful: [{ email: "ana@example.com" }], failed: [] },
        final_results: { successful: [], failed: [] }
      })
    }
  });
  const response = await request(app, {
    method: "GET",
    url: "/api/audit/latest-import",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.run.candidate_count, 1);
  assert.equal(response.text.includes("ana@example.com"), false);
  assert.equal(response.text.includes("rawPayload"), false);
});

test("candidate serializer is paginated and excludes raw provider payload", () => {
  const result = serializeRunCandidates({
    id: "run-1",
    phase: "test_ready",
    correlation_id: "11111111-1111-4111-8111-111111111111",
    candidates: [{
      apolloId: "apollo-1",
      firstName: "Ana",
      lastName: "Diaz",
      email: "ana@example.com",
      title: "CIO",
      linkedin: "https://linkedin.example/ana",
      emailVerified: true,
      validPhones: [{ sanitized_number: "+525511112222" }],
      company: { name: "Example", domain: "example.com" },
      rawPayload: { secret: "nope" }
    }],
    testResults: {},
    finalResults: {}
  }, { page: 1, pageSize: 1 });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].email, "ana@example.com");
  assert.equal("rawPayload" in result.candidates[0], false);
});

test("candidate endpoint returns operational candidate list", async () => {
  const { app } = makeApp();
  const response = await request(app, {
    method: "GET",
    url: "/api/import-runs/run-1/candidates",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.candidates[0].email, "ana@example.com");
  assert.equal("rawPayload" in response.body.candidates[0], false);
});

test("database errors are sanitized", async () => {
  const { app } = makeApp({
    handlers: {
      latestImportAudit: async () => {
        throw Object.assign(new Error("select * from private_tokens failed"), {
          code: "DATABASE_ERROR",
          status: 500,
          expose: false
        });
      }
    }
  });
  const response = await request(app, {
    method: "GET",
    url: "/api/audit/latest-import",
    headers: { "X-ARA-Admin-Token": "valid-token" }
  });
  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "DATABASE_ERROR");
  assert.equal(response.text.includes("private_tokens"), false);
});

test("rate limiter can block repeated user requests", async () => {
  let count = 0;
  const { app } = makeApp({
    rateLimit: () => {
      count += 1;
      if (count > 1) throw Object.assign(new Error("Too many requests."), { code: "RATE_LIMITED", status: 429, expose: true });
    }
  });
  const headers = { "X-ARA-Admin-Token": "valid-token" };
  assert.equal((await request(app, { method: "POST", url: "/api/runs", headers })).status, 200);
  const blocked = await request(app, { method: "POST", url: "/api/runs", headers });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");
});
