import test from "node:test";
import assert from "node:assert/strict";
import { createDiscoveryJobs } from "../src/discovery-jobs.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
test("long discovery returns immediately, deduplicates starts and persists completion", async () => {
  let record = { id: "run", filters: {} }, finish, calls = 0;
  const deps = { load: async () => structuredClone(record), save: async r => { record = structuredClone(r); }, log: () => {},
    execute: async () => { calls++; await new Promise(resolve => { finish = resolve; }); return { run: { ...record, candidates: [1] }, message: "done" }; } };
  const jobs = createDiscoveryJobs(deps);
  assert.equal((await jobs.start("run")).status, "running");
  assert.equal((await jobs.start("run")).status, "running");
  assert.equal(calls, 1);
  assert.throws(() => jobs.assertIdle("run"), /curso/);
  finish(); await tick();
  const status = await jobs.status("run");
  assert.equal(status.status, "completed");
  assert.deepEqual(status.result.run.candidates, [1]);
  assert.equal((await createDiscoveryJobs(deps).status("run")).status, "completed");
});

test("worker failure is safe, retryable, and interrupted jobs are explicit", async () => {
  let record = { id: "run", filters: { discoveryJob: { status: "running" } } };
  const jobs = createDiscoveryJobs({ load: async () => structuredClone(record), save: async r => { record = structuredClone(r); }, log: () => {}, execute: async () => { throw new Error("secret provider payload"); } });
  assert.match((await jobs.status("run")).message, /reinicio/);
  await jobs.start("run"); await tick();
  assert.equal((await jobs.status("run")).status, "failed");
  assert.doesNotMatch((await jobs.status("run")).message, /secret/);
  assert.doesNotThrow(() => jobs.assertIdle("run"));
});
