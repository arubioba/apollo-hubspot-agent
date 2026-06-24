import { config } from "./config.js";
import { ApolloError, ApolloRateLimitError, HubSpotError, ValidationError } from "./errors.js";
import { logger } from "./logger.js";
import { assertHubSpotWriteAllowed, isPreviewMode } from "./write-guard.js";
import { getAraKnowledgeProfile } from "./ara-knowledge.js";

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${response.status} ${body.message || body.error || text}`);
  return body;
}

async function apollo(path, body, method = "POST") {
  try {
    return await request(`${config.apolloBase}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Api-Key": config.apolloKey },
      body: method === "GET" ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    logger.error("apollo.search.failed", "Apollo request failed.", { path, error });
    if (error.message.startsWith("429")) throw new ApolloRateLimitError("Apollo rate limit exceeded.", { cause: error });
    throw new ApolloError("Apollo request failed.", { cause: error });
  }
}

async function hubspot(path, options = {}) {
  try {
    return await request(`${config.hubspotBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.hubspotToken}`,
        ...options.headers
      }
    });
  } catch (error) {
    throw new HubSpotError("HubSpot request failed.", { cause: error });
  }
}

export async function findApolloCandidates(filters, page = 1) {
  if (config.externalServicesMode === "mock") {
    logger.info("apollo.mock_search.used", "Mock Apollo candidates generated for external services mock mode.", {
      page,
      industry: filters.industry,
      roles: filters.roles
    });
    return mockApolloCandidates(filters, page);
  }

  for (const profile of buildApolloSearchProfiles(filters)) {
    const results = [];
    for (const industry of profile.industries) {
      const payload = buildApolloSearchPayload(filters, industry, page, profile);
      logger.info("apollo.search.payload", "Apollo search payload prepared from current console filters.", {
        page,
        profile: profile.name,
        industry: industry || "none",
        keys: Object.keys(payload)
      });
      const data = await apollo("/contacts/search", payload);
      results.push(...(data.people || data.contacts || []));
    }
    const candidates = normalizeAndFilterCandidates(results, filters);
    if (candidates.length) return candidates;
  }
  return [];
}

function mockApolloCandidates(filters, page = 1) {
  if (page > 1) return [];
  const roles = filters.roles?.length ? filters.roles : ["Director Comercial"];
  const industryTerms = filters.interpretation?.industryKeywords?.length
    ? filters.interpretation.industryKeywords
    : [filters.industry];
  const companies = mockCompanies(filters, industryTerms);
  return companies.flatMap((company, companyIndex) => roles.slice(0, 3).map((role, roleIndex) => ({
    apolloId: `mock-${page}-${companyIndex}-${roleIndex}`,
    firstName: ["Ana", "Luis", "Mariana", "Carlos", "Sofia", "Diego", "Laura", "Ricardo"][companyIndex + roleIndex] || "Alex",
    lastName: ["Gomez", "Torres", "Diaz", "Lopez", "Mendez", "Ruiz", "Herrera", "Vargas"][companyIndex + roleIndex] || "Mock",
    email: `${slug(role)}.${companyIndex + roleIndex + 1}@${company.domain}`,
    emailVerified: true,
    title: role,
    linkedin: `https://linkedin.com/in/mock-${companyIndex}-${roleIndex}`,
    city: company.city,
    state: "",
    country: company.country,
    validPhones: [{ type: roleIndex % 2 ? "direct" : "mobile", sanitized_number: `+52550000${String(companyIndex + 10).padStart(2, "0")}${String(roleIndex + 10).padStart(2, "0")}` }],
    company
  }))).slice(0, Math.max(5, Math.min(25, Number(filters.quantity || 10))));
}

