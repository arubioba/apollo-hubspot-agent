import crypto from "node:crypto";

export function toAraCandidate(candidate, { tenantId, campaignId, runId, correlationId, filters = {} }) {
  const name = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() || candidate.email;
  const evidence = buildEvidence(candidate, filters);
  const scores = scoreCandidate(candidate, filters);
  return {
    candidateId: crypto.randomUUID(),
    tenantId,
    campaignId,
    runId,
    source: "apollo",
    apolloPersonId: candidate.apolloId || null,
    apolloOrganizationId: candidate.company?.apolloId || null,
    hubspotContactId: null,
    hubspotCompanyId: null,
    contactName: name,
    jobTitle: candidate.title || "",
    seniority: inferSeniority(candidate.title),
    department: inferDepartment(candidate.title),
    companyName: candidate.company?.name || "",
    domain: candidate.company?.domain || "",
    country: candidate.company?.country || candidate.country || "",
    industry: filters.industry || "",
    employeeRange: filters.employeeMin && filters.employeeMax ? `${filters.employeeMin}-${filters.employeeMax}` : "",
    professionalEmail: candidate.email,
    linkedinUrl: candidate.linkedin || "",
    companyIcpScore: scores.companyIcpScore,
    contactRelevanceScore: scores.contactRelevanceScore,
    opportunityScore: scores.opportunityScore,
    confidence: scores.confidence,
    recommendation: scores.opportunityScore >= 75 ? "recommended" : "needs_review",
    positiveFactors: evidence.filter(item => item.polarity === "positive"),
    negativeFactors: evidence.filter(item => item.polarity === "negative"),
    commercialSignals: buildCommercialSignals(candidate, filters),
    evidence,
    lifecycleStatus: scores.opportunityScore >= 75 ? "RECOMMENDED" : "HUMAN_REVIEW_REQUIRED",
    approvalStatus: "PENDING",
    hubspotSyncStatus: "pending",
    enrichmentStatus: "not_started",
    contextStatus: "not_started",
    engagementStatus: "not_started",
    nextAction: "commercial_approval",
    assignedOwner: null,
    agentVersion: "discovery-0.1",
    scoringVersion: "heuristic-0.1",
    rejectionReason: null,
    correlationId
  };
}

function scoreCandidate(candidate, filters) {
  let company = 40;
  let contact = 35;
  if (candidate.company?.domain) company += 25;
  if (candidate.company?.employees) company += 10;
  if (candidate.emailVerified) contact += 25;
  if (candidate.validPhones?.length) contact += 20;
  if (titleMatches(candidate.title, filters.roles)) contact += 15;
  const companyIcpScore = Math.min(100, company);
  const contactRelevanceScore = Math.min(100, contact);
  const opportunityScore = Math.round((companyIcpScore * 0.45) + (contactRelevanceScore * 0.55));
  return {
    companyIcpScore,
    contactRelevanceScore,
    opportunityScore,
    confidence: Math.min(0.95, Math.max(0.45, opportunityScore / 100))
  };
}

function buildEvidence(candidate, filters) {
  return [
    candidate.emailVerified && evidence("verified_email", "Email laboral verificado.", "positive"),
    candidate.company?.domain && evidence("company_domain_available", "Dominio de empresa disponible.", "positive"),
    candidate.validPhones?.length && evidence("valid_phone_available", "Contacto tiene telefono valido.", "positive"),
    candidate.title && evidence("title_available", `Cargo detectado: ${candidate.title}.`, "positive"),
    filters.industry && evidence("industry_requested", `Industria solicitada: ${filters.industry}.`, "positive")
  ].filter(Boolean);
}

function buildCommercialSignals(candidate, filters) {
  return [
    ...(candidate.company?.keywords || []).map(value => ({ type: "company_keyword", value })),
    ...(filters.interpretation?.companyKeywords || []).map(value => ({ type: "requested_signal", value }))
  ];
}

function evidence(code, message, polarity) {
  return { code, message, polarity };
}

function titleMatches(title = "", roles = []) {
  const normalized = title.toLowerCase();
  return roles.some(role => normalized.includes(String(role).toLowerCase()));
}

function inferSeniority(title = "") {
  const value = title.toLowerCase();
  if (/\b(chief|cxo|cio|cto|cmo|ceo)\b/.test(value)) return "executive";
  if (/\bvp|vice president\b/.test(value)) return "vp";
  if (/\bdirector\b/.test(value)) return "director";
  if (/\bmanager|head\b/.test(value)) return "manager";
  return "";
}

function inferDepartment(title = "") {
  const value = title.toLowerCase();
  if (/marketing|cmo/.test(value)) return "marketing";
  if (/sales|ventas|comercial/.test(value)) return "sales";
  if (/technology|tecnologia|cio|cto|it\b/.test(value)) return "technology";
  return "";
}

