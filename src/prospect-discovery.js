import { AppError } from "./errors.js";
// Discovery never calls enrichment or creates Apollo/HubSpot records.
export function normalizeDomain(value = "") {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return ""; }
}

const norm = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const countryAliases = { francia: "France", france: "France", mexico: "Mexico", colombia: "Colombia", "reino unido": "United Kingdom", uk: "United Kingdom", "united kingdom": "United Kingdom", espana: "Spain", "estados unidos": "United States" };
export const normalizeLocation = value => countryAliases[norm(value)] || String(value).trim();

async function allApollo(apollo, kind) {
  const rows = [];
  for (let page = 1; page <= 500; page++) {
    const data = await apollo(`/${kind}/search`, { page, per_page: 100 });
    if (!Array.isArray(data[kind])) throw new Error(`No se pudo verificar la lista de ${kind} en Apollo.`);
    rows.push(...data[kind]);
    const total = data.pagination?.total_entries;
    if (Number(total) > 50000) throw new Error(`La exclusion de ${kind} supera el limite de Apollo; no se publicaran candidatos sin comprobar.`);
    if (total != null ? rows.length >= Number(total) : data[kind].length < 100) return rows;
    if (!data[kind].length) throw new Error(`Paginacion incompleta de ${kind} en Apollo.`);
  }
  throw new Error(`No se completo la exclusion de ${kind} en Apollo.`);
}

async function allHubSpot(hubspot, kind, properties) {
  const rows = [], cursors = new Set();
  let after;
  for (let page = 0; page < 1000; page++) {
    const query = new URLSearchParams({ limit: "100", properties: properties.join(",") });
    if (after != null) query.set("after", after);
    const data = await hubspot(`/crm/v3/objects/${kind}?${query}`);
    if (!Array.isArray(data.results)) throw new Error(`No se pudo verificar ${kind} en HubSpot.`);
    rows.push(...data.results);
    after = data.paging?.next?.after;
    if (after == null) return rows;
    if (cursors.has(String(after))) throw new Error("Paginacion repetida en HubSpot; exclusion incompleta.");
    cursors.add(String(after));
  }
  throw new Error("La exclusion de HubSpot excede el limite de lectura; no se publicaran candidatos sin comprobar.");
}

export async function loadSavedRecords({ apollo, hubspot }) {
  const contacts = await allApollo(apollo, "contacts");
  const accounts = await allApollo(apollo, "accounts");
  const hsCompanies = await allHubSpot(hubspot, "companies", ["name", "domain", "hs_additional_domains"]);
  const hsContacts = await allHubSpot(hubspot, "contacts", ["email", "hs_additional_emails", "hs_linkedin_url", "company", "website"]);
  const index = { personIds: new Set(), organizationIds: new Set(), domains: new Set(), companyNames: new Set(), emails: new Set(), linkedins: new Set() };
  const company = item => {
    if (!item) return;
    if (item.organization_id || item.organization?.id) index.organizationIds.add(String(item.organization_id || item.organization.id));
    for (const value of [item.primary_domain, item.domain, item.website_url, item.website, ...(item.hs_additional_domains || "").split(";")]) {
      const domain = normalizeDomain(value);
      if (domain) index.domains.add(domain);
    }
    if (item.name) index.companyNames.add(norm(item.name));
  };
  for (const item of accounts) { company(item); company(item.organization); }
  for (const item of hsCompanies) company(item.properties);
  for (const item of contacts) {
    if (item.person_id) index.personIds.add(String(item.person_id));
    company(item.organization); company(item.account);
    if (item.organization_id) index.organizationIds.add(String(item.organization_id));
    if (item.organization?.id) index.organizationIds.add(String(item.organization.id));
    if (item.organization_name) index.companyNames.add(norm(item.organization_name));
    if (item.email) index.emails.add(item.email.toLowerCase());
    if (item.linkedin_url) index.linkedins.add(item.linkedin_url.toLowerCase().replace(/\/$/, ""));
  }
  for (const { properties: p } of hsContacts) {
    company({ name: p.company, website: p.website });
    for (const email of [p.email, ...(p.hs_additional_emails || "").split(";")].filter(Boolean)) {
      index.emails.add(email.toLowerCase());
      const domain = normalizeDomain(email.split("@")[1]);
      if (domain && !/^(gmail|hotmail|outlook|yahoo|icloud|live)\./.test(domain)) index.domains.add(domain);
    }
    if (p.hs_linkedin_url) index.linkedins.add(p.hs_linkedin_url.toLowerCase().replace(/\/$/, ""));
  }
  index.counts = { apolloContacts: contacts.length, apolloCompanies: accounts.length, hubspotContacts: hsContacts.length, hubspotCompanies: hsCompanies.length };
  return index;
}