function mockCompanies(filters, industryTerms) {
  const countries = filters.countries?.length ? filters.countries : ["Mexico"];
  const industry = industryTerms[0] || filters.industry || "Industry";
  return [
    ["Nexa Retail Group", "nexaretail.example", "Mexico"],
    ["Omni Commerce Latam", "omnicommerce.example", "Mexico"],
    ["Andes Customer Stores", "andescustomerstores.example", "Colombia"],
    ["Punto Venta Digital", "puntoventadigital.example", "Mexico"],
    ["Mercado Operaciones", "mercadooperaciones.example", "Colombia"],
    ["Retail Pipeline Co", "retailpipeline.example", "Mexico"],
    ["Commerce Enablement", "commerceenablement.example", "Mexico"],
    ["Distribuidora ICP", "distribuidoraicp.example", "Colombia"]
  ].filter(([, , country]) => countries.includes(country)).map(([name, domain, country], index) => ({
    name,
    domain,
    website: `https://${domain}`,
    phone: `+52551111${String(index).padStart(4, "0")}`,
    city: country === "Colombia" ? "Bogota" : "Ciudad de Mexico",
    state: "",
    country,
    zip: "",
    linkedin: `https://linkedin.com/company/${domain.split(".")[0]}`,
    employees: Math.min(filters.employeeMax || 5000, Math.max(filters.employeeMin || 50, 250 + (index * 175))),
    keywords: unique([industry, filters.industry, ...(filters.interpretation?.companyKeywords || []), "CRM", "pipeline comercial"])
  }));
}

function slug(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") || "contact";
}

function unique(items) {
  return [...new Set(items.map(item => String(item || "").trim()).filter(Boolean))];
}

function normalizeText(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeAndFilterCandidates(results, filters = {}) {
  return [...new Map(results.map(person => [person.id, person])).values()].map(person => {
    const candidate = normalizeCandidate(person);
    logger.debug("candidate.normalized", "Candidate normalized.", { email: candidate.email, apolloId: candidate.apolloId });
    return candidate;
  })
    .filter(c => {
      const accepted = c.emailVerified && c.company.domain && c.validPhones.some(isMappableContactPhone);
      if (!accepted) logger.debug("candidate.rejected", "Candidate rejected by eligibility filters.", { email: c.email, title: c.title });
      return accepted;
    })
    .filter(c => {
      const rejected = companyMatchesExcludedKeywords(c, filters.interpretation?.excludedCompanyKeywords || []);
      if (rejected) logger.debug("candidate.rejected", "Candidate rejected by company exclusion filters.", { email: c.email, company: c.company.name });
      return !rejected;
    });
}

export function buildApolloSearchPayload(filters, industry, page = 1, profile = {}) {
  return compact({
    page,
    per_page: 100,
    organization_num_employees_ranges: [`${filters.employeeMin},${filters.employeeMax}`],
    organization_locations: filters.countries,
    q_organization_keyword_tags: industry ? [industry] : undefined,
    person_titles: profile.roleTitles || filters.interpretation?.roleTitles || filters.roles,
    include_similar_titles: true,
    contact_email_status: ["verified"]
  });
}

function buildApolloSearchProfiles(filters) {
  const industries = getIndustrySearchTerms(filters);
  const selectedRoles = filters.roles || [];
  const interpretedRoles = filters.interpretation?.roleTitles || selectedRoles;
  const profiles = [
    { name: "interpreted_industry_roles", industries, roleTitles: interpretedRoles },
    { name: "selected_industry_roles", industries, roleTitles: selectedRoles }
  ];
  return profiles
    .filter(profile => profile.roleTitles?.length)
    .filter((profile, index, all) => all.findIndex(other =>
      JSON.stringify(other.industries) === JSON.stringify(profile.industries)
      && JSON.stringify(other.roleTitles) === JSON.stringify(profile.roleTitles)
    ) === index);
}

function getIndustrySearchTerms(filters) {
  const terms = filters.interpretation?.industryKeywords?.length
    ? filters.interpretation.industryKeywords
    : [filters.industry];
  return [...new Set(terms.map(term => String(term || "").trim()).filter(Boolean))];
}

export function normalizeCandidate(person) {
  const organization = person.organization || person.account || {};
  const phones = person.phone_numbers || [];
  const organizationSignals = unique([
    ...(organization.keywords || []),
    ...(organization.technologies || []),
    ...(organization.current_technologies || []),
    ...(organization.technology_names || [])
  ].map(signalToText));
  return {
    apolloId: person.id,
    firstName: person.first_name || "",
    lastName: person.last_name || "",
    email: person.email,
    emailVerified: ["verified", "likely to engage"].includes((person.email_status || "").toLowerCase()),
    title: person.title || "",
    linkedin: person.linkedin_url || "",
    city: person.city || "",
    state: person.state || "",
    country: person.country || "",
    validPhones: phones.filter(p => p.status === "valid_number" || p.sanitized_number),
    company: {
      name: organization.name || person.organization_name || "",
      domain: organization.primary_domain || organization.domain || "",
      website: organization.website_url || "",
      phone: organization.sanitized_phone || organization.phone || "",
      city: organization.city || "",
      state: organization.state || "",
      country: organization.country || "",
      zip: organization.postal_code || "",
      linkedin: organization.linkedin_url || "",
      employees: organization.estimated_num_employees || organization.num_employees || null,
      keywords: organizationSignals
    }
  };
}

function signalToText(value) {
  if (typeof value === "string") return value;
  return value?.name || value?.technology_name || value?.title || value?.value || "";
}

function companyMatchesExcludedKeywords(candidate, excludedKeywords = []) {
  const exclusions = excludedKeywords.map(normalizeText).filter(Boolean);
  if (!exclusions.length) return false;
  const company = candidate.company || {};
  const haystack = normalizeText([
    company.name,
    company.domain,
    company.website,
    ...(company.keywords || [])
  ].join(" "));
  return exclusions.some(term => haystack.includes(term));
}

function isMappableContactPhone(phone) {
  return ["mobile", "direct", "direct_dial", "work_direct"].includes(phone.type)
    && Boolean(phone.sanitized_number);
}

export function contactProperties(candidate) {
  const mobile = candidate.validPhones.find(p => p.type === "mobile" && p.sanitized_number);
  const direct = candidate.validPhones.find(p =>
    ["direct", "direct_dial", "work_direct"].includes(p.type) && p.sanitized_number
  );
  return compact({
    firstname: candidate.firstName, lastname: candidate.lastName, email: candidate.email,
    jobtitle: candidate.title, company: candidate.company.name, hs_linkedin_url: candidate.linkedin,
    city: candidate.city, state: candidate.state, country: candidate.country,
    phone: direct?.sanitized_number, hs_whatsapp_phone_number: mobile?.sanitized_number
  });
}

function companyProperties(company) {
  return compact({
    name: company.name, domain: company.domain, website: company.website, phone: company.phone,
    city: company.city, state: company.state, country: company.country, zip: company.zip,
    linkedin_company_page: company.linkedin,
    numberofemployees: company.employees ? String(company.employees) : undefined,
    ara_company_keywords: company.keywords?.length ? company.keywords.join("; ") : undefined
  });
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ""));
}

