import crypto from "node:crypto";
import { config } from "./config.js";
import { ensureHubSpotProperties, findApolloCandidates, importCandidate } from "./clients.js";
import { interpretFilters } from "./interpreter.js";
import { getDailyCount, incrementDailyCount, loadRun, pool, saveRun } from "./db.js";

const ICP_ROLES = [
  "CIO", "CTO", "Director de Tecnología", "Chief Marketing Officer", "CMO",
  "Director de Marketing", "Sales Director", "Director Comercial",
  "Director de Ventas", "CEO", "Director General"
];
export async function startRun() {
  const run = {
    id: crypto.randomUUID(), phase: "collecting", filters: {}, roles: ICP_ROLES,
    candidates: [], testResults: {}, finalResults: {}
  };
  await saveRun(run);
  return {
    run,
    message: "Define dos industrias, rango de empleados, países y cantidad objetivo. Buscaré directamente entre todos los contactos disponibles en Apollo.",
    suggestedRoles: ICP_ROLES
  };
}

export async function configureRun(id, filters) {
  const run = await requiredRun(id);
  validateFilters(filters);
  run.filters = filters;
  run.roles = filters.roles;
  run.phase = "roles_pending";
  await saveRun(run);
  return { run, message: "Valida los roles ICP sugeridos antes de buscar candidatos." };
}

export async function analyzeFilters(id, filters) {
  validateFilters(filters);
  const run = await requiredRun(id);
  const interpretation = await interpretFilters({
    industry: filters.industry,
    selectedRoles: filters.roles,
    countries: filters.countries,
    employeeRange: [filters.employeeMin, filters.employeeMax],
    adHocBrief: filters.adHocBrief
  });
  interpretation.relaxation = buildSafeRelaxation(interpretation);
  run.filters = { ...filters, interpretation };
  run.roles = filters.roles;
  run.phase = "interpretation_pending";
  await saveRun(run);
  return { run, interpretation, message: "Revisa y aprueba cómo interpretaré tus filtros en Apollo." };
}

function buildSafeRelaxation(interpretation) {
  const removeContactLocations = interpretation.contactLocations.length > 0;
  return {
    removeCompanyKeywords: false,
    removeContactLocations,
    broadenEmployeeRangeByPercent: removeContactLocations ? 0 : 20,
    explanation: removeContactLocations
      ? "Retirar primero ubicaciones opcionales del contacto, manteniendo industria, países de empresa, roles, email verificado, teléfono válido, dominio, rango de empleados y todas las señales del brief."
      : "Ampliar 20% el rango de empleados, manteniendo industria, países, roles, email verificado, teléfono válido y dominio."
  };
}

export async function approveRoles(id) {
  const run = await requiredRun(id);
  const candidates = [];
  for (let page = 1; page <= 5 && candidates.length < run.filters.quantity + config.testBatchSize; page++) {
    candidates.push(...await findApolloCandidates(run.filters, page));
  }
  run.candidates = uniqueByEmail(candidates).slice(0, run.filters.quantity + config.testBatchSize);
  run.phase = "test_ready";
  await saveRun(run);
  return {
    run,
    message: run.candidates.length
      ? `Encontré ${run.candidates.length} candidatos elegibles. La prueba usará los primeros ${Math.min(config.testBatchSize, run.candidates.length)}.`
      : "No encontré candidatos. Revisa la propuesta para relajar filtros antes de volver a buscar.",
    relaxationProposal: run.candidates.length ? null : run.filters.interpretation.relaxation
  };
}

export async function applyRelaxation(id) {
  const run = await requiredRun(id);
  const proposal = run.filters.interpretation.relaxation;
  if (proposal.removeCompanyKeywords) run.filters.interpretation.companyKeywords = [];
  if (proposal.removeContactLocations) run.filters.interpretation.contactLocations = [];
  if (proposal.broadenEmployeeRangeByPercent) {
    const factor = proposal.broadenEmployeeRangeByPercent / 100;
    run.filters.employeeMin = Math.max(1, Math.floor(run.filters.employeeMin * (1 - factor)));
    run.filters.employeeMax = Math.ceil(run.filters.employeeMax * (1 + factor));
  }
  await saveRun(run);
  return approveRoles(id);
}

export async function executeTest(id) {
  const run = await requiredRun(id);
  const batch = run.candidates.slice(0, config.testBatchSize);
  await ensureHubSpotProperties();
  run.testResults = await executeBatch(batch, false, run.filters);
  run.phase = "test_review";
  await saveRun(run);
  return { run, message: "Prueba terminada. Verifica los contactos en HubSpot antes de continuar." };
}

export async function executeFinal(id, approvalCode) {
  const run = await requiredRun(id);
  const requested = run.filters.quantity;
  const dailyCount = await getDailyCount();
  const remaining = Math.max(0, config.dailyLimit - dailyCount);
  const requiresCode = requested > remaining;
  if (requiresCode && approvalCode !== config.approvalCode) {
    return {
      run, requiresApprovalCode: true,
      message: `La operación supera el límite diario disponible de ${remaining}. Ingresa el código de aprobación.`
    };
  }
  const batch = run.candidates.slice(config.testBatchSize, config.testBatchSize + requested);
  await ensureHubSpotProperties();
  run.finalResults = await executeBatch(batch, true, run.filters);
  run.phase = "complete";
  await saveRun(run);
  const missing = requested - run.finalResults.successful.length;
  return {
    run, missing,
    message: missing > 0
      ? `Se integraron ${run.finalResults.successful.length}. Fallaron o faltaron ${missing}. Puedes solicitar completar los faltantes.`
      : `Se integraron correctamente los ${requested} contactos solicitados.`
  };
}

async function executeBatch(batch, countAgainstLimit, filters) {
  const successful = [];
  const failed = [];
  for (const candidate of batch) {
    try {
      successful.push(await importCandidate(candidate, filters));
    } catch (error) {
      failed.push({ email: candidate.email, error: error.message });
    }
  }
  if (countAgainstLimit && successful.length) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await incrementDailyCount(successful.length, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { successful, failed };
}

function uniqueByEmail(items) {
  return [...new Map(items.filter(x => x.email).map(x => [x.email.toLowerCase(), x])).values()];
}

function validateFilters(filters) {
  if (!filters.industry?.trim()) throw new Error("Escribe una industria.");
  if (!filters.employeeMin || !filters.employeeMax || filters.employeeMin > filters.employeeMax) throw new Error("Define un rango válido de empleados.");
  if (!Array.isArray(filters.countries) || !filters.countries.length) throw new Error("Selecciona al menos un país.");
  if (!Array.isArray(filters.roles) || !filters.roles.length || filters.roles.length > 3) throw new Error("Selecciona entre uno y tres roles.");
  if (!Number.isInteger(filters.quantity) || filters.quantity < 1) throw new Error("La cantidad debe ser mayor que cero.");
}

async function requiredRun(id) {
  const run = await loadRun(id);
  if (!run) throw new Error("Proceso no encontrado.");
  return run;
}
