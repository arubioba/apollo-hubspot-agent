import crypto from "node:crypto";
import { config } from "./config.js";
import { ensureHubSpotProperties, discoverApolloProspects, importCandidate, writeEngagementPrep } from "./clients.js";
import { interpretFilters } from "./interpreter.js";
import { getDailyCount, incrementDailyCount, loadRun, pool, saveRun } from "./db.js";
import { getCorrelationId } from "./context.js";
import { ValidationError } from "./errors.js";
import { logger } from "./logger.js";
import { toAraCandidate } from "./candidate-adapter.js";
import { createDiscoveryJobs } from "./discovery-jobs.js";
import { markAraCandidateEngagementPrepared, markAraCandidateHubSpotSynced, upsertAraCandidates } from "./candidate-repository.js";

const ICP_ROLES = [
  "CIO", "CTO", "Director de Tecnologia", "Chief Marketing Officer", "CMO",
  "Director de Marketing", "Sales Director", "Director Comercial",
  "Director de Ventas", "CEO", "Director General"
];

const discoveryJobs = createDiscoveryJobs({ load: requiredRun, save: saveRun, execute: approveRoles,
  log: error => logger.error("discovery.job.failed", "Discovery job failed.", { error }) });
export const startDiscovery = id => discoveryJobs.start(id);
export const discoveryStatus = id => discoveryJobs.status(id);

export async function startRun() {
  const run = {
    id: crypto.randomUUID(), correlationId: getCorrelationId(), phase: "collecting", filters: {}, roles: ICP_ROLES,
    candidates: [], testResults: {}, finalResults: {}
  };
  await saveRun(run);
  logger.info("run.started", "Import run started.", { runId: run.id });
  return {
    run,
    message: "Define dos industrias, rango de empleados, paises y cantidad objetivo. Buscare directamente entre todos los contactos disponibles en Apollo.",
    suggestedRoles: ICP_ROLES
  };
}

export async function configureRun(id, filters) {
  discoveryJobs.assertIdle(id);
  const run = await requiredRun(id);
  delete run.filters.discoveryJob;
  validateFilters(filters);
  run.filters = filters;
  run.roles = filters.roles;
  run.phase = "roles_pending";
  await saveRun(run);
  return { run, message: "Valida los roles ICP sugeridos antes de buscar candidatos." };
}

export async function analyzeFilters(id, filters) {
  discoveryJobs.assertIdle(id);
  validateFilters(filters);
  const run = await requiredRun(id);
  delete run.filters.discoveryJob;
  const interpretation = await interpretFilters({
    industry: filters.industry,
    selectedRoles: filters.roles,
    countries: filters.countries,
    employeeRange: [filters.employeeMin, filters.employeeMax],
    adHocBrief: filters.adHocBrief
  });
  interpretation.relaxation = buildSafeRelaxation(interpretation);
  run.filters = { ...filters, interpretation };
  run.correlationId ||= getCorrelationId();
  run.roles = filters.roles;
  run.phase = "interpretation_pending";
  await saveRun(run);
  return { run, interpretation, message: "Revisa y aprueba como interpretare tus filtros en Apollo." };
}

function buildSafeRelaxation(interpretation) {
  const removeContactLocations = interpretation.contactLocations.length > 0;
  return {
    removeCompanyKeywords: false,
    removeContactLocations,
    broadenEmployeeRangeByPercent: removeContactLocations ? 0 : 20,
    explanation: removeContactLocations
      ? "Retirar primero ubicaciones opcionales del contacto, manteniendo industria, paises de empresa, roles, email verificado, telefono valido, dominio, rango de empleados y todas las senales del brief."
      : "Ampliar 20% el rango de empleados, manteniendo industria, paises, roles, email verificado, telefono valido y dominio."
  };
}

