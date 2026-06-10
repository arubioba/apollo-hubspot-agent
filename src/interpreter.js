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
  required: ["industryKeywords", "roleTitles", "seniorities", "companyKeywords", "contactLocations", "excludedTitles", "explanation", "relaxation"]
};

export async function interpretFilters(input) {
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
        "Use the free-text brief to propose useful company keywords, contact locations, exclusions and seniorities.",
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
