import { config } from "./config.js";
import { ApolloError, ApolloRateLimitError, HubSpotError, ValidationError } from "./errors.js";
import { logger } from "./logger.js";
import { assertHubSpotWriteAllowed, isPreviewMode } from "./write-guard.js";

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
  const results = [];
  for (const industry of getIndustrySearchTerms(filters)) {
    const payload = buildApolloSearchPayload(filters, industry, page);
    logger.info("apollo.search.payload", "Apollo search payload prepared from current console filters.", {
      page,
      industry,
      keys: Object.keys(payload)
    });
    const data = await apollo("/contacts/search", payload);
    results.push(...(data.people || data.contacts || []));
  }
  return [...new Map(results.map(person => [person.id, person])).values()].map(person => {
    const candidate = normalizeCandidate(person);
    logger.debug("candidate.normalized", "Candidate normalized.", { email: candidate.email, apolloId: candidate.apolloId });
    return candidate;
  })
    .filter(c => {
      const accepted = c.emailVerified && c.company.domain && c.validPhones.some(isMappableContactPhone);
      if (!accepted) logger.debug("candidate.rejected", "Candidate rejected by eligibility filters.", { email: c.email, title: c.title });
      return accepted;
    });
}

export function buildApolloSearchPayload(filters, industry, page = 1) {
  return compact({
    page,
    per_page: 100,
    organization_num_employees_ranges: [`${filters.employeeMin},${filters.employeeMax}`],
    organization_locations: filters.countries,
    q_organization_keyword_tags: [industry],
    person_titles: filters.interpretation?.roleTitles || filters.roles,
    person_seniorities: filters.interpretation?.seniorities || [],
    include_similar_titles: true,
    contact_email_status: ["verified"]
  });
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
      keywords: organization.keywords || []
    }
  };
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
  return { name, label, description, type: "bool", fieldType: "booleancheckbox" };
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
