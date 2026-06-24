import { config, validateConfig } from "./config.js";
import { createApp } from "./app.js";
import { analyzeFilters, applyRelaxation, approveRoles, configureRun, executeFinal, executeTest, prepareEngagement, startRun } from "./agent.js";
import { ensureHubSpotProperties, verifyHubSpotConnection } from "./clients.js";
import { verifyOpenAIConnection } from "./interpreter.js";
import { closeDb, getLatestSuccessfulRun, initDb } from "./db.js";
import { logger } from "./logger.js";
import { serializeAuditRun, serializeRunCandidates } from "./http-serializers.js";
import { loadRun } from "./db.js";
import { listAraCandidates } from "./candidate-repository.js";

let dbReady = false;
let dbError = null;
let server = null;

const handlers = {
  verifyHubSpotConnection,
  verifyOpenAIConnection,
  ensureHubSpotProperties,
  startRun,
  configureRun,
  analyzeFilters,
  approveRoles,
  applyRelaxation,
  executeTest,
  executeFinal,
  prepareEngagement,
  latestImportAudit,
  listRunCandidates,
  listCandidateInbox
};

async function latestImportAudit() {
  const run = await getLatestSuccessfulRun();
  return serializeAuditRun(run);
}

async function listRunCandidates(runId, query) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size || 25)));
  const inbox = await listAraCandidates({
    tenantId: config.defaultTenantId,
    runId,
    page,
    pageSize
  });
  if (inbox.candidates.length) {
    return {
      run: { id: runId, status: "candidate_inbox" },
      pagination: inbox.pagination,
      candidates: inbox.candidates
    };
  }
  const run = await loadRun(runId);
  if (!run) return { found: false, candidates: [], pagination: { page: 1, page_size: 25, total: 0 } };
  return serializeRunCandidates(run, {
    page,
    pageSize
  });
}

async function listCandidateInbox(query) {
  if (!query.run_id) return { candidates: [], pagination: { page: 1, page_size: 25, total: 0 } };
  return listAraCandidates({
    tenantId: config.defaultTenantId,
    runId: query.run_id,
    page: Math.max(1, Number(query.page || 1)),
    pageSize: Math.min(100, Math.max(1, Number(query.page_size || 25)))
  });
}

async function start() {
  const validation = validateConfig();
  if (!validation.ok) {
    logger.error("server.startup_failed", "Invalid server configuration.", {
      missing: validation.missing,
      errors: validation.errors
    });
    process.exitCode = 1;
    return;
  }

  try {
    await initDb();
    dbReady = true;
  } catch (error) {
    dbError = error.message;
    logger.error("server.startup_failed", "Database initialization failed.", { error });
    process.exitCode = 1;
    return;
  }

  const app = createApp({
    config,
    logger,
    isDbReady: () => dbReady,
    getDbError: () => dbError,
    handlers
  });

  server = app.listen(config.port, "0.0.0.0", () => {
    logger.info("server.started", "Freelan agent listening.", { port: config.port });
  });
}

async function stop(signal) {
  logger.info("server.stopping", "Server stopping.", { signal });
  await new Promise(resolve => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  await closeDb();
  logger.info("server.stopped", "Server stopped.", { signal });
}

process.on("SIGTERM", () => stop("SIGTERM").then(() => process.exit(0)));
process.on("SIGINT", () => stop("SIGINT").then(() => process.exit(0)));

start().catch(error => {
  logger.error("server.startup_failed", "Unexpected startup failure.", { error });
  process.exit(1);
});