async function searchOne(objectType, propertyName, value, properties) {
  const body = {
    filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }],
    properties, limit: 1
  };
  const data = await hubspot(`/crm/v3/objects/${objectType}/search`, {
    method: "POST", body: JSON.stringify(body)
  });
  return data.results?.[0] || null;
}

async function createObject(objectType, properties) {
  assertHubSpotWriteAllowed(`hubspot.${objectType}.create`, { objectType });
  return hubspot(`/crm/v3/objects/${objectType}`, {
    method: "POST", body: JSON.stringify({ properties })
  });
}

async function fillBlankProperties(objectType, id, incoming) {
  const current = await hubspot(`/crm/v3/objects/${objectType}/${id}?properties=${Object.keys(incoming).join(",")}`);
  const updates = Object.fromEntries(Object.entries(incoming).filter(([key]) => !current.properties?.[key]));
  if (!Object.keys(updates).length) return current;
  assertHubSpotWriteAllowed(`hubspot.${objectType}.update`, { objectType, id });
  return hubspot(`/crm/v3/objects/${objectType}/${id}`, {
    method: "PATCH", body: JSON.stringify({ properties: updates })
  });
}

async function associate(contactId, companyId) {
  assertHubSpotWriteAllowed("hubspot.association.create", { contactId, companyId });
  return hubspot(`/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`, {
    method: "PUT"
  });
}

export async function importCandidate(candidate, filters) {
  if (!candidate.email || !candidate.company.domain) {
    throw new ValidationError("Missing verified email or company domain");
  }
  const araIncoming = araContactProperties(candidate, filters);
  const contactIncoming = {
    ...contactProperties(candidate),
    ...araIncoming,
    ara_engagement_prep_notes: buildEngagementPrepNote(candidate, filters),
    freelan_icp_match_context: araIncoming.ara_icp_match_context
  };
  const companyIncoming = {
    ...companyProperties(candidate.company),
    ...araCompanyProperties(candidate, filters)
  };
  if (isPreviewMode()) {
    logger.info("hubspot.preview.completed", "HubSpot candidate preview completed.", { email: candidate.email });
    return { preview: true, email: candidate.email, contactProperties: contactIncoming, companyProperties: companyIncoming };
  }
  assertHubSpotWriteAllowed("hubspot.candidate.import", { email: candidate.email });

  let company = await searchOne("companies", "domain", candidate.company.domain, ["domain", "name"]);
  company = company
    ? await fillBlankProperties("companies", company.id, companyIncoming)
    : await createObject("companies", companyIncoming);

  let contact = await searchOne("contacts", "email", candidate.email, ["email", "firstname", "lastname"]);
  contact = contact
    ? await fillBlankProperties("contacts", contact.id, contactIncoming)
    : await createObject("contacts", contactIncoming);

  await associate(contact.id, company.id);
  return { contactId: contact.id, companyId: company.id, email: candidate.email };
}

