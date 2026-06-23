import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;
export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl?.includes("railway") ? { rejectUnauthorized: false } : undefined
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_runs (
      id uuid PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      phase text NOT NULL,
      filters jsonb NOT NULL DEFAULT '{}'::jsonb,
      roles jsonb NOT NULL DEFAULT '[]'::jsonb,
      candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
      test_results jsonb NOT NULL DEFAULT '{}'::jsonb,
      final_results jsonb NOT NULL DEFAULT '{}'::jsonb,
      correlation_id text
    );
    CREATE TABLE IF NOT EXISTS daily_imports (
      day_key text PRIMARY KEY,
      imported_count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE import_runs ADD COLUMN IF NOT EXISTS correlation_id text;
  `);
}

export function dayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

export async function getDailyCount(client = pool) {
  const result = await client.query(
    "SELECT imported_count FROM daily_imports WHERE day_key = $1",
    [dayKey()]
  );
  return result.rows[0]?.imported_count || 0;
}

export async function incrementDailyCount(amount, client = pool) {
  await client.query(`
    INSERT INTO daily_imports(day_key, imported_count) VALUES ($1, $2)
    ON CONFLICT(day_key) DO UPDATE SET
      imported_count = daily_imports.imported_count + EXCLUDED.imported_count,
      updated_at = now()
  `, [dayKey(), amount]);
}

export async function saveRun(run) {
  await pool.query(`
    INSERT INTO import_runs(id, phase, filters, roles, candidates, test_results, final_results, correlation_id)
    VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8)
    ON CONFLICT(id) DO UPDATE SET phase=$2, filters=$3::jsonb, roles=$4::jsonb, candidates=$5::jsonb,
      test_results=$6::jsonb, final_results=$7::jsonb,
      correlation_id=COALESCE(import_runs.correlation_id, $8), updated_at=now()
  `, [
    run.id,
    run.phase,
    JSON.stringify(run.filters),
    JSON.stringify(run.roles),
    JSON.stringify(run.candidates),
    JSON.stringify(run.testResults),
    JSON.stringify(run.finalResults),
    run.correlationId || null
  ]);
}

export async function loadRun(id) {
  const result = await pool.query("SELECT * FROM import_runs WHERE id=$1", [id]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id, phase: row.phase, filters: row.filters, roles: row.roles,
    candidates: row.candidates, testResults: row.test_results, finalResults: row.final_results,
    correlationId: row.correlation_id
  };
}

export async function getLatestSuccessfulRun() {
  const result = await pool.query(`
    SELECT id, created_at, updated_at, phase, filters, test_results, final_results
    FROM import_runs
    WHERE jsonb_array_length(COALESCE(test_results->'successful', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(final_results->'successful', '[]'::jsonb)) > 0
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  return result.rows[0] || null;
}

export async function closeDb() {
  await pool.end();
}
