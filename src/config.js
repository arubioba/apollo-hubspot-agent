const WRITE_MODES = new Set(["disabled", "preview", "enabled"]);
const BOOLEAN_VALUES = new Set(["true", "false"]);
const EXTERNAL_SERVICES_MODES = new Set(["mock", "sandbox", "live"]);

export const envSpec = [
  { name: "NODE_ENV", required: false, secret: false, environmentSpecific: true },
  { name: "PORT", required: false, secret: false, environmentSpecific: true },
  { name: "DATABASE_URL", required: true, secret: true, environmentSpecific: true },
  { name: "APOLLO_API_KEY", required: true, secret: true, environmentSpecific: true },
  { name: "HUBSPOT_PRIVATE_APP_TOKEN", required: false, secret: true, environmentSpecific: true },
  { name: "HUBSPOT_ACCESS_TOKEN", required: false, secret: true, environmentSpecific: true },
  { name: "OPENAI_API_KEY", required: true, secret: true, environmentSpecific: true },
  { name: "OPENAI_MODEL", required: false, secret: false, environmentSpecific: false },
  { name: "APPROVAL_CODE", required: true, secret: true, environmentSpecific: true },
  { name: "ARA_ADMIN_TOKEN", required: true, secret: true, environmentSpecific: true },
  { name: "ARA_OPERATOR_EMAIL", required: true, secret: false, environmentSpecific: true },
  { name: "ARA_OPERATOR_PASSWORD", required: true, secret: true, environmentSpecific: true },
  { name: "ARA_DEFAULT_TENANT_ID", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_WRITE_MODE", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_EXTERNAL_SERVICES_MODE", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_DIAGNOSTICS_ENABLED", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_RATE_LIMIT_ENABLED", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_RATE_LIMIT_WINDOW_MS", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_RATE_LIMIT_MAX_REQUESTS", required: false, secret: false, environmentSpecific: true },
  { name: "ARA_MAX_BODY_BYTES", required: false, secret: false, environmentSpecific: true },
  { name: "LOG_LEVEL", required: false, secret: false, environmentSpecific: true },
  { name: "TZ", required: false, secret: false, environmentSpecific: true },
  { name: "DAILY_IMPORT_LIMIT", required: false, secret: false, environmentSpecific: true },
  { name: "TEST_BATCH_SIZE", required: false, secret: false, environmentSpecific: true },
  { name: "APOLLO_API_BASE", required: false, secret: false, environmentSpecific: true },
  { name: "HUBSPOT_API_BASE", required: false, secret: false, environmentSpecific: true }
];

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  apolloKey: normalizeSecret(process.env.APOLLO_API_KEY),
  hubspotToken: normalizeSecret(process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN),
  openaiKey: normalizeSecret(process.env.OPENAI_API_KEY),
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  approvalCode: normalizeSecret(process.env.APPROVAL_CODE),
  adminToken: normalizeSecret(process.env.ARA_ADMIN_TOKEN),
  operatorEmail: normalizeSecret(process.env.ARA_OPERATOR_EMAIL)?.toLowerCase(),
  operatorPassword: normalizeSecret(process.env.ARA_OPERATOR_PASSWORD),
  defaultTenantId: process.env.ARA_DEFAULT_TENANT_ID || "freelan",
  writeMode: process.env.ARA_WRITE_MODE || "disabled",
  externalServicesMode: process.env.ARA_EXTERNAL_SERVICES_MODE || "mock",
  diagnosticsEnabled: parseBoolean(process.env.ARA_DIAGNOSTICS_ENABLED, false),
  rateLimitEnabled: parseBoolean(process.env.ARA_RATE_LIMIT_ENABLED, true),
  rateLimitWindowMs: Number(process.env.ARA_RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMaxRequests: Number(process.env.ARA_RATE_LIMIT_MAX_REQUESTS || 60),
  maxBodyBytes: Number(process.env.ARA_MAX_BODY_BYTES || 262144),
  logLevel: process.env.LOG_LEVEL || "info",
  timezone: process.env.TZ || "America/Mexico_City",
  dailyLimit: Number(process.env.DAILY_IMPORT_LIMIT || 50),
  testBatchSize: Number(process.env.TEST_BATCH_SIZE || 5),
  apolloBase: process.env.APOLLO_API_BASE || "https://api.apollo.io/api/v1",
  hubspotBase: process.env.HUBSPOT_API_BASE || "https://api.hubapi.com"
};

