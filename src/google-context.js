export function safeSourceUrl(value) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; }
}

export async function researchGoogleContext(candidate, { apiKey, fetchImpl = fetch } = {}) {
  const checkedAt = new Date().toISOString();
  if (!apiKey) return { status: "not_configured", text: "Contexto Google no disponible: falta configurar Serper.", sources: [], checkedAt };
  // Redacted Apollo names are not reliable search identities; use company context instead.
  const company = candidate.company?.name || candidate.company?.domain;
  if (!company) return { status: "no_identity", text: "Sin empresa identificable para consultar Google.", sources: [], checkedAt };
  const identity = candidate.namePartial ? "" : [candidate.firstName, candidate.lastName].filter(Boolean).join(" ");
  const clean = value => String(value || "").replace(/["\r\n]/g, " ").slice(0, 150);
  const query = `${identity ? `"${clean(identity)}" ` : ""}"${clean(company)}" ${clean(candidate.company?.domain)} noticias estrategia tecnologia`;
  try {
    const response = await fetchImpl("https://google.serper.dev/search", {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({ q: query, num: 5, hl: "es" }), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error("Serper unavailable");
    const data = await response.json();
    if (!Array.isArray(data.organic)) throw new Error("Invalid Serper response");
    const sources = data.organic.slice(0, 5).map(item => ({ title: String(item.title || "").slice(0, 250), url: safeSourceUrl(item.link), snippet: String(item.snippet || "").slice(0, 900), date: String(item.date || "").slice(0, 80) })).filter(item => item.url && item.snippet);
    return {
      status: sources.length ? "available" : "empty", checkedAt, query, sources,
      text: sources.length ? `${identity ? "Contexto de contacto y empresa" : "Contexto de empresa (nombre del contacto parcialmente oculto por Apollo)"}. Fragmentos de Google; confirmar identidad y vigencia en las fuentes.\n\n${sources.map((item, i) => `[${i + 1}] ${item.title}${item.date ? ` (${item.date})` : ""}\n${item.snippet}`).join("\n\n")}` : "Google no devolvio contexto relevante para esta identidad."
    };
  } catch {
    return { status: "unavailable", checkedAt, text: "No se pudo consultar Google en este intento. El prospecto permanece disponible.", sources: [] };
  }
}
