import crypto from "node:crypto";

export function toAraCandidate(candidate, { tenantId, campaignId, runId, correlationId, filters = {} }) {
  const name = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ").trim() || candidate.email;
  const evidence = buildEvidence(candidate, filters);
  const scores = scoreCandidate(candidate, filters);
  const recommended = scores.opportunityScore >= 75 && scores.industryMatch && scores.titleMatch;
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
    recommendation: recommended ? "recommended" : "needs_review",
    positiveFactors: evidence.filter(item => item.polarity === "positive"),
    negativeFactors: evidence.filter(item => item.polarity === "negative"),
    commercialSignals: buildCommercialSignals(candidate, filters),
    evidence,
    lifecycleStatus: recommended ? "RECOMMENDED" : "HUMAN_REVIEW_REQUIRED",
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
  const industryMatch = matchesRequestedIndustry(candidate, filters);
  const titleMatch = titleMatches(candidate.title, filters.roles);
  if (candidate.company?.domain) company += 25;
  if (candidate.company?.employees) company += 10;
  if (industryMatch) company += 15;
  else company -= 20;
  if (candidate.emailVerified) contact += 25;
  if (candidate.validPhones?.length) contact += 20;
  if (titleMatch) contact += 15;
  const companyIcpScore = Math.max(0, Math.min(100, company));
  const contactRelevanceScore = Math.min(100, contact);
  const opportunityScore = Math.round((companyIcpScore * 0.45) + (contactRelevanceScore * 0.55));
  return {
    companyIcpScore,
    contactRelevanceScore,
    opportunityScore,
    confidence: Math.min(0.95, Math.max(0.45, opportunityScore / 100)),
    industryMatch,
    titleMatch
  };
}

function buildEvidence(candidate, filters) {
  const industryMatch = matchesRequestedIndustry(candidate, filters);
  return [
    candidate.emailVerified && evidence("verified_email", "Email laboral verificado.", "positive"),
    candidate.company?.domain && evidence("company_domain_available", "Dominio de empresa disponible.", "positive"),
    candidate.validPhones?.length && evidence("valid_phone_available", "Contacto tiene telefono valido.", "positive"),
    candidate.title && evidence("title_available", `Cargo detectado: ${candidate.title}.`, "positive"),
    industryMatch
      ? evidence("industry_match", `Industria/señal ICP detectada para: ${filters.industry}.`, "positive")
      : evidence("industry_not_verified", `Industria solicitada no verificada en señales de Apollo: ${filters.industry}. Revisar antes de sincronizar.`, "negative")
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

function matchesRequestedIndustry(candidate, filters) {
  const terms = [
    filters.industry,
    ...(filters.interpretation?.industryKeywords || [])
  ].map(normalizeText).filter(Boolean);
  const haystack = normalizeText([
    candidate.company?.name,
    candidate.company?.domain,
    candidate.company?.industry,
    ...(candidate.company?.industries || [])
  ].filter(Boolean).join(" "));
  if (!terms.length) return true;
  return terms.some(term => haystack.includes(term) || term.includes(haystack));
}

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

