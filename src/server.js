import express from "express";
import { fileURLToPath } from "node:url";
import { config, getMissingConfig } from "./config.js";
import { analyzeFilters, applyRelaxation, approveRoles, configureRun, executeFinal, executeTest, startRun } from "./agent.js";
import { ensureHubSpotProperties, verifyHubSpotConnection } from "./clients.js";
import { verifyOpenAIConnection } from "./interpreter.js";
import { initDb } from "./db.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

let dbReady = false;
let dbError = null;

const route = handler => async (req, res) => {
  const missingConfig = getMissingConfig();
  if (missingConfig.length) {
    return res.status(503).json({ error: "Server configuration is incomplete.", missingConfig });
  }
  if (!dbReady) {
    return res.status(503).json({ error: "Database initialization is not complete." });
  }
  try { res.json(await handler(req, res)); }
  catch (error) { res.status(400).json({ error: error.message }); }
};

app.get("/health", (_, res) => res.json({
  ok: true,
  database: dbReady ? "ready" : dbError ? "error" : "initializing",
  configuration: getMissingConfig().length ? "incomplete" : "ready",
  missingConfig: getMissingConfig()
}));
app.get("/api/diagnostics/hubspot", route(() => verifyHubSpotConnection()));
app.get("/api/diagnostics/openai", route(() => verifyOpenAIConnection()));
app.post("/api/setup/hubspot-properties", route(() => ensureHubSpotProperties()));
app.post("/api/runs", route(() => startRun()));
app.post("/api/runs/:id/configure", route(req => configureRun(req.params.id, req.body)));
app.post("/api/runs/:id/analyze", route(req => analyzeFilters(req.params.id, req.body)));
app.post("/api/runs/:id/approve-roles", route(req => approveRoles(req.params.id)));
app.post("/api/runs/:id/relax", route(req => applyRelaxation(req.params.id)));
app.post("/api/runs/:id/test", route(req => executeTest(req.params.id)));
app.post("/api/runs/:id/import", route(req => executeFinal(req.params.id, req.body.approvalCode)));

app.listen(config.port, "0.0.0.0", async () => {
  console.log(`Freelan agent listening on ${config.port}`);
  if (!config.databaseUrl) {
    dbError = "DATABASE_URL is missing";
    console.error("Database initialization skipped: DATABASE_URL is missing");
    return;
  }
  try {
    await initDb();
    dbReady = true;
    console.log("Database initialized");
  } catch (error) {
    dbError = error.message;
    console.error("Database initialization failed:", error.message);
  }
});
