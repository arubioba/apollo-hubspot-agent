import express from "express";
import { fileURLToPath } from "node:url";
import { createCorrelationId, runWithContext } from "./context.js";
import { validateConfig } from "./config.js";
import { createOperatorSession, requireInternalAuth } from "./auth.js";
import { AppError, toPublicError } from "./errors.js";
import { logger as defaultLogger } from "./logger.js";
import { assertDiagnosticsAllowed } from "./diagnostics-policy.js";
import { createRateLimiter } from "./rate-limit.js";
import { serializeDiagnostic } from "./http-serializers.js";

export function createApp({
  config,
  logger = defaultLogger,
  isDbReady = () => true,
  getDbError = () => null,
  validate = validateConfig,
  auth = requireInternalAuth,
  rateLimit = createRateLimiter(config),
  handlers
}) {
  const app = express();
  app.use(express.json({ limit: config.maxBodyBytes }));
  app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use((req, res, next) => {
    const correlationId = createCorrelationId(req.get("x-correlation-id") || req.get("x-request-id"));
    runWithContext({ correlationId }, () => {
      res.setHeader("X-Correlation-ID", correlationId);
      req.correlationId = correlationId;
      logger.info("http.request.started", "HTTP request started.", {
        method: req.method,
        path: req.path,
        correlationId
      });
      next();
    });
  });

  const route = handler => async (req, res) => {
    const startedAt = Date.now();
    try {
      auth(req);
      rateLimit(req);
      requireJsonForBody(req);
      const validation = validate();
      if (!validation.ok) {
        logger.error("configuration.invalid", "Server configuration is incomplete or invalid.", {
          missing: validation.missing,
          errors: validation.errors
        });
        throw Object.assign(new Error("Server configuration is incomplete or invalid."), {
          code: "CONFIGURATION_ERROR",
          status: 503,
          expose: true,
          metadata: { missingConfig: validation.missing }
        });
      }
      if (!isDbReady()) {
        throw Object.assign(new Error("Database initialization is not complete."), {
          code: "DATABASE_NOT_READY",
          status: 503,
          expose: true
        });
      }
      const body = await handler(req, res);
      logger.info("http.request.completed", "HTTP request completed.", {
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
      res.json({ ...body, correlationId: req.correlationId });
    } catch (error) {
      handleHttpError(error, req, res, logger, startedAt);
    }
  };

  const publicRoute = handler => async (req, res) => {
    const startedAt = Date.now();
    try {
      rateLimit(req);
      requireJsonForBody(req);
      const validation = validate();
      if (!validation.ok) {
        logger.error("configuration.invalid", "Server configuration is incomplete or invalid.", {
          missing: validation.missing,
          errors: validation.errors
        });
        throw Object.assign(new Error("Server configuration is incomplete or invalid."), {
          code: "CONFIGURATION_ERROR",
          status: 503,
          expose: true,
          metadata: { missingConfig: validation.missing }
        });
      }
      const body = await handler(req, res);
      logger.info("http.request.completed", "HTTP request completed.", {
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      });
      res.json({ ...body, correlationId: req.correlationId });
    } catch (error) {
      handleHttpError(error, req, res, logger, startedAt);
    }
  };

  app.get("/health", (req, res) => {
    const body = {
      status: "ok",
      service: "ara",
      version: "0.1",
      environment: config.nodeEnv,
      correlation_id: req.correlationId
    };
    if (config.nodeEnv !== "production") body.write_mode = config.writeMode;
    if (getDbError()) body.database = "error";
    res.json(body);
  });

  app.get("/api/diagnostics/hubspot", route(async () => {
    assertDiagnosticsAllowed(config);
    return serializeDiagnostic("hubspot", await handlers.verifyHubSpotConnection(), { enabled: true });
  }));
  app.get("/api/diagnostics/openai", route(async () => {
    assertDiagnosticsAllowed(config);
    return serializeDiagnostic("openai", await handlers.verifyOpenAIConnection(), { enabled: true });
  }));
  app.post("/api/session", publicRoute(req => createOperatorSession(req.body)));
  app.get("/api/audit/latest-import", route(handlers.latestImportAudit));
  app.get("/api/candidates", route(req => handlers.listCandidateInbox(req.query)));
  app.get("/api/import-runs/:runId/candidates", route(req => handlers.listRunCandidates(req.params.runId, req.query)));
  app.post("/api/setup/hubspot-properties", route(handlers.ensureHubSpotProperties));
  app.post("/api/runs", route(handlers.startRun));
  app.post("/api/runs/:id/configure", route(req => handlers.configureRun(req.params.id, req.body)));
  app.post("/api/runs/:id/analyze", route(req => handlers.analyzeFilters(req.params.id, req.body)));
  app.post("/api/runs/:id/approve-roles", route(req => handlers.approveRoles(req.params.id)));
  app.post("/api/runs/:id/relax", route(req => handlers.applyRelaxation(req.params.id)));
  app.post("/api/runs/:id/test", route(req => handlers.executeTest(req.params.id, req.body?.selectedEmails)));
  app.post("/api/runs/:id/import", route(req => handlers.executeFinal(req.params.id, req.body?.approvalCode, req.body?.selectedEmails)));
  app.post("/api/runs/:id/engagement-prep", route(req => handlers.prepareEngagement(req.params.id, req.body?.selectedEmails)));

  app.use((error, req, res, _next) => {
    if (error?.type === "entity.parse.failed") {
      error = new AppError("Invalid JSON payload.", { code: "INVALID_JSON", status: 400, expose: true, cause: error });
    } else if (error?.type === "entity.too.large") {
      error = new AppError("Request body is too large.", { code: "PAYLOAD_TOO_LARGE", status: 413, expose: true, cause: error });
    }
    handleHttpError(error, req, res, logger, Date.now());
  });

  return app;
}

function requireJsonForBody(req) {
  if (!["POST", "PUT", "PATCH"].includes(req.method)) return;
  if (!req.path.startsWith("/api/")) return;
  const contentType = req.get("content-type") || "";
  if (contentType.toLowerCase().split(";")[0].trim() === "application/json") return;
  throw new AppError("Content-Type must be application/json.", {
    code: "UNSUPPORTED_CONTENT_TYPE",
    status: 415,
    expose: true
  });
}

function handleHttpError(error, req, res, logger, startedAt) {
  logger.error("http.request.failed", "HTTP request failed.", {
    path: req.path,
    method: req.method,
    durationMs: Date.now() - startedAt,
    error
  });
  const publicError = toPublicError(error, req.correlationId);
  res.status(publicError.status).json(publicError.body);
}
