import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { initDb } from "../src/db.js";
import { toAraCandidate } from "../src/candidate-adapter.js";
import { upsertAraCandidate, listAraCandidates } from "../src/candidate-repository.js";

test("PostgreSQL migration preserves legacy emails and persists independent, retry-safe email-free prospects with Google context", async () => {
  const db = new PGlite();
  const client = { query: (sql, params) => params ? db.query(sql, params) : db.exec(sql) };
  try {
    await initDb(client);
    // Simulate the previous email constraint before applying the additive migration again.
    await db.exec("ALTER TABLE ara_candidates ALTER COLUMN professional_email SET NOT NULL");
    await initDb(client);
    const runId = "11111111-1111-4111-8111-111111111111";
    await db.query("INSERT INTO import_runs(id, phase) VALUES ($1, 'collecting')", [runId]);
    const make = (id, email = null) => toAraCandidate({ apolloId: id, firstName: "Jean", email, discoveryOnly: !email, company: { name: "Pharma" }, googleContext: { status: "available", text: "Company expansion", sources: [{ url: "https://example.com", title: "Source" }] } }, { tenantId: "freelan", campaignId: runId, runId, correlationId: "test" });
    await upsertAraCandidate(make("one"), client);
    await upsertAraCandidate(make("two"), client);
    await upsertAraCandidate(make("one"), client);
    await upsertAraCandidate(make("legacy", "jean@example.com"), client);
    await upsertAraCandidate(make("legacy", "jean@example.com"), client);
    const result = await listAraCandidates({ tenantId: "freelan", runId }, client);
    assert.equal(result.pagination.total, 3);
    const previews = result.candidates.filter(c => c.email == null);
    assert.equal(previews.length, 2);
    assert.ok(previews.every(c => c.enrichment_status === "required"));
    assert.equal(previews[0].google_context.text, "Company expansion");
    assert.equal(previews[0].google_context.sources[0].url, "https://example.com");
  } finally { await db.close(); }
});