export function savedCompany(org, index) {
  return Boolean(index.organizationIds.has(String(org.id || ""))
    || [org.primary_domain, org.domain, org.website_url].some(value => index.domains.has(normalizeDomain(value)))
    || (org.name && index.companyNames.has(norm(org.name))));
}

export function savedPerson(person, index) {
  return Boolean(index.personIds.has(String(person.id || "")) || index.personIds.has(String(person.person_id || ""))
    || person.contact_id || person.is_saved
    || (person.email && index.emails.has(person.email.toLowerCase()))
    || (person.linkedin_url && index.linkedins.has(person.linkedin_url.toLowerCase().replace(/\/$/, ""))));
}

export function peoplePayload(filters, industry, page, savedDomains = []) {
  const seniorities = [...new Set((filters.interpretation?.seniorities || []).map(value => /^(cxo|c-level|executive)$/i.test(value) ? "c_suite" : value))]
    .filter(value => ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior", "entry", "intern"].includes(value));
  return {
    page, per_page: 100, q_keywords: industry,
    ...(savedDomains.length ? { not_organization_websites_list: savedDomains } : {}),
    organization_locations: filters.countries.map(normalizeLocation),
    organization_num_employees_ranges: [`${filters.employeeMin},${filters.employeeMax}`],
    person_titles: filters.interpretation?.roleTitles?.length ? filters.interpretation.roleTitles : filters.roles,
    include_similar_titles: false,
    contact_email_status: ["verified"],
    ...(seniorities.length ? { person_seniorities: seniorities } : {}),
    ...(filters.interpretation?.contactLocations?.length ? { person_locations: filters.interpretation.contactLocations.map(normalizeLocation) } : {})
  };
}

export async function discoverProspects(filters, { apollo, hubspot, normalizeCandidate, context, acceptCandidate = () => true, maxRequests = 60 }) {
  let saved;
  try { saved = await loadSavedRecords({ apollo, hubspot }); }
  catch (cause) {
    throw new AppError("No se pudo completar la exclusion de registros guardados en Apollo y HubSpot. Revisa permisos, disponibilidad y limites de lectura antes de repetir.", { code: "EXCLUSION_CHECK_FAILED", status: 503, cause });
  }
  const stats = { saved: saved.counts, organizationsReceived: 0, companiesExcluded: 0, peopleReceived: 0, contactsExcluded: 0, requests: 0, truncated: false };
  const people = new Map();
  const terms = [...new Set(filters.interpretation?.industryKeywords?.length ? filters.interpretation.industryKeywords : [filters.industry])];
  const target = Math.min(100, filters.quantity);
  outer: for (const term of terms) {
    for (let page = 1; page <= 500; page++) {
      if (stats.requests >= maxRequests) { stats.truncated = true; break outer; }
      stats.requests++;
        const result = await apollo("/mixed_people/api_search", peoplePayload(filters, term, page, [...saved.domains].slice(0, 1000)));
        if (!Array.isArray(result.people)) throw new Error("Respuesta de prospectos de Apollo no reconocida.");
        stats.peopleReceived += result.people.length;
        for (const person of result.people) {
          const org = person.organization;
          if (!person.id || !org?.name) { stats.contactsExcluded++; continue; }
          if (savedCompany(org, saved)) { stats.companiesExcluded++; continue; }
          if (savedPerson(person, saved)) { stats.contactsExcluded++; continue; }
          if ((filters.interpretation?.excludedTitles || []).some(title => norm(person.title).includes(norm(title)))) continue;
          const candidate = normalizeCandidate({ ...person, organization: org });
          if (!acceptCandidate(candidate)) { stats.contactsExcluded++; continue; }
          // A search preview is not an enriched, verified identity. Never invent an email or surname.
          candidate.discoveryOnly = true;
          candidate.email = null;
          candidate.emailVerified = false;
          candidate.lastName = person.last_name || "";
          candidate.namePartial = !person.last_name;
          candidate.exclusionCheckedAt = new Date().toISOString();
          people.set(person.id, candidate);
          if (people.size >= target) break;
        }
        if (people.size >= target) break outer;
        if (!result.people.length || (result.total_entries != null ? page * 100 >= result.total_entries : result.people.length < 100)) break;
    }
  }
  const candidates = [...people.values()];
  for (let offset = 0; offset < candidates.length; offset += 3) {
    await Promise.all(candidates.slice(offset, offset + 3).map(async candidate => {
      candidate.googleContext = await context(candidate);
    }));
  }
  return { candidates, stats };
}