export async function writeEngagementPrep(candidate, filters) {
  if (!candidate.email) throw new ValidationError("Missing contact email for Engagement Prep");
  const intelligence = isPreviewMode()
    ? mockAccountIntelligence(candidate, filters)
    : await buildAccountIntelligence(candidate, filters);
  const note = buildEngagementPrepNote(candidate, filters, intelligence);
  const properties = { ara_engagement_prep_notes: note };
  if (isPreviewMode()) {
    logger.info("hubspot.engagement_preview.completed", "HubSpot engagement prep preview completed.", { email: candidate.email });
    return { preview: true, email: candidate.email, contactProperties: properties };
  }
  assertHubSpotWriteAllowed("hubspot.engagement_prep.update", { email: candidate.email });
  const contact = await searchOne("contacts", "email", candidate.email, ["email", "ara_engagement_prep_notes"]);
  if (!contact?.id) throw new ValidationError(`Contact must be synced before Engagement Prep: ${candidate.email}`);
  await hubspot(`/crm/v3/objects/contacts/${contact.id}`, {
    method: "PATCH",
    body: JSON.stringify({ properties })
  });
  return { contactId: contact.id, email: candidate.email, engagementPrepNotes: note };
}

function mockAccountIntelligence(candidate, filters) {
  return {
    website: {
      url: candidate.company?.website || `https://${candidate.company?.domain}`,
      summary: `${candidate.company?.name || "La empresa"} presenta señales compatibles con el ICP ${filters.industry}.`,
      signals: ["revenue operations", "CRM", "automatización comercial"]
    },
    stakeholders: buyerPersonaTitles(filters).slice(0, 2).map((title, index) => ({
      name: ["Stakeholder ARA 1", "Stakeholder ARA 2"][index],
      title,
      email: "",
      linkedin: "",
      reason: "Buyer persona alineado al ICP Freelan/ARA."
    }))
  };
}

async function buildAccountIntelligence(candidate, filters) {
  const [website, stakeholders] = await Promise.all([
    analyzeCompanyWebsite(candidate).catch(error => {
      logger.warn("account_intelligence.website_failed", "Website analysis failed.", { domain: candidate.company?.domain, error });
      return null;
    }),
    findAdditionalStakeholders(candidate, filters).catch(error => {
      logger.warn("account_intelligence.stakeholders_failed", "Stakeholder discovery failed.", { domain: candidate.company?.domain, error });
      return [];
    })
  ]);
  return { website, stakeholders };
}

async function analyzeCompanyWebsite(candidate) {
  if (config.externalServicesMode === "mock") {
    return {
      url: candidate.company?.website || `https://${candidate.company?.domain}`,
      summary: `${candidate.company?.name || "La empresa"} presenta señales comerciales compatibles con el ICP y requiere validación consultiva del modelo de ingresos.`,
      signals: ["modelo comercial B2B/B2C", "oportunidad de revenue operations", "potencial de automatización comercial"]
    };
  }
  const url = normalizeWebsiteUrl(candidate.company?.website || candidate.company?.domain);
  if (!url) return null;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(7000),
    headers: { "User-Agent": "ARA-Freelan/0.1 (+https://freelan.com.mx)" }
  });
  if (!response.ok) throw new Error(`Website ${response.status}`);
  const html = await response.text();
  const text = htmlToText(html).slice(0, 5000);
  if (!text) return { url, summary: "No fue posible extraer contenido legible del sitio.", signals: [] };
  return summarizeWebsiteText(url, text, candidate);
}

