import test from "node:test";
import assert from "node:assert/strict";
import { config, validateConfig } from "../src/config.js";
import { createCorrelationId, isValidCorrelationId, runWithContext, getCorrelationId } from "../src/context.js";
import { createOperatorSession, requireInternalAuth } from "../src/auth.js";
import { AuthenticationError, HubSpotWriteBlockedError } from "../src/errors.js";
import { maskEmail, maskPhone, sanitize } from "../src/logger.js";
import { assertHubSpotWriteAllowed } from "../src/write-guard.js";
import { buildApolloSearchPayload, ensureHubSpotProperties, findApolloCandidates, importCandidate, writeEngagementPrep } from "../src/clients.js";
import { interpretFilters, verifyOpenAIConnection } from "../src/interpreter.js";

const original = {
  adminToken: config.adminToken,
  writeMode: config.writeMode,
  databaseUrl: config.databaseUrl,
  apolloKey: config.apolloKey,
  hubspotToken: config.hubspotToken,
  openaiKey: config.openaiKey,
  approvalCode: config.approvalCode,
  nodeEnv: config.nodeEnv,
  externalServicesMode: config.externalServicesMode,
  operatorEmail: config.operatorEmail,
  operatorPassword: config.operatorPassword
};

test.afterEach(() => {
  Object.assign(config, original);
  delete globalThis.fetch;
});

function reqWithToken(token) {
  return {
    path: "/api/runs",
    method: "POST",
    ip: "127.0.0.1",
    get(name) {
      return name.toLowerCase() === "x-ara-admin-token" ? token : undefined;
    }
  };
}

function candidate() {
  return {
    firstName: "Ana",
    lastName: "Diaz",
    email: "ana@example.com",
    title: "CIO",
    linkedin: "",
    city: "Mexico City",
    state: "",
    country: "Mexico",
    validPhones: [{ type: "mobile", sanitized_number: "+525511112222" }],
    company: { name: "Example", domain: "example.com", keywords: [] }
  };
}

function filters() {
  return {
    industry: "Banca",
    roles: ["CIO"],
    adHocBrief: "",
    interpretation: {
      industryKeywords: ["Banking"],
      companyKeywords: [],
      explanation: "match"
    }
  };
}

function searchFilters() {
  return {
    employeeMin: 50,
    employeeMax: 100,
    countries: ["Mexico"],
    interpretation: {
      industryKeywords: ["Banking"],
      roleTitles: ["CIO"],
      seniorities: [],
      contactLocations: [],
      excludedTitles: []
    }
  };
}

test("generates and reuses valid correlation IDs", () => {
  const generated = createCorrelationId();
  assert.equal(isValidCorrelationId(generated), true);
  assert.equal(createCorrelationId(generated), generated);
});

test("invalid incoming correlation ID is replaced", () => {
  const generated = createCorrelationId("not-a-valid-id");
  assert.equal(isValidCorrelationId(generated), true);
  assert.notEqual(generated, "not-a-valid-id");
});

test("propagates correlation ID through async context", async () => {
  const id = createCorrelationId();
  await runWithContext({ correlationId: id }, async () => {
    assert.equal(getCorrelationId(), id);
  });
});

test("internal auth accepts valid token and rejects invalid token without exposing it", () => {
  config.adminToken = "test-admin-token";
  assert.doesNotThrow(() => requireInternalAuth(reqWithToken("test-admin-token")));
  assert.throws(() => requireInternalAuth(reqWithToken("wrong-token")), AuthenticationError);
});

test("internal auth normalizes copied token wrappers", () => {
  config.adminToken = "test-admin-token";
  assert.doesNotThrow(() => requireInternalAuth(reqWithToken("  test-admin-token  ")));
  assert.doesNotThrow(() => requireInternalAuth(reqWithToken("Bearer test-admin-token")));
  assert.doesNotThrow(() => requireInternalAuth(reqWithToken('"test-admin-token"')));
});

test("operator login creates session accepted by internal auth", () => {
  config.adminToken = "test-admin-token";
  config.operatorEmail = "antonio.rubio@freelan.com.mx";
  config.operatorPassword = "test-password";
  const result = createOperatorSession({
    email: "antonio.rubio@freelan.com.mx",
    password: "test-password"
  });
  assert.ok(result.session.token);
  assert.doesNotThrow(() => requireInternalAuth({
    path: "/api/runs",
    method: "POST",
    ip: "127.0.0.1",
    get(name) {
      return name.toLowerCase() === "x-ara-session-token" ? result.session.token : undefined;
    }
  }));
});

test("internal auth rejects missing token", () => {
  config.adminToken = "test-admin-token";
  assert.throws(() => requireInternalAuth(reqWithToken(undefined)), AuthenticationError);
});

