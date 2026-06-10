export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  apolloKey: process.env.APOLLO_API_KEY,
  hubspotToken: normalizeSecret(process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_ACCESS_TOKEN),
  approvalCode: process.env.APPROVAL_CODE,
  timezone: process.env.TZ || "America/Mexico_City",
  dailyLimit: Number(process.env.DAILY_IMPORT_LIMIT || 50),
  testBatchSize: Number(process.env.TEST_BATCH_SIZE || 5),
  apolloBase: process.env.APOLLO_API_BASE || "https://api.apollo.io/api/v1",
  hubspotBase: process.env.HUBSPOT_API_BASE || "https://api.hubapi.com"
};

function normalizeSecret(value) {
  return value?.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
}

export function assertConfig() {
  const missing = getMissingConfig();
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
}

export function getMissingConfig() {
  return [
    ["DATABASE_URL", config.databaseUrl],
    ["APOLLO_API_KEY", config.apolloKey],
    ["HUBSPOT_PRIVATE_APP_TOKEN or HUBSPOT_ACCESS_TOKEN", config.hubspotToken],
    ["APPROVAL_CODE", config.approvalCode]
  ].filter(([, value]) => !value).map(([name]) => name);
}
