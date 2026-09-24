import test from "node:test";
import assert from "node:assert/strict";
import { discoverProspects, loadSavedRecords, peoplePayload, savedCompany, savedPerson } from "../src/prospect-discovery.js";
import { normalizeCandidate } from "../src/clients.js";
import { researchGoogleContext } from "../src/google-context.js";

const filters = { industry: "Pharma", countries: ["Francia"], employeeMin: 50, employeeMax: 5000, roles: ["CIO"], quantity: 3, interpretation: { industryKeywords: ["Pharmaceuticals"], roleTitles: ["CIO"], seniorities: ["CXO"], contactLocations: ["UK"], excludedTitles: ["Assistant"] } };
const person = (id, name, extra = {}) => ({ id, first_name: "Jean", last_name_obfuscated: "D***", title: "CIO", organization: { id: `org-${id}`, name, primary_domain: `${id}.example` }, ...extra });

test("global discovery checks only returned candidates against saved Apollo and HubSpot records", async () => {
  const calls = [], researched = [];
  const apollo = async (path, body) => {
    calls.push({ path, body });
    if (path === "/accounts/search") return { accounts: body.q_keywords === "saved-apollo.example" ? [{ name: "Saved Apollo", domain: "saved-apollo.example" }] : [] };
    assert.equal(path, "/mixed_people/api_search");
    return { total_entries: 7, people: [person("saved-person", "Different", { is_saved: true }), person("saved-apollo", "Saved Apollo"), person("saved-hs", "Saved HS"), person("saved-contact", "New Contact", { linkedin_url: "https://linkedin.com/in/saved" }), person("new", "New Pharma", { linkedin_url: "https://linkedin.com/in/new" }), person("new", "New Pharma"), person("assistant", "New Other", { title: "Assistant CIO" })] };
  };
  const hubspot = async (path, options) => {
    const filter = JSON.parse(options.body).filterGroups[0].filters[0];
    if (path.includes("companies/search")) return { results: filter.value === "saved-hs.example" ? [{ id: "1" }] : [] };
    return { results: filter.value === "https://linkedin.com/in/saved" ? [{ id: "2" }] : [] };
  };
  const result = await discoverProspects(filters, { apollo, hubspot, normalizeCandidate, context: async candidate => { researched.push(candidate.apolloId); return { status: "available", text: "Source-based context", sources: [] }; } });
  assert.deepEqual(result.candidates.map(c => c.apolloId), ["new"]);
  assert.deepEqual(researched, ["new"]);
  assert.equal(result.candidates[0].email, null);
  assert.equal(result.candidates[0].namePartial, true);
  assert.equal(result.candidates[0].discoveryOnly, true);
  assert.equal(result.stats.companiesExcluded, 3);
  assert.equal(result.stats.contactsExcluded, 1);
  const search = calls.find(call => call.path === "/mixed_people/api_search").body;
  assert.deepEqual(search.organization_locations, ["France"]);
  assert.deepEqual(search.person_locations, ["United Kingdom"]);
  assert.deepEqual(search.person_seniorities, ["c_suite"]);
  assert.equal(search.include_similar_titles, false);
  assert.equal(search.q_keywords, "Pharmaceuticals");
  assert.equal(search.not_organization_websites_list, undefined);
  assert.ok(!calls.some(call => call.path === "/contacts/search"));
  assert.equal(calls.filter(call => call.path === "/accounts/search").length, 6);
});

test("exclusion lookup follows every Apollo and HubSpot page, normalizes domains, and uses contact IDs", async () => {
  const pages = [];
  const apollo = async (path, body) => {
    if (path === "/accounts/search") return { accounts: [], pagination: { total_entries: 0 } };
    pages.push(body.page);
    return body.page === 1 ? { contacts: Array.from({ length: 100 }, (_, i) => ({ person_id: `${i}` })), pagination: { total_entries: 101 } } : { contacts: [{ person_id: "last-person" }], pagination: { total_entries: 101 } };
  };
  const hsPages = [];
  const hubspot = async path => {
    if (path.includes("/contacts?")) return { results: [] };
    hsPages.push(path);
    return path.includes("after=next") ? { results: [{ properties: { name: "Last Company", domain: "https://WWW.Example.com/path" } }] } : { results: [], paging: { next: { after: "next" } } };
  };
  const index = await loadSavedRecords({ apollo, hubspot });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(hsPages.length, 2);
  assert.equal(savedPerson({ id: "last-person" }, index), true);
  assert.equal(savedCompany({ domain: "example.com" }, index), true);
});

test("failed or incomplete exclusion never falls back to unfiltered discovery", async () => {
  let discoveryCalls = 0;
  const apollo = async path => {
    if (path === "/accounts/search") return { accounts: [] };
    discoveryCalls++;
    return { people: [person("candidate", "Candidate")] };
  };
  await assert.rejects(discoverProspects(filters, { apollo, hubspot: async () => { throw new Error("403"); }, normalizeCandidate, context: async () => ({}) }), error => error.code === "EXCLUSION_CHECK_FAILED");
  assert.equal(discoveryCalls, 1);
  await assert.rejects(loadSavedRecords({ apollo: async path => ({ [path.includes("contacts") ? "contacts" : "accounts"]: [] }), hubspot: async () => { throw new Error("403"); } }), /403/);
});

test("discovery paginates after rejected records and reports bounded partial searches", async () => {
  let count = 0;
  const apollo = async path => {
    if (path === "/contacts/search") return { contacts: [] };
    if (path === "/accounts/search") return { accounts: [] };
    count++;
    return { total_entries: 900, people: [person(`person-${count}`, "New Pharma", { is_saved: true })] };
  };
  const result = await discoverProspects(filters, { apollo, hubspot: async () => ({ results: [] }), normalizeCandidate, context: async () => ({}), maxRequests: 2 });
  assert.equal(count, 2);
  assert.equal(result.stats.truncated, true);
  assert.equal(result.candidates.length, 0);
});

test("Serper uses public company identity for masked contacts, sanitizes URLs, and preserves source text", async () => {
  let request;
  const result = await researchGoogleContext({ firstName: "Jean", lastName: "D***", namePartial: true, company: { name: "New Pharma", domain: "new.example" } }, { apiKey: "test-secret", fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ organic: [{ title: "Expansion", link: "https://new.example/news", snippet: "New factory announced", date: "2026-09-01" }, { title: "Bad", link: "javascript:alert(1)", snippet: "Bad" }] }) };
  } });
  assert.equal(request.url, "https://google.serper.dev/search");
  assert.equal(request.options.headers["X-API-KEY"], "test-secret");
  assert.ok(!JSON.parse(request.options.body).q.includes("D***"));
  assert.equal(result.sources.length, 1);
  assert.match(result.text, /New factory announced/);
  assert.ok(!JSON.stringify(result).includes("test-secret"));
});

test("Serper failure or missing key is explicit and does not lose a candidate", async () => {
  const candidate = { company: { name: "New Pharma" } };
  assert.equal((await researchGoogleContext(candidate)).status, "not_configured");
  assert.equal((await researchGoogleContext(candidate, { apiKey: "test", fetchImpl: async () => { throw new Error("timeout"); } })).status, "unavailable");
});