test("configuration validation reports missing required names without values", () => {
  config.databaseUrl = "";
  config.apolloKey = "";
  config.hubspotToken = "";
  config.openaiKey = "";
  config.approvalCode = "";
  config.adminToken = "";
  const validation = validateConfig();
  assert.equal(validation.ok, false);
  assert.deepEqual(validation.missing, [
    "DATABASE_URL",
    "APOLLO_API_KEY",
    "HUBSPOT_PRIVATE_APP_TOKEN or HUBSPOT_ACCESS_TOKEN",
    "OPENAI_API_KEY",
    "APPROVAL_CODE",
    "ARA_ADMIN_TOKEN",
    "ARA_OPERATOR_EMAIL",
    "ARA_OPERATOR_PASSWORD"
  ]);
});

test("ARA_WRITE_MODE enabled is rejected during tests", () => {
  config.nodeEnv = "test";
  config.writeMode = "enabled";
  const validation = validateConfig();
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /enabled is not allowed/);
});

test("invalid ARA_WRITE_MODE is rejected", () => {
  config.writeMode = "danger";
  const validation = validateConfig();
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /disabled, preview, or enabled/);
});

test("invalid ARA_EXTERNAL_SERVICES_MODE is rejected", () => {
  config.externalServicesMode = "production";
  const validation = validateConfig();
  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /mock, sandbox, or live/);
});

test("mock external services mode interprets filters without calling OpenAI", async () => {
  config.externalServicesMode = "mock";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called in mock mode");
  };
  const interpretation = await interpretFilters({
    industry: "Retail",
    selectedRoles: ["Director Comercial"],
    countries: ["Mexico"],
    employeeRange: [50, 5000],
    adHocBrief: "Busca empresas con CRM y pipeline comercial."
  });
  const diagnostic = await verifyOpenAIConnection();
  assert.equal(called, false);
  assert.equal(diagnostic.ok, true);
  assert.equal(diagnostic.mode, "mock");
  assert.ok(interpretation.industryKeywords.includes("Retail"));
  assert.ok(interpretation.roleTitles.includes("Director Comercial"));
  assert.ok(interpretation.companyKeywords.includes("CRM"));
});

test("write guard blocks HubSpot writes in disabled mode", () => {
  config.writeMode = "disabled";
  assert.throws(() => assertHubSpotWriteAllowed("hubspot.contacts.create"), HubSpotWriteBlockedError);
});

test("preview mode returns planned properties without calling fetch", async () => {
  config.writeMode = "preview";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };
  const result = await importCandidate(candidate(), filters());
  assert.equal(result.preview, true);
  assert.equal(result.email, "ana@example.com");
  assert.equal(result.contactProperties.hs_whatsapp_phone_number, "+525511112222");
  assert.equal(called, false);
});

test("preview mode returns Engagement Prep notes without calling HubSpot", async () => {
  config.writeMode = "preview";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };
  const result = await writeEngagementPrep(candidate(), {
    ...filters(),
    employeeMin: 50,
    employeeMax: 5000,
    countries: ["Mexico"],
    roles: ["CIO"],
    interpretation: {
      industryKeywords: ["Banking"],
      companyKeywords: ["CRM"],
      explanation: "match"
    }
  });
  assert.equal(result.preview, true);
  assert.equal(called, false);
  assert.match(result.contactProperties.ara_engagement_prep_notes, /Contexto de la empresa/);
  assert.match(result.contactProperties.ara_engagement_prep_notes, /Recomendaciones de approach/);
});

test("disabled mode blocks import before any real API call", async () => {
  config.writeMode = "disabled";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };
  await assert.rejects(() => importCandidate(candidate(), filters()), HubSpotWriteBlockedError);
  assert.equal(called, false);
});

test("Apollo search returns eligible mocked candidates", async () => {
  config.externalServicesMode = "live";
  config.apolloKey = "test-apollo-key";
  globalThis.fetch = async () => new Response(JSON.stringify({
    people: [{
      id: "apollo-1",
      first_name: "Ana",
      last_name: "Diaz",
      email: "ana@example.com",
      email_status: "verified",
      title: "CIO",
      phone_numbers: [{ type: "mobile", sanitized_number: "+525511112222" }],
      organization: { name: "Example", primary_domain: "example.com" }
    }]
  }), { status: 200 });
  const candidates = await findApolloCandidates(searchFilters());
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].email, "ana@example.com");
});

test("mock external services mode returns Apollo candidates without network", async () => {
  config.externalServicesMode = "mock";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called in mock mode");
  };
  const candidates = await findApolloCandidates({
    ...searchFilters(),
    industry: "Retail",
    roles: ["Director Comercial"],
    quantity: 5,
    interpretation: {
      ...searchFilters().interpretation,
      industryKeywords: ["Retail", "Commerce"],
      companyKeywords: ["CRM"]
    }
  });
  assert.equal(called, false);
  assert.equal(candidates.length, 5);
  assert.equal(candidates.every(candidate => candidate.emailVerified), true);
  assert.equal(candidates.every(candidate => candidate.company.domain), true);
  assert.equal(candidates.every(candidate => candidate.validPhones.length), true);
});

