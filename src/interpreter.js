import { config } from "./config.js";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    industryKeywords: { type: "array", items: { type: "string" }, maxItems: 8 },
    roleTitles: { type: "array", items: { type: "string" }, maxItems: 18 },
    seniorities: { type: "array", items: { type: "string" }, maxItems: 5 },
    companyKeywords: { type: "array", items: { type: "string" }, maxItems: 8 },
    contactLocations: { type: "array", items: { type: "string" }, maxItems: 8 },
    excludedCompanyKeywords: { type: "array", items: { type: "string" }, maxItems: 8 },
    excludedTitles: { type: "array", items: { type: "string" }, maxItems: 8 },
    explanation: { type: "string" },
    relaxation: {
      type: "object",
      additionalProperties: false,
      properties: {
        removeCompanyKeywords: { type: "boolean" },
        broadenEmployeeRangeByPercent: { type: "integer", minimum: 0, maximum: 50 },
        removeContactLocations: { type: "boolean" },
        explanation: { type: "string" }
      },
      required: ["removeCompanyKeywords", "broadenEmployeeRangeByPercent", "removeContactLocations", "explanation"]
    }
  },
  required: ["industryKeywords", "roleTitles", "seniorities", "companyKeywords", "contactLocations", "excludedCompanyKeywords", "excludedTitles", "explanation", "relaxation"]
};

