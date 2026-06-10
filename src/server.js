import express from "express";
import { fileURLToPath } from "node:url";
import { assertConfig, config } from "./config.js";
import { approveRoles, configureRun, executeFinal, executeTest, startRun } from "./agent.js";
import { initDb } from "./db.js";

assertConfig();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

let dbReady = false;
let dbError = null;

const route = handler => async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ error: "Database initialization is not complete." });
  }
  try { res.json(await handler(req, res)); }
  catch (error) { res.status(400).json({ error: error.message }); }
};

app.get("/health", (_, res) => res.json({
  ok: true,
  database: dbReady ? "ready" : dbError ? "error" : "initializing"
}));
app.post("/api/runs", route(() => startRun()));
app.post("/api/runs/:id/configure", route(req => configureRun(req.params.id, req.body)));
app.post("/api/runs/:id/approve-roles", route(req => approveRoles(req.params.id)));
app.post("/api/runs/:id/test", route(req => executeTest(req.params.id)));
app.post("/api/runs/:id/import", route(req => executeFinal(req.params.id, req.body.approvalCode)));

app.listen(config.port, "0.0.0.0", async () => {
  console.log(`Freelan agent listening on ${config.port}`);
  try {
    await initDb();
    dbReady = true;
    console.log("Database initialized");
  } catch (error) {
    dbError = error.message;
    console.error("Database initialization failed:", error.message);
  }
});
