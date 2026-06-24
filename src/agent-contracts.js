import { ValidationError } from "./errors.js";

const EXECUTION_STATUSES = new Set([
  "queued", "running", "completed", "partially_completed", "blocked",
  "failed", "retry_pending", "human_review_required", "cancelled"
]);

const RESULT_DECISIONS = new Set([
  "recommended", "not_recommended", "needs_review", "approved", "rejected", "no_decision"
]);

export function createAgentExecutionContract({
  tenantId,
  campaignId,
  runId,
  candidateId = null,
  correlationId,
  agent,
  agentVersion,
  requestedAction,
  trigger,
  input = {},
  constraints,
  retry = { attempt: 1, max_attempts: 3, previous_execution_id: null },
  createdAt = new Date().toISOString()
}) {
  const contract = {
    contract_version: "1.0",
    tenant_id: tenantId,
    campaign_id: campaignId,
    run_id: runId,
    candidate_id: candidateId,
    correlation_id: correlationId,
    agent,
    agent_version: agentVersion,
    requested_action: requestedAction,
    trigger,
    input,
    constraints,
    retry,
    created_at: createdAt
  };
  validateAgentExecutionContract(contract);
  return contract;
}

export function createAgentResultContract({
  tenantId,
  campaignId,
  runId,
  candidateId = null,
  correlationId,
  agent,
  agentVersion,
  status,
  decision = "no_decision",
  confidence = 0,
  output = {},
  evidence = [],
  warnings = [],
  errors = [],
  metrics = { duration_ms: 0, external_calls: 0, estimated_cost: 0 },
  nextAction,
  completedAt = new Date().toISOString()
}) {
  const result = {
    contract_version: "1.0",
    tenant_id: tenantId,
    campaign_id: campaignId,
    run_id: runId,
    candidate_id: candidateId,
    correlation_id: correlationId,
    agent,
    agent_version: agentVersion,
    status,
    decision,
    confidence,
    output,
    evidence,
    warnings,
    errors,
    metrics,
    next_action: nextAction,
    completed_at: completedAt
  };
  validateAgentResultContract(result);
  return result;
}

export function validateAgentExecutionContract(contract) {
  requireFields(contract, [
    "contract_version", "tenant_id", "campaign_id", "run_id", "correlation_id",
    "agent", "agent_version", "requested_action", "trigger", "input", "constraints", "created_at"
  ], "agent execution contract");
  if (contract.contract_version !== "1.0") throw new ValidationError("Unsupported agent execution contract version.");
  if (!contract.trigger?.type) throw new ValidationError("Agent execution trigger.type is required.");
  if (!contract.constraints?.external_services_mode) throw new ValidationError("Agent execution constraints.external_services_mode is required.");
  if (!contract.constraints?.write_mode) throw new ValidationError("Agent execution constraints.write_mode is required.");
  return true;
}

export function validateAgentResultContract(result) {
  requireFields(result, [
    "contract_version", "tenant_id", "campaign_id", "run_id", "correlation_id",
    "agent", "agent_version", "status", "decision", "confidence", "output",
    "evidence", "warnings", "errors", "metrics", "next_action", "completed_at"
  ], "agent result contract");
  if (result.contract_version !== "1.0") throw new ValidationError("Unsupported agent result contract version.");
  if (!EXECUTION_STATUSES.has(result.status)) throw new ValidationError("Invalid agent result status.");
  if (!RESULT_DECISIONS.has(result.decision)) throw new ValidationError("Invalid agent result decision.");
  if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) {
    throw new ValidationError("Agent result confidence must be between 0 and 1.");
  }
  if (!Array.isArray(result.evidence)) throw new ValidationError("Agent result evidence must be an array.");
  return true;
}

function requireFields(value, fields, label) {
  for (const field of fields) {
    if (value?.[field] === undefined || value?.[field] === null || value?.[field] === "") {
      throw new ValidationError(`Missing ${field} in ${label}.`);
    }
  }
}