function normalizeSecret(value) {
  return value?.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
}

function parseBoolean(value, fallback) {
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export function assertConfig() {
  const validation = validateConfig();
  if (!validation.ok) throw new Error(`Invalid configuration: ${validation.errors.join(", ")}`);
}

export function getMissingConfig() {
  return validateConfig().missing;
}

export function validateConfig() {
  const missing = [
    ["DATABASE_URL", config.databaseUrl],
    ["APOLLO_API_KEY", config.apolloKey],
    ["HUBSPOT_PRIVATE_APP_TOKEN or HUBSPOT_ACCESS_TOKEN", config.hubspotToken],
    ["OPENAI_API_KEY", config.openaiKey],
    ["APPROVAL_CODE", config.approvalCode],
    ["ARA_ADMIN_TOKEN", config.adminToken],
    ["ARA_OPERATOR_EMAIL", config.operatorEmail],
    ["ARA_OPERATOR_PASSWORD", config.operatorPassword]
  ].filter(([, value]) => !value).map(([name]) => name);

  const errors = [];
  if (!WRITE_MODES.has(config.writeMode)) errors.push("ARA_WRITE_MODE must be disabled, preview, or enabled");
  if (!EXTERNAL_SERVICES_MODES.has(config.externalServicesMode)) errors.push("ARA_EXTERNAL_SERVICES_MODE must be mock, sandbox, or live");
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/i.test(config.defaultTenantId)) errors.push("ARA_DEFAULT_TENANT_ID must be a safe tenant identifier");
  for (const [name, value] of [
    ["ARA_DIAGNOSTICS_ENABLED", process.env.ARA_DIAGNOSTICS_ENABLED],
    ["ARA_RATE_LIMIT_ENABLED", process.env.ARA_RATE_LIMIT_ENABLED]
  ]) {
    if (value != null && value !== "" && !BOOLEAN_VALUES.has(String(value).toLowerCase())) {
      errors.push(`${name} must be true or false`);
    }
  }
  if (config.nodeEnv === "test" && config.writeMode === "enabled") {
    errors.push("ARA_WRITE_MODE=enabled is not allowed during tests");
  }
  if (!Number.isFinite(config.port) || config.port < 1) errors.push("PORT must be a positive number");
  if (!Number.isInteger(config.dailyLimit) || config.dailyLimit < 1) errors.push("DAILY_IMPORT_LIMIT must be a positive integer");
  if (!Number.isInteger(config.testBatchSize) || config.testBatchSize < 1) errors.push("TEST_BATCH_SIZE must be a positive integer");
  if (!Number.isInteger(config.rateLimitWindowMs) || config.rateLimitWindowMs < 1000) errors.push("ARA_RATE_LIMIT_WINDOW_MS must be at least 1000");
  if (!Number.isInteger(config.rateLimitMaxRequests) || config.rateLimitMaxRequests < 1) errors.push("ARA_RATE_LIMIT_MAX_REQUESTS must be a positive integer");
  if (!Number.isInteger(config.maxBodyBytes) || config.maxBodyBytes < 1024) errors.push("ARA_MAX_BODY_BYTES must be at least 1024");

  return { ok: missing.length === 0 && errors.length === 0, missing, errors };
}

export function getConfigSummary() {
  return [
    ["NODE_ENV", config.nodeEnv],
    ["ARA_DEFAULT_TENANT_ID", config.defaultTenantId],
    ["ARA_WRITE_MODE", config.writeMode],
    ["ARA_EXTERNAL_SERVICES_MODE", config.externalServicesMode],
    ["OPENAI_MODEL", config.openaiModel],
    ["TZ", config.timezone],
    ["DAILY_IMPORT_LIMIT", config.dailyLimit],
    ["TEST_BATCH_SIZE", config.testBatchSize]
  ].map(([name, value]) => ({ name, value }));
}
