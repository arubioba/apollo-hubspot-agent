import assert from "node:assert/strict";
import { PassThrough, Readable, Writable } from "node:stream";
import { ServerResponse } from "node:http";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { isValidCorrelationId } from "../src/context.js";
import { serializeAuditRun, serializeRunCandidates } from "../src/http-serializers.js";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("External fetch is not allowed during staging smoke tests.");
};

const smokeConfig = {
  ...config,
  nodeEnv: "staging",
  writeMode: "disabled",
  externalServicesMode: "mock",
  diagnosticsEnabled: false,
  rateLimitEnabled: false,
  adminToken: "staging-smoke-token",
  databaseUrl: "postgresql://localhost:5432/smoke",
  apolloKey: "mock-apollo-key",
  hubspotToken: "mock-hubspot-token",
  openaiKey: "mock-openai-key",
  approvalCode: "mock-approval-code",
  maxBodyBytes: 262144
};

Object.assign(config, smokeConfig);

const logger = {
  entries: [],
  debug(event, message, metadata = {}) { this.entries.push({ level: "debug", event, message, metadata }); },
  info(event, message, metadata = {}) { this.entries.push({ level: "info", event, message, metadata }); },
  warn(event, message, metadata = {}) { this.entries.push({ level: "warn", event, message, metadata }); },
  error(event, message, metadata = {}) { this.entries.push({ level: "error", event, message, metadata }); }
};

const sampleRun = {
  id: "smoke-run-1",
  phase: "test_ready",
  correlation_id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-06-23T00:00:00.000Z",
  updated_at: "2026-06-23T00:01:00.000Z",
  filters: { writeMode: "disabled" },
  candidates: [{
    apolloId: "apollo-smoke-1",
    firstName: "Alicia",
    lastName: "Smoke",
    email: "alicia.smoke@example.test",
    title: "CIO",
    linkedin: "https://linkedin.com/in/alicia-smoke",
    emailVerified: true,
    icpScore: 91,
    contactScore: 88,
    validPhones: [{ sanitized_number: "+525500000001" }],
    company: { name: "Smoke Example SA", domain: "smoke-example.test" },
    rawPayload: { must_not_leak: true }
  }],
  test_results: { successful: [], failed: [] },
  final_results: { successful: [], failed: [] }
};

const app = createApp({
  config: smokeConfig,
  logger,
  isDbReady: () => true,
  getDbError: () => null,
  validate: () => ({ ok: true, missing: [], errors: [] }),
  handlers: {
    verifyHubSpotConnection: async () => ({ ok: true }),
    verifyOpenAIConnection: async () => ({ ok: true }),
    latestImportAudit: async () => serializeAuditRun(sampleRun),
    listCandidateInbox: async () => ({
      pagination: { page: 1, page_size: 1, total: 1 },
      candidates: [{
        candidate_id: "candidate-smoke-1",
        name: "Alicia Smoke",
        company: "Smoke Example SA",
        title: "CIO",
        email: "alicia.smoke@example.test",
        opportunity_score: 91,
        lifecycle_status: "RECOMMENDED",
        approval_status: "PENDING",
        hubspot_sync_status: "pending",
        next_action: "commercial_approval",
        evidence: [{ code: "verified_email", message: "Email laboral verificado." }]
      }]
    }),
    listRunCandidates: async (_runId, query = {}) => serializeRunCandidates(sampleRun, {
      page: Math.max(1, Number(query.page || 1)),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size || 25)))
    }),
    ensureHubSpotProperties: async () => {
      throw new AppError("HubSpot write blocked because ARA_WRITE_MODE=disabled.", {
        code: "HUBSPOT_WRITE_BLOCKED",
        status: 403,
        expose: true
      });
    },
    startRun: async () => ({ run: { id: sampleRun.id }, message: "started" }),
    configureRun: async () => ({ run: { id: sampleRun.id }, message: "configured" }),
    analyzeFilters: async () => ({ run: { id: sampleRun.id }, message: "analyzed" }),
    approveRoles: async () => ({ run: sampleRun, message: "searched" }),
    applyRelaxation: async () => ({ run: sampleRun, message: "relaxed" }),
    executeTest: async () => ({ run: sampleRun, message: "Preview terminado. No se escribio en HubSpot." }),
    executeFinal: async () => {
      throw new AppError("HubSpot write blocked because ARA_WRITE_MODE=disabled.", {
        code: "HUBSPOT_WRITE_BLOCKED",
        status: 403,
        expose: true
      });
    }
  }
});

