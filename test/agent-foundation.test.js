import test from "node:test";
import assert from "node:assert/strict";
import {
  createAgentExecutionContract,
  createAgentResultContract,
  validateAgentExecutionContract,
  validateAgentResultContract
} from "../src/agent-contracts.js";
import { toAraCandidate } from "../src/candidate-adapter.js";
import { listAraCandidates, markAraCandidateHubSpotSynced, upsertAraCandidate } from "../src/candidate-repository.js";

const context = {
  tenantId: "freelan",
  campaignId: "campaign-1",
  runId: "11111111-1111-4111-8111-111111111111",
  correlationId: "22222222-2222-4222-8222-222222222222"
};

test("creates and validates agent execution contracts", () => {
  const contract = createAgentExecutionContract({
    ...context,
    agent: "discovery",
    agentVersion: "0.1",
    requestedAction: "discover_candidates",
    trigger: { type: "user", actor_id: "operator" },
    input: { filter_ref: "run.filters" },
    constraints: { external_services_mode: "mock", write_mode: "disabled" }
  });
  assert.equal(contract.contract_version, "1.0");
  assert.equal(validateAgentExecutionContract(contract), true);
});

test("creates and validates agent result contracts", () => {
  const result = createAgentResultContract({
    ...context,
    agent: "discovery",
    agentVersion: "0.1",
    status: "completed",
    decision: "recommended",
    confidence: 0.91,
    evidence: [{ code: "verified_email" }],
    nextAction: "commercial_approval"
  });
  assert.equal(result.next_action, "commercial_approval");
  assert.equal(validateAgentResultContract(result), true);
});

test("maps current Apollo-normalized candidates into ARA candidates", () => {
  const candidate = toAraCandidate({
    apolloId: "apollo-1",
    firstName: "Ana",
    lastName: "Diaz",
    email: "ana@example.com",
    emailVerified: true,
    title: "CIO",
    linkedin: "https://linkedin.example/ana",
    country: "Mexico",
    validPhones: [{ type: "mobile", sanitized_number: "+525511112222" }],
    company: { name: "Example", domain: "example.com", country: "Mexico", employees: 1200, keywords: ["crm"] }
  }, {
    ...context,
    filters: { industry: "Technology", roles: ["CIO"], employeeMin: 50, employeeMax: 5000, interpretation: { companyKeywords: ["HubSpot"] } }
  });
  assert.equal(candidate.tenantId, "freelan");
  assert.equal(candidate.lifecycleStatus, "RECOMMENDED");
  assert.equal(candidate.approvalStatus, "PENDING");
  assert.equal(candidate.nextAction, "commercial_approval");
  assert.ok(candidate.opportunityScore >= 75);
  assert.ok(candidate.evidence.some(item => item.code === "verified_email"));
});

test("candidate repository upserts and serializes rows with a fake client", async () => {
  const calls = [];
  const fakeRow = {
    candidate_id: "33333333-3333-4333-8333-333333333333",
    tenant_id: "freelan",
    campaign_id: "campaign-1",
    run_id: context.runId,
    hubspot_contact_id: null,
    hubspot_company_id: null,
    apollo_person_id: "apollo-1",
    apollo_organization_id: null,
    contact_name: "Ana Diaz",
    company_name: "Example",
    job_title: "CIO",
    professional_email: "ana@example.com",
    linkedin_url: "",
    company_icp_score: "75",
    contact_relevance_score: "95",
    opportunity_score: "86",
    lifecycle_status: "RECOMMENDED",
    approval_status: "PENDING",
    hubspot_sync_status: "pending",
    next_action: "commercial_approval",
    recommendation: "recommended",
    evidence: [{ code: "verified_email" }],
    positive_factors: [{ code: "verified_email" }],
    created_at: "2026-06-23T00:00:00.000Z",
    updated_at: "2026-06-23T00:00:00.000Z"
  };
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [{ ...fakeRow, total_count: 1 }] };
    }
  };
  const saved = await upsertAraCandidate({
    candidateId: fakeRow.candidate_id,
    tenantId: "freelan",
    campaignId: "campaign-1",
    runId: context.runId,
    source: "apollo",
    apolloPersonId: "apollo-1",
    contactName: "Ana Diaz",
    companyName: "Example",
    domain: "example.com",
    professionalEmail: "ana@example.com",
    recommendation: "recommended",
    positiveFactors: [{ code: "verified_email" }],
    negativeFactors: [],
    commercialSignals: [],
    evidence: [{ code: "verified_email" }],
    lifecycleStatus: "RECOMMENDED",
    approvalStatus: "PENDING",
    hubspotSyncStatus: "pending",
    enrichmentStatus: "not_started",
    contextStatus: "not_started",
    engagementStatus: "not_started",
    nextAction: "commercial_approval",
    correlationId: context.correlationId
  }, client);
  assert.equal(saved.candidate_id, fakeRow.candidate_id);
  assert.equal(saved.opportunity_score, 86);
  const listed = await listAraCandidates({ tenantId: "freelan", runId: context.runId }, client);
  assert.equal(listed.pagination.total, 1);
  assert.equal(listed.candidates[0].email, "ana@example.com");
  assert.equal(calls.length, 2);
});

test("candidate repository marks HubSpot sync completion", async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [{
          candidate_id: "33333333-3333-4333-8333-333333333333",
          tenant_id: "freelan",
          campaign_id: "campaign-1",
          run_id: context.runId,
          hubspot_contact_id: "contact-1",
          hubspot_company_id: "company-1",
          apollo_person_id: "apollo-1",
          contact_name: "Ana Diaz",
          company_name: "Example",
          job_title: "CIO",
          professional_email: "ana@example.com",
          lifecycle_status: "HUBSPOT_SYNCED",
          approval_status: "PENDING",
          hubspot_sync_status: "synced",
          next_action: "hubspot_review",
          evidence: [],
          positive_factors: [],
          created_at: "2026-06-23T00:00:00.000Z",
          updated_at: "2026-06-23T00:00:00.000Z"
        }]
      };
    }
  };
  const updated = await markAraCandidateHubSpotSynced({
    tenantId: "freelan",
    runId: context.runId,
    email: "ana@example.com",
    hubspotContactId: "contact-1",
    hubspotCompanyId: "company-1"
  }, client);
  assert.equal(updated.status, "HUBSPOT_SYNCED");
  assert.equal(updated.hubspot_sync_status, "synced");
  assert.equal(updated.contact_id, "contact-1");
  assert.equal(calls[0].values[2], "ana@example.com");
});