export async function interpretFilters(input) {
  if (config.externalServicesMode === "mock") return mockInterpretation(input);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      instructions: [
        "You translate a B2B ICP into Apollo-compatible search terms.",
        "Expand one industry into close Apollo taxonomy synonyms, always including the canonical English industry terms plus useful Spanish equivalents, not unrelated adjacent markets.",
        "Expand each selected role into Spanish and English title variants; roles are OR alternatives.",
        "Use the free-text brief to propose useful company keywords as non-filtering context, plus contact locations, explicit company/technology exclusions, explicit title exclusions and seniorities.",
        "If the user says companies should not have or should not use a technology, put that technology in excludedCompanyKeywords, not in companyKeywords and not in excludedTitles.",
        "excludedTitles is only for contact job titles or roles to avoid, never for products, CRMs, technologies, industries, or company attributes.",
        "Company keywords are signals to document and prioritize, never mandatory Apollo search filters.",
        "Do not loosen mandatory verified email, valid phone, company domain, countries, or employee range.",
        "When optional company keywords or contact locations might overconstrain results, recommend removing them first in relaxation. Return concise Spanish explanation."
      ].join(" "),
      input: JSON.stringify(input),
      text: { format: { type: "json_schema", name: "apollo_filter_interpretation", strict: true, schema } }
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${body.error?.message || "interpretation failed"}`);
  const text = body.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI did not return a filter interpretation.");
  return JSON.parse(text);
}

export async function verifyOpenAIConnection() {
  if (config.externalServicesMode === "mock") {
    return { ok: true, model: config.openaiModel, mode: "mock" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${config.openaiKey}` }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${body.error?.message || "authentication failed"}`);
    return { ok: true, model: config.openaiModel };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function mockInterpretation(input) {
  const industryKeywords = unique([
    input.industry,
    ...expandIndustry(input.industry),
    ...extractQuotedTerms(input.adHocBrief)
  ]).slice(0, 8);
  const roleTitles = unique((input.selectedRoles || []).flatMap(expandRole)).slice(0, 18);
  return {
    industryKeywords,
    roleTitles,
    seniorities: inferSeniorities(roleTitles),
    companyKeywords: extractCompanySignals(input.adHocBrief).slice(0, 8),
    contactLocations: unique(input.countries || []).slice(0, 8),
    excludedCompanyKeywords: extractCompanyExclusions(input.adHocBrief).slice(0, 8),
    excludedTitles: [],
    explanation: "Interpretacion mock generada localmente para staging; no llamo OpenAI real.",
    relaxation: {
      removeCompanyKeywords: false,
      broadenEmployeeRangeByPercent: 20,
      removeContactLocations: Boolean(input.countries?.length),
      explanation: "Si no hay resultados, mantener industria y roles, retirar ubicaciones opcionales de contacto y ampliar rango de empleados."
    }
  };
}

function expandIndustry(industry = "") {
  const value = normalize(industry);
  const dictionary = [
    { match: ["retail", "comercio", "minorista"], terms: ["Retail", "Commerce", "E-commerce", "Consumer Goods", "Tiendas", "Comercio minorista"] },
    { match: ["financ", "banco", "bank", "fintech"], terms: ["Financial Services", "Fintech", "Banking", "Servicios financieros"] },
    { match: ["manufact", "fabric", "industrial"], terms: ["Manufacturing", "Industrial", "Fabricacion", "Manufactura"] },
    { match: ["tecnolog", "software", "saas"], terms: ["Technology", "Software", "SaaS", "Information Technology"] },
    { match: ["farmaceut", "pharma", "salud"], terms: ["Pharmaceuticals", "Healthcare", "Life Sciences", "Farmaceutica"] },
    { match: ["energia", "energy"], terms: ["Energy", "Oil & Energy", "Renewables", "Energia"] },
    { match: ["distrib", "logistic"], terms: ["Distribution", "Logistics", "Wholesale", "Distribucion"] }
  ];
  return dictionary.find(item => item.match.some(term => value.includes(term)))?.terms || [industry];
}

function expandRole(role = "") {
  const value = normalize(role);
  const variants = [role];
  if (/\bcio\b|tecnolog|technology|cto/.test(value)) variants.push("CIO", "CTO", "Director de Tecnologia", "IT Director", "Technology Director");
  if (/marketing|cmo/.test(value)) variants.push("CMO", "Director de Marketing", "Marketing Director", "Head of Marketing");
  if (/sales|ventas|comercial/.test(value)) variants.push("Sales Director", "Director Comercial", "Director de Ventas", "Commercial Director");
  if (/\bceo\b|general/.test(value)) variants.push("CEO", "Director General", "Managing Director");
  return variants;
}

function inferSeniorities(roles) {
  const text = normalize(roles.join(" "));
  const seniorities = [];
  if (/\bceo\b|\bcto\b|\bcio\b|\bcmo\b|chief/.test(text)) seniorities.push("c_suite");
  if (/director|head/.test(text)) seniorities.push("director");
  return seniorities.length ? seniorities : ["director"];
}

function extractCompanySignals(brief = "") {
  const text = String(brief || "");
  const exclusions = new Set(extractCompanyExclusions(text).map(normalize));
  return unique([
    ...extractQuotedTerms(text),
    ...["HubSpot", "CRM", "pipeline", "marketing", "ventas", "automatizacion"].filter(term => normalize(text).includes(normalize(term)))
  ]).filter(term => !exclusions.has(normalize(term)));
}

function extractCompanyExclusions(brief = "") {
  const text = normalize(brief);
  const technologies = ["HubSpot", "Salesforce", "Zoho", "Pipedrive", "CRM"];
  return technologies.filter(term => {
    const normalizedTerm = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b(no|sin|excluir|excluye|evitar|evita|que no tengan|que no usen|no tengan|no usen|no utilicen)\\b[^.。;\\n]{0,50}\\b${normalizedTerm}\\b`).test(text)
      || new RegExp(`\\b${normalizedTerm}\\b[^.。;\\n]{0,30}\\b(excluir|excluye|evitar|evita)\\b`).test(text);
  });
}

function extractQuotedTerms(value = "") {
  return [...String(value).matchAll(/["“”']([^"“”']{2,40})["“”']/g)].map(match => match[1].trim());
}

function unique(items) {
  return [...new Map(items.filter(Boolean).map(item => [normalize(item), String(item).trim()])).values()];
}

function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