async function request({ method = "GET", url = "/", headers = {}, body } = {}) {
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
  if (["POST", "PUT", "PATCH"].includes(method) && !req.headers["content-type"]) req.headers["content-type"] = "application/json";
  if (payload !== undefined && !req.headers["content-length"]) req.headers["content-length"] = Buffer.byteLength(payload).toString();

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
  return {
    status: res.statusCode,
    headers: Object.fromEntries(Object.entries(res.getHeaders()).map(([key, value]) => [key.toLowerCase(), value])),
    text,
    body: text && text.trim().startsWith("{") ? JSON.parse(text) : undefined
  };
}

async function check(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
}

try {
  await check("app starts in memory", async () => {
    assert.ok(app);
  });

  await check("health responds with correlation ID", async () => {
    const response = await request({ url: "/health" });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(isValidCorrelationId(response.headers["x-correlation-id"]), true);
  });

  await check("protected endpoints reject missing token", async () => {
    const response = await request({ url: "/api/audit/latest-import" });
    assert.equal(response.status, 401);
  });

  const auth = { "X-ARA-Admin-Token": smokeConfig.adminToken };

  await check("valid staging token allows protected access", async () => {
    const response = await request({ url: "/api/audit/latest-import", headers: auth });
    assert.equal(response.status, 200);
    assert.equal(response.body.found, true);
  });

  await check("diagnostics remains blocked", async () => {
    const response = await request({ url: "/api/diagnostics/hubspot", headers: auth });
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, "DIAGNOSTICS_DISABLED");
  });

  await check("audit summary is sanitized", async () => {
    const response = await request({ url: "/api/audit/latest-import", headers: auth });
    assert.equal(response.body.run.candidate_count, 1);
    assert.equal(response.text.includes("rawPayload"), false);
  });

  await check("candidates endpoint returns operational candidate", async () => {
    const response = await request({ url: "/api/import-runs/smoke-run-1/candidates?page_size=1", headers: auth });
    assert.equal(response.status, 200);
    assert.equal(response.body.candidates.length, 1);
    assert.equal(response.body.candidates[0].email, "alicia.smoke@example.test");
    assert.equal(response.text.includes("must_not_leak"), false);
  });

  await check("candidate inbox returns durable ARA candidate", async () => {
    const response = await request({ url: "/api/candidates?run_id=smoke-run-1&page_size=1", headers: auth });
    assert.equal(response.status, 200);
    assert.equal(response.body.candidates[0].candidate_id, "candidate-smoke-1");
    assert.equal(response.body.candidates[0].opportunity_score, 91);
  });

  await check("write mode disabled blocks writes", async () => {
    const response = await request({
      method: "POST",
      url: "/api/setup/hubspot-properties",
      headers: auth,
      body: {}
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "HUBSPOT_WRITE_BLOCKED");
  });

  await check("UI is accessible", async () => {
    const response = await request({ url: "/" });
    assert.equal(response.status, 200);
    assert.equal(response.text.includes("ARA Operator Console"), true);
  });

  await check("no external Apollo or HubSpot calls were made", async () => {
    assert.equal(logger.entries.some(entry => JSON.stringify(entry).includes("api.apollo.io")), false);
    assert.equal(logger.entries.some(entry => JSON.stringify(entry).includes("api.hubapi.com")), false);
  });

  console.log("Staging smoke test completed successfully.");
} finally {
  globalThis.fetch = originalFetch;
}