export async function approveRoles(id) {
  const run = await requiredRun(id);
  const discovery = await discoverApolloProspects(run.filters);
  run.candidates = discovery.candidates;
  run.filters.discoveryStats = discovery.stats;
  const araCandidates = run.candidates.map(candidate => toAraCandidate(candidate, {
    tenantId: config.defaultTenantId,
    campaignId: run.id,
    runId: run.id,
    correlationId: run.correlationId || getCorrelationId(),
    filters: run.filters
  }));
  const savedAraCandidates = await upsertAraCandidates(araCandidates);
  run.phase = "test_ready";
  await saveRun(run);
  return {
    run,
    araCandidates: savedAraCandidates,
    message: run.candidates.length
      ? `Encontre ${run.candidates.length} prospectos tras excluir registros de Apollo y HubSpot. La busqueda no revela email ni telefono ni ejecuta enriquecimiento de pago.${discovery.stats.truncated ? " Se alcanzo el limite de consultas; los resultados son parciales." : ""}`
      : `No encontre prospectos nuevos con estos filtros.${discovery.stats.truncated ? " Se alcanzo el limite de consultas; la busqueda es parcial." : ""}`,
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

export async function executeTest(id, selectedEmails = []) {
  const run = await requiredRun(id);
  logger.info("legacy.execute_test.used", "Legacy compatibility preview path used.", {
    runId: run.id,
    retirementCriteria: "Retire after ARA Candidate approval, preview, and controlled HubSpot sync reach parity."
  });
  const batch = selectedCandidates(run, selectedEmails).slice(0, config.testBatchSize);
  if (!batch.length) throw new ValidationError("Selecciona al menos un candidato antes de ejecutar el preview.");
  if (config.writeMode === "enabled") await ensureHubSpotProperties();
  run.testResults = await executeBatch(batch, false, filtersWithRunContext(run));
  run.phase = "test_review";
  await saveRun(run);
  return { run, message: config.writeMode === "preview" ? "Preview terminado. No se escribio en HubSpot." : "Prueba terminada. Verifica los contactos en HubSpot antes de continuar." };
}

export async function executeFinal(id, approvalCode, selectedEmails = []) {
  const run = await requiredRun(id);
  const alreadySynced = new Set([
    ...(run.testResults?.successful || []),
    ...(run.finalResults?.successful || [])
  ].map(item => item.email?.toLowerCase()).filter(Boolean));
  const batch = selectedCandidates(run, selectedEmails)
    .filter(candidate => !alreadySynced.has(candidate.email.toLowerCase()));
  if (!batch.length) throw new ValidationError("Selecciona candidatos pendientes antes de preparar la importacion.");
  const requested = batch.length;
  const dailyCount = await getDailyCount();
  const remaining = Math.max(0, config.dailyLimit - dailyCount);
  const requiresCode = requested > remaining;
  if (requiresCode && approvalCode !== config.approvalCode) {
    return {
      run, requiresApprovalCode: true,
      message: `La operacion supera el limite diario disponible de ${remaining}. Ingresa el codigo de aprobacion.`
    };
  }
  if (config.writeMode === "enabled") await ensureHubSpotProperties();
  run.finalResults = await executeBatch(batch, true, filtersWithRunContext(run));
  run.phase = "complete";
  await saveRun(run);
  const missing = requested - run.finalResults.successful.length;
  if (config.writeMode === "preview") {
    return {
      run, missing,
      message: `Preview terminado. Se prepararon ${run.finalResults.successful.length} contactos y no se escribio en HubSpot.`
    };
  }
  return {
    run, missing,
    message: missing > 0
      ? `Se integraron ${run.finalResults.successful.length}. Fallaron o faltaron ${missing}. Puedes solicitar completar los faltantes.`
      : `Se integraron correctamente los ${requested} contactos solicitados.`
  };
}

export async function prepareEngagement(id, selectedEmails = []) {
  const run = await requiredRun(id);
  const selected = selectedCandidates(run, selectedEmails);
  if (!selected.length) throw new ValidationError("Selecciona al menos un candidato para preparar Engagement Prep.");
  const synced = new Set([
    ...(run.testResults?.successful || []),
    ...(run.finalResults?.successful || [])
  ].filter(item => !item.preview).map(item => item.email?.toLowerCase()).filter(Boolean));
  const batch = selected.filter(candidate => synced.has(candidate.email.toLowerCase()));
  if (!batch.length) throw new ValidationError("Engagement Prep requiere contactos ya sincronizados con HubSpot.");
  if (config.writeMode === "enabled") await ensureHubSpotProperties();
  const results = { successful: [], failed: [] };
  for (const candidate of batch) {
    try {
      const result = await writeEngagementPrep(candidate, filtersWithRunContext(run));
      results.successful.push(result);
      if (!result.preview) {
        await markAraCandidateEngagementPrepared({
          tenantId: config.defaultTenantId,
          runId: run.id,
          email: candidate.email
        });
      }
    } catch (error) {
      logger.error("engagement_prep.failed", "Engagement Prep failed.", { email: candidate.email, error });
      results.failed.push({ email: candidate.email, error: error.message });
    }
  }
  run.engagementResults = results;
  run.phase = "engagement_ready";
  await saveRun(run);
  return {
    run,
    results,
    message: config.writeMode === "preview"
      ? `Preview de Engagement Prep terminado para ${results.successful.length} contacto(s). No se escribio en HubSpot.`
      : `Engagement Prep listo en HubSpot para ${results.successful.length} contacto(s).`
  };
}

async function executeBatch(batch, countAgainstLimit, filters) {
  const successful = [];
  const failed = [];
  for (const candidate of batch) {
    try {
      logger.info("hubspot.sync.started", "HubSpot candidate sync started.", { email: candidate.email });
      const result = await importCandidate(candidate, filters);
      successful.push(result);
      if (!result.preview && result.contactId && filters.runId) {
        await markAraCandidateHubSpotSynced({
          tenantId: config.defaultTenantId,
          runId: filters.runId,
          email: candidate.email,
          hubspotContactId: result.contactId,
          hubspotCompanyId: result.companyId
        });
      }
      logger.info("hubspot.sync.completed", "HubSpot candidate sync completed.", { email: candidate.email });
    } catch (error) {
      logger.error("hubspot.sync.failed", "HubSpot candidate sync failed.", { email: candidate.email, error });
      failed.push({ email: candidate.email, error: error.message });
    }
  }
  if (countAgainstLimit && successful.length && config.writeMode === "enabled") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await incrementDailyCount(successful.length, client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      logger.error("database.write.failed", "Daily import counter update failed.", { error });
      throw error;
    } finally {
      client.release();
    }
  }
  return { successful, failed };
}

function filtersWithRunContext(run) {
  return {
    ...run.filters,
    runId: run.id,
    campaignId: run.id
  };
}

function uniqueByEmail(items) {
  return [...new Map(items.filter(x => x.email).map(x => [x.email.toLowerCase(), x])).values()];
}

function selectedCandidates(run, selectedEmails = []) {
  const selected = new Set((selectedEmails || []).map(email => String(email).toLowerCase()).filter(Boolean));
  if (!selected.size) return [];
  return run.candidates.filter(candidate => !candidate.discoveryOnly && candidate.email && selected.has(candidate.email.toLowerCase()));
}

function validateFilters(filters) {
  if (!filters.industry?.trim()) throw new ValidationError("Escribe una industria.");
  if (!filters.employeeMin || !filters.employeeMax || filters.employeeMin > filters.employeeMax) throw new ValidationError("Define un rango valido de empleados.");
  if (!Array.isArray(filters.countries) || !filters.countries.length) throw new ValidationError("Selecciona al menos un pais.");
  if (!Array.isArray(filters.roles) || !filters.roles.length || filters.roles.length > 3) throw new ValidationError("Selecciona entre uno y tres roles.");
  if (!Number.isInteger(filters.quantity) || filters.quantity < 1 || filters.quantity > 100) throw new ValidationError("La cantidad debe estar entre 1 y 100 prospectos por busqueda.");
}

async function requiredRun(id) {
  const run = await loadRun(id);
  if (!run) throw new ValidationError("Proceso no encontrado.");
  run.correlationId ||= getCorrelationId();
  return run;
}
