import { readFileSync } from "node:fs";

const fallbackProfile = {
  corePremise: "Companies do not grow through isolated activities. They grow through well-designed revenue systems.",
  opportunitySignals: [
    "manual sales or marketing processes",
    "fragmented CRM, marketing automation, sales, or analytics stack",
    "limited visibility into pipeline or customer journey",
    "CRM adoption, governance, or data quality issues",
    "marketing-to-sales handoff friction"
  ],
  servicePortfolio: [
    "Revenue Architecture Assessment",
    "Revenue System Design",
    "Autonomous Revenue Implementation",
    "Continuous Revenue Optimization"
  ]
};

let cachedProfile;

export function getAraKnowledgeProfile() {
  if (cachedProfile) return cachedProfile;
  try {
    const markdown = readFileSync(new URL("../knowledge/ara/freelan-ara-profile.md", import.meta.url), "utf8");
    cachedProfile = {
      corePremise: extractParagraph(markdown, "Core Premise") || fallbackProfile.corePremise,
      opportunitySignals: extractBullets(markdown, "Opportunity Signals"),
      servicePortfolio: extractBullets(markdown, "Service Portfolio")
    };
  } catch {
    cachedProfile = fallbackProfile;
  }
  return cachedProfile;
}

function extractParagraph(markdown, heading) {
  const section = extractSection(markdown, heading);
  return section.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("-"))[0] || "";
}

function extractBullets(markdown, heading) {
  const bullets = extractSection(markdown, heading)
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.startsWith("-"))
    .map(line => line.replace(/^-\s*/, ""));
  return bullets.length ? bullets : fallbackProfile.opportunitySignals;
}

function extractSection(markdown, heading) {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  return markdown.match(pattern)?.[1]?.trim() || "";
}
