import crypto from "node:crypto";
import { pool } from "./db.js";

export async function upsertAraCandidates(candidates, client = pool) {
  const saved = [];
  for (const candidate of candidates) {
    saved.push(await upsertAraCandidate(candidate, client));
  }
  return saved;
}

export async function upsertAraCandidate(candidate, client = pool) {
  const candidateId = candidate.candidateId || crypto.randomUUID();
  const values = [
    candidateId,
    candidate.tenantId,
    candidate.campaignId,
    candidate.runId,
    candidate.source,
    candidate.apolloPersonId,
    candidate.apolloOrganizationId,
    candidate.hubspotContactId,
    candidate.hubspotCompanyId,
    candidate.contactName,
    candidate.jobTitle,
    candidate.seniority,
    candidate.department,
    candidate.companyName,
    candidate.domain,
    candidate.country,
    candidate.industry,
    candidate.employeeRange,
    candidate.professionalEmail,
    candidate.linkedinUrl,
    candidate.companyIcpScore,
    candidate.contactRelevanceScore,
    candidate.opportunityScore,
    candidate.confidence,
    candidate.recommendation,
    JSON.stringify(candidate.positiveFactors || []),
    JSON.stringify(candidate.negativeFactors || []),
    JSON.stringify(candidate.commercialSignals || []),
    JSON.stringify(candidate.evidence || []),
    candidate.lifecycleStatus,
    candidate.approvalStatus,
    candidate.hubspotSyncStatus,
    candidate.enrichmentStatus,
    candidate.contextStatus,
    candidate.engagementStatus,
    candidate.nextAction,
    candidate.assignedOwner,
    candidate.agentVersion,
    candidate.scoringVersion,
    candidate.rejectionReason,
    candidate.correlationId
  ];
  const result = await client.query(`
    INSERT INTO ara_candidates (
      candidate_id, tenant_id, campaign_id, run_id, source, apollo_person_id, apollo_organization_id,
      hubspot_contact_id, hubspot_company_id, contact_name, job_title, seniority, department,
      company_name, domain, country, industry, employee_range, professional_email, linkedin_url,
      company_icp_score, contact_relevance_score, opportunity_score, confidence, recommendation,
      positive_factors, negative_factors, commercial_signals, evidence, lifecycle_status,
      approval_status, hubspot_sync_status, enrichment_status, context_status, engagement_status,
      next_action, assigned_owner, agent_version, scoring_version, rejection_reason, correlation_id
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23,$24,$25,$26::jsonb,$27::jsonb,$28::jsonb,$29::jsonb,$30,
      $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41
    )
    ON CONFLICT (tenant_id, professional_email, campaign_id) DO UPDATE SET
      apollo_person_id = COALESCE(ara_candidates.apollo_person_id, EXCLUDED.apollo_person_id),
      apollo_organization_id = COALESCE(ara_candidates.apollo_organization_id, EXCLUDED.apollo_organization_id),
      contact_name = EXCLUDED.contact_name,
      job_title = EXCLUDED.job_title,
      seniority = EXCLUDED.seniority,
      department = EXCLUDED.department,
      company_name = EXCLUDED.company_name,
      domain = EXCLUDED.domain,
      country = EXCLUDED.country,
      industry = EXCLUDED.industry,
      employee_range = EXCLUDED.employee_range,
      linkedin_url = EXCLUDED.linkedin_url,
      company_icp_score = EXCLUDED.company_icp_score,
      contact_relevance_score = EXCLUDED.contact_relevance_score,
      opportunity_score = EXCLUDED.opportunity_score,
      confidence = EXCLUDED.confidence,
      recommendation = EXCLUDED.recommendation,
      positive_factors = EXCLUDED.positive_factors,
      negative_factors = EXCLUDED.negative_factors,
      commercial_signals = EXCLUDED.commercial_signals,
      evidence = EXCLUDED.evidence,
      lifecycle_status = CASE
        WHEN ara_candidates.lifecycle_status IN ('APPROVED', 'HUBSPOT_SYNC_PENDING', 'HUBSPOT_SYNCED')
          THEN ara_candidates.lifecycle_status
        ELSE EXCLUDED.lifecycle_status
      END,
      approval_status = CASE
        WHEN ara_candidates.approval_status IN ('APPROVED', 'REJECTED')
          THEN ara_candidates.approval_status
        ELSE EXCLUDED.approval_status
      END,
      hubspot_sync_status = ara_candidates.hubspot_sync_status,
      next_action = EXCLUDED.next_action,
      agent_version = EXCLUDED.agent_version,
      scoring_version = EXCLUDED.scoring_version,
      correlation_id = EXCLUDED.correlation_id,
      updated_at = now()
    RETURNING *
  `, values);
  return toPublicCandidate(result.rows[0]);
}

export async function listAraCandidates({ tenantId, runId, page = 1, pageSize = 25 }, client = pool) {
  const offset = (page - 1) * pageSize;
  const result = await client.query(`
    SELECT *, count(*) OVER() AS total_count
    FROM ara_candidates
    WHERE tenant_id = $1 AND run_id = $2
    ORDER BY opportunity_score DESC NULLS LAST, created_at ASC
    LIMIT $3 OFFSET $4
  `, [tenantId, runId, pageSize, offset]);
  const total = Number(result.rows[0]?.total_count || 0);
  return {
    pagination: { page, page_size: pageSize, total },
    candidates: result.rows.map(toPublicCandidate)
  };
}

export function toPublicCandidate(row) {
  if (!row) return null;
  return {
    candidate_id: row.candidate_id,
    tenant_id: row.tenant_id,
    campaign_id: row.campaign_id,
    run_id: row.run_id,
    contact_id: row.hubspot_contact_id || row.apollo_person_id || null,
    company_id: row.hubspot_company_id || row.apollo_organization_id || null,
    name: row.contact_name,
    company: row.company_name,
    title: row.job_title,
    email: row.professional_email,
    linkedin_url: row.linkedin_url,
    company_icp_score: numberOrNull(row.company_icp_score),
    contact_relevance_score: numberOrNull(row.contact_relevance_score),
    opportunity_score: numberOrNull(row.opportunity_score),
    icp_score: numberOrNull(row.company_icp_score),
    status: row.lifecycle_status,
    lifecycle_status: row.lifecycle_status,
    approval_status: row.approval_status,
    hubspot_sync_status: row.hubspot_sync_status,
    next_action: row.next_action,
    recommendation: row.recommendation,
    evidence: row.evidence || [],
    reasons: (row.positive_factors || []).map(item => item.code || item.message).filter(Boolean),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  return Number(value);
}