test("Apollo payload uses only current console filters and approved expansions", () => {
  const payload = buildApolloSearchPayload({
    employeeMin: 50,
    employeeMax: 5000,
    countries: ["Mexico", "Colombia"],
    roles: ["Director Comercial"],
    adHocBrief: "exclude current customers and prioritize CRM",
    interpretation: {
      industryKeywords: ["Manufacturing"],
      roleTitles: ["Director Comercial", "Commercial Director"],
      seniorities: ["director"],
      contactLocations: ["Monterrey"],
      companyKeywords: ["CRM", "manual sales"],
      excludedTitles: ["Assistant"]
    }
  }, "Manufacturing", 2);

  assert.deepEqual(payload, {
    page: 2,
    per_page: 100,
    organization_num_employees_ranges: ["50,5000"],
    organization_locations: ["Mexico", "Colombia"],
    q_organization_keyword_tags: ["Manufacturing"],
    person_titles: ["Director Comercial", "Commercial Director"],
    include_similar_titles: true,
    contact_email_status: ["verified"]
  });
  assert.equal("person_locations" in payload, false);
  assert.equal("person_seniorities" in payload, false);
  assert.equal("excludedTitles" in payload, false);
  assert.equal("companyKeywords" in payload, false);
});

test("Apollo search falls back to selected roles without industry keyword", async () => {
  config.externalServicesMode = "live";
  config.apolloKey = "test-apollo-key";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls += 1;
    const payload = JSON.parse(options.body);
    const people = payload.q_organization_keyword_tags ? [] : [{
      id: "apollo-fallback-1",
      first_name: "Ana",
      last_name: "Diaz",
      email: "ana@example.com",
      email_status: "verified",
      title: "Director Comercial",
      phone_numbers: [{ type: "mobile", sanitized_number: "+525511112222" }],
      organization: { name: "Example", primary_domain: "example.com" }
    }];
    return new Response(JSON.stringify({ people }), { status: 200 });
  };
  const candidates = await findApolloCandidates({
    ...searchFilters(),
    roles: ["Director Comercial"],
    interpretation: {
      ...searchFilters().interpretation,
      industryKeywords: ["No Match"],
      roleTitles: ["No Match Role"]
    }
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].email, "ana@example.com");
  assert.equal(calls, 3);
});

test("inferred title exclusions do not reject otherwise eligible Apollo candidates", async () => {
  config.externalServicesMode = "live";
  globalThis.fetch = async () => new Response(JSON.stringify({
    people: [{
      id: "apollo-3",
      first_name: "Ana",
      last_name: "Diaz",
      email: "ana@example.com",
      email_status: "verified",
      title: "Assistant Commercial Director",
      phone_numbers: [{ type: "mobile", sanitized_number: "+525511112222" }],
      organization: { name: "Example", primary_domain: "example.com" }
    }]
  }), { status: 200 });
  const candidates = await findApolloCandidates({
    ...searchFilters(),
    interpretation: {
      ...searchFilters().interpretation,
      excludedTitles: ["Assistant"]
    }
  });
  assert.equal(candidates.length, 1);
});

test("candidate without mappable phone is rejected by current filter", async () => {
  config.externalServicesMode = "live";
  globalThis.fetch = async () => new Response(JSON.stringify({
    people: [{
      id: "apollo-2",
      email: "no-phone@example.com",
      email_status: "verified",
      phone_numbers: [{ type: "work_hq", sanitized_number: "+525511112222" }],
      organization: { name: "Example", primary_domain: "example.com" }
    }]
  }), { status: 200 });
  const candidates = await findApolloCandidates(searchFilters());
  assert.equal(candidates.length, 0);
});

test("Apollo 429 is classified as rate limit error", async () => {
  config.externalServicesMode = "live";
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "rate limit" }), { status: 429 });
  await assert.rejects(() => findApolloCandidates(searchFilters()), /Apollo rate limit exceeded/);
});

test("Apollo non-rate error is classified safely", async () => {
  config.externalServicesMode = "live";
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "provider down" }), { status: 500 });
  await assert.rejects(() => findApolloCandidates(searchFilters()), /Apollo request failed/);
});

test("ensureHubSpotProperties is blocked when writes are disabled", async () => {
  config.writeMode = "disabled";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not be called");
  };
  await assert.rejects(() => ensureHubSpotProperties(), HubSpotWriteBlockedError);
  assert.equal(called, false);
});

test("logger helpers mask emails and phones", () => {
  assert.equal(maskEmail("ana@example.com"), "a***@example.com");
  assert.equal(maskPhone("+525511112222"), "***2222");
});

test("sanitizer redacts tokens and masks PII", () => {
  const value = sanitize({
    Authorization: "Bearer secret-token",
    email: "ana@example.com",
    phone: "+525511112222"
  });
  assert.equal(value.Authorization, "[REDACTED]");
  assert.equal(value.email, "a***@example.com");
  assert.equal(value.phone, "***2222");
});
