import { AppError } from "./errors.js";

// Persist status/results; the worker lives in the current single Railway replica.
// A restart is reported explicitly instead of leaving the browser polling forever.
export function createDiscoveryJobs({ load, save, execute, log }) {
  const active = new Set();
  const assertIdle = id => {
    if (active.has(id)) throw new AppError("La busqueda sigue en curso. Espera antes de modificar los filtros.", { status: 409 });
  };
  async function status(id) {
    const run = await load(id);
    const job = run.filters.discoveryJob;
    if (!job) return { status: "idle" };
    if (job.status === "running" && !active.has(id)) return { status: "failed", message: "El servicio se reinicio durante la busqueda. Puedes volver a intentarlo." };
    return job.status === "completed" ? { ...job, result: { run, message: job.message, relaxationProposal: job.relaxationProposal } } : job;
  }
  async function start(id) {
    if (active.has(id)) return { status: "running" };
    active.add(id);
    try {
      const run = await load(id);
      if (run.filters.discoveryJob?.status === "completed") { active.delete(id); return status(id); }
      run.filters.discoveryJob = { status: "running", startedAt: new Date().toISOString() };
      await save(run);
    } catch (error) { active.delete(id); throw error; }
    void (async () => {
      try {
        const result = await execute(id);
        result.run.filters.discoveryJob = { status: "completed", message: result.message, relaxationProposal: result.relaxationProposal };
        await save(result.run);
      } catch (error) {
        log(error);
        try {
          const run = await load(id);
          run.filters.discoveryJob = { status: "failed", message: error.expose ? error.message : "La busqueda fallo. Revisa disponibilidad y permisos de los proveedores antes de reintentar." };
          await save(run);
        } catch (saveError) { log(saveError); }
      } finally { active.delete(id); }
    })();
    return { status: "running" };
  }
  return { start, status, assertIdle };
}