async function findAdditionalStakeholders(candidate, filters) {
  const domain = candidate.company?.domain;
  if (!domain) return [];
  const titles = buyerPersonaTitles(filters);
  if (config.externalServicesMode === "mock") {
    return titles.slice(0, 2).map((title, index) => ({
      name: ["Patricia Revenue", "Mario Growth"][index],
      title,
      email: `${slug(title)}.${index + 1}@${domain}`,
      linkedin: `https://linkedin.com/in/mock-stakeholder-${index + 1}`,
      reason: "Buyer persona sugerido por ARA para validar oportunidad comercial."
    }));
  }
  const data = await apollo("/contacts/search", compact({
    page: 1,
    per_page: 25,
    q_organization_domains: [domain],
    person_titles: titles,
    include_similar_titles: true,
    contact_email_status: ["verified"]
  }));
  return normalizeStakeholderCandidates(data.people || data.contacts || [], domain)
    .filter(person => person.email?.toLowerCase() !== candidate.email?.toLowerCase())
    .slice(0, 2)
    .map(person => ({
      name: [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email,
      title: person.title,
      email: person.email,
      linkedin: person.linkedin,
      reason: "Rol alineado a buyer personas Freelan/ARA dentro del mismo dominio."
    }));
}

function normalizeStakeholderCandidates(results, domain) {
  return [...new Map(results.map(person => [person.id, person])).values()]
    .map(normalizeCandidate)
    .filter(person => {
      const sameDomain = person.company.domain?.toLowerCase() === domain.toLowerCase();
      return person.emailVerified && person.email && sameDomain;
    });
}

function buildIcpContext(candidate, filters) {
  return [
    "Coincidencia ICP seleccionada por Freelan Revenue Agent",
    `Industria solicitada: ${filters.industry}`,
    `Industria interpretada: ${filters.interpretation.industryKeywords.join(", ")}`,
    `Rol encontrado: ${candidate.title}`,
    `Roles objetivo: ${filters.roles.join(", ")}`,
    `Senales solicitadas: ${filters.interpretation.companyKeywords.join(", ") || "Sin senales adicionales"}`,
    `Brief del usuario: ${filters.adHocBrief || "Sin brief adicional"}`,
    `Motivo: ${filters.interpretation.explanation}`
  ].join("\n");
}

function buildEngagementPrepNote(candidate, filters, intelligence = {}) {
  const company = candidate.company || {};
  const araProfile = getAraKnowledgeProfile();
  const contactName = [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || candidate.contactName || candidate.email;
  const signals = filters.interpretation?.companyKeywords?.length
    ? filters.interpretation.companyKeywords.join(", ")
    : "No se declararon senales adicionales.";
  const evidence = candidate.evidence?.length
    ? candidate.evidence.map(item => item.message || item.code).filter(Boolean).join("; ")
    : "Email laboral, telefono y dominio disponibles segun Discovery.";
  return [
    "Contexto de la empresa",
    `${company.name || candidate.companyName || "Empresa sin nombre"} (${company.domain || candidate.domain || "dominio no disponible"}) opera en el ICP solicitado: ${filters.industry}. Empleados objetivo: ${filters.employeeMin}-${filters.employeeMax}. Pais(es): ${(filters.countries || []).join(", ")}. Senales capturadas: ${signals}. Evidencia ARA: ${evidence}`,
    "",
    "Análisis del sitio web",
    intelligence.website
      ? `${intelligence.website.summary} Señales detectadas: ${intelligence.website.signals.join("; ") || "sin señales específicas"}. Fuente: ${intelligence.website.url}.`
      : "Pendiente: no se pudo analizar el sitio web durante esta preparación.",
    "",
    "Oportunidades potenciales - con base en el research y la propuesta de valor de Freelan.",
    `Lente ARA/Freelan: ${araProfile.corePremise}`,
    `Señales de oportunidad a validar: ${araProfile.opportunitySignals.slice(0, 5).join("; ")}.`,
    `Servicios Freelan potencialmente relevantes: ${araProfile.servicePortfolio.slice(0, 4).join("; ")}.`,
    "",
    "Key Stake Holders",
    `Contacto principal: ${contactName} - ${candidate.title || candidate.jobTitle || "cargo no disponible"} (${candidate.email}).`,
    `Stakeholders sugeridos: ${filters.roles.join(", ")}; Revenue Operations; CRM Owner; Direccion Comercial; Marketing Operations.`,
    ...(intelligence.stakeholders?.length ? intelligence.stakeholders.map(stakeholder =>
      `Stakeholder adicional: ${stakeholder.name} - ${stakeholder.title || "cargo no disponible"} (${stakeholder.email || "email no disponible"}). ${stakeholder.reason}`
    ) : ["Stakeholders adicionales: no se encontraron contactos adicionales alineados a buyer personas en Apollo."]),
    "",
    "Recomendaciones de approach",
    "1. Abrir con una hipotesis concreta ligada al ICP y al rol del contacto.",
    "2. Preguntar por visibilidad de pipeline, adopcion de CRM y fricciones entre marketing y ventas.",
    "3. Conectar la conversacion con sistemas de revenue autonomos sobre HubSpot.",
    "4. Proponer una auditoria corta de procesos comerciales, datos y automatizaciones existentes."
  ].join("\n");
}

function normalizeWebsiteUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function htmlToText(html = "") {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeWebsiteText(url, text, candidate) {
  const sentences = text.split(/(?<=[.!?])\s+/).map(value => value.trim()).filter(Boolean);
  const summary = sentences.slice(0, 2).join(" ").slice(0, 600)
    || `${candidate.company?.name || "La empresa"} tiene presencia web activa.`;
  const normalized = text.toLowerCase();
  const signals = [
    ["crm", "CRM"],
    ["ventas", "ventas"],
    ["marketing", "marketing"],
    ["clientes", "gestión de clientes"],
    ["digital", "transformación digital"],
    ["tecnología", "tecnología"],
    ["automat", "automatización"],
    ["distrib", "distribución"],
    ["retail", "retail"],
    ["salud", "salud"],
    ["software", "software"]
  ].filter(([needle]) => normalized.includes(needle)).map(([, label]) => label);
  return { url, summary, signals: unique(signals).slice(0, 6) };
}

function buyerPersonaTitles(filters = {}) {
  return unique([
    "CEO",
    "Director General",
    "Chief Executive Officer",
    "CMO",
    "Chief Marketing Officer",
    "Director de Marketing",
    "Marketing Director",
    "CIO",
    "CTO",
    "Chief Information Officer",
    "Chief Technology Officer",
    "Director de Tecnologia",
    "Technology Director",
    "Director Comercial",
    "Sales Director",
    "Director de Ventas",
    ...(filters.roles || []),
    ...(filters.interpretation?.roleTitles || [])
  ]).slice(0, 20);
}

function araContactProperties(candidate, filters) {
  return compact({
    ara_managed: "true",
    ara_tenant_id: config.defaultTenantId,
    ara_campaign_id: filters.campaignId,
    ara_run_id: filters.runId,
    ara_lifecycle_status: "HUBSPOT_SYNCED",
    ara_owner_approval_status: "APPROVED",
    ara_source: "APOLLO",
    ara_current_agent: "HUBSPOT_CONNECTOR",
    ara_data_confidence: "80",
    ara_icp_match_context: buildIcpContext(candidate, filters)
  });
}

function araCompanyProperties(candidate, filters) {
  return compact({
    ara_managed: "true",
    ara_tenant_id: config.defaultTenantId,
    ara_campaign_id: filters.campaignId,
    ara_run_id: filters.runId,
    ara_source: "APOLLO",
    ara_current_agent: "HUBSPOT_CONNECTOR",
    ara_icp_match_context: buildIcpContext(candidate, filters),
    ara_company_keywords: candidate.company.keywords?.length ? candidate.company.keywords.join("; ") : undefined
  });
}

export async function ensureHubSpotProperties() {
  assertHubSpotWriteAllowed("hubspot.properties.ensure");
  const created = [];
  for (const spec of hubSpotPropertySpecs()) {
    if (await ensureHubSpotProperty(spec)) created.push(`${spec.objectType}.${spec.name}`);
  }
  return { created: created.length > 0, createdProperties: created };
}

async function ensureHubSpotProperty(spec) {
  try {
    await hubspot(`/crm/v3/properties/${spec.objectType}/${spec.name}`);
    return false;
  } catch (error) {
    if (!error.cause?.message?.startsWith("404")) throw error;
  }
  await hubspot(`/crm/v3/properties/${spec.objectType}`, {
    method: "POST",
    body: JSON.stringify({
      groupName: spec.groupName,
      name: spec.name,
      label: spec.label,
      type: spec.type,
      fieldType: spec.fieldType,
      description: spec.description,
      options: spec.options
    })
  });
  return true;
}

function hubSpotPropertySpecs() {
  const lifecycleOptions = ["DISCOVERED", "RECOMMENDED", "APPROVED", "HUBSPOT_SYNCED", "HUMAN_REVIEW_REQUIRED", "DISQUALIFIED", "ARCHIVED"];
  const approvalOptions = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED", "EXPIRED"];
  const sourceOptions = ["APOLLO", "MANUAL", "IMPORT", "HUBSPOT", "OTHER"];
  const agentOptions = ["DISCOVERY", "DATA_INTELLIGENCE", "ACCOUNT_INTELLIGENCE", "ENGAGEMENT", "HUBSPOT_CONNECTOR", "NONE"];
  const shared = [
    boolProperty("ara_managed", "ARA Managed", "Record is managed by ARA."),
    textProperty("ara_tenant_id", "ARA Tenant ID", "Tenant that owns this ARA record."),
    textProperty("ara_campaign_id", "ARA Campaign ID", "ARA campaign identifier."),
    textProperty("ara_run_id", "ARA Run ID", "ARA run identifier."),
    enumProperty("ara_source", "ARA Source", "Original ARA discovery source.", sourceOptions),
    enumProperty("ara_current_agent", "ARA Current Agent", "Latest ARA agent that processed this record.", agentOptions),
    textareaProperty("ara_icp_match_context", "ARA ICP Match Context", "Context and evidence explaining the ICP match."),
    textareaProperty("ara_company_keywords", "ARA Company Keywords", "Apollo company keywords captured by ARA.")
  ];
  return [
    legacyContactContextProperty(),
    ...forObject("contacts", "contactinformation", [
      ...shared,
      enumProperty("ara_lifecycle_status", "ARA Lifecycle Status", "Current ARA lifecycle status.", lifecycleOptions),
      enumProperty("ara_owner_approval_status", "ARA Owner Approval Status", "Human approval status.", approvalOptions),
      numberProperty("ara_icp_score", "ARA ICP Score", "Company ICP score from ARA."),
      numberProperty("ara_contact_score", "ARA Contact Score", "Contact relevance score from ARA."),
      numberProperty("ara_opportunity_score", "ARA Opportunity Score", "Overall opportunity score from ARA."),
      numberProperty("ara_data_confidence", "ARA Data Confidence", "Confidence in ARA data quality."),
      textareaProperty("ara_engagement_prep_notes", "ARA Engagement Prep Notes", "Structured engagement preparation generated by ARA."),
      textareaProperty("ara_exclusion_reason", "ARA Exclusion Reason", "Reason why ARA excluded or disqualified the record.")
    ]),
    ...forObject("companies", "companyinformation", shared)
  ];
}

function forObject(objectType, groupName, specs) {
  return specs.map(spec => ({ ...spec, objectType, groupName }));
}

function legacyContactContextProperty() {
  return {
    objectType: "contacts",
    groupName: "contactinformation",
    ...textareaProperty(
      "freelan_icp_match_context",
      "Freelan ICP Match Context",
      "Legacy context field kept during the ARA migration."
    )
  };
}

function textProperty(name, label, description) {
  return { name, label, description, type: "string", fieldType: "text" };
}

function textareaProperty(name, label, description) {
  return { name, label, description, type: "string", fieldType: "textarea" };
}

function numberProperty(name, label, description) {
  return { name, label, description, type: "number", fieldType: "number" };
}

function boolProperty(name, label, description) {
  return {
    name,
    label,
    description,
    type: "bool",
    fieldType: "booleancheckbox",
    options: [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" }
    ]
  };
}

function enumProperty(name, label, description, values) {
  return {
    name,
    label,
    description,
    type: "enumeration",
    fieldType: "select",
    options: values.map(value => ({ label: value, value }))
  };
}

export async function verifyHubSpotConnection() {
  try {
    await hubspot("/crm/v3/objects/contacts?limit=1");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      hint: "Use a HubSpot Private App access token beginning with pat- and grant contacts/companies read and write scopes."
    };
  }
}

export async function readHubSpotContactProfiles(contactIds) {
  if (!contactIds.length) return [];
  const properties = [
    "firstname", "lastname", "email", "jobtitle", "company", "city", "state", "country",
    "phone", "hs_whatsapp_phone_number", "hs_linkedin_url", "freelan_icp_match_context",
    "createdate", "lastmodifieddate"
  ];
  const data = await hubspot("/crm/v3/objects/contacts/batch/read", {
    method: "POST",
    body: JSON.stringify({
      inputs: contactIds.map(id => ({ id: String(id) })),
      properties
    })
  });
  return data.results || [];
}
