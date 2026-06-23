let run;
let selectedRoles = [];
let adminToken = sessionStorage.getItem("araAdminToken") || "";
const chat = document.querySelector("#chat");
const form = document.querySelector("#filters");
const actions = document.querySelector("#actions");
const proposal = document.querySelector("#proposal");

const say = text => chat.insertAdjacentHTML("beforeend", `<div class="msg">${escapeHtml(text)}</div>`);
const call = async (path, body = {}, method = "POST") => {
  if (!adminToken) {
    adminToken = prompt("Token interno ARA") || "";
    sessionStorage.setItem("araAdminToken", adminToken);
  }
  const response = await fetch(path, {
    method,
    headers:{"Content-Type":"application/json", "X-ARA-Admin-Token": adminToken},
    body: method === "GET" ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || "No se pudo completar la operacion.";
    const suffix = data.correlation_id ? ` Correlation ID: ${data.correlation_id}` : "";
    const error = new Error(`${message}.${suffix}`);
    error.code = data.error?.code;
    error.correlationId = data.correlation_id;
    throw error;
  }
  return data;
};
const button = (label, fn) => {
  const el = document.createElement("button"); el.textContent = label; el.onclick = fn; actions.append(el);
};

async function boot() {
  chat.innerHTML = ""; actions.innerHTML = ""; proposal.hidden = true;
  const data = await call("/api/runs");
  run = data.run; say(data.message);
  const options = document.querySelector("#role-options");
  options.innerHTML = data.suggestedRoles.map(x => `<option value="${escapeHtml(x)}">`).join("");
  selectedRoles = [];
  renderRoles();
  form.reset();
  document.querySelector("#min").value = 50;
  document.querySelector("#max").value = 5000;
  document.querySelector("#countries").value = "Mexico, Colombia";
  document.querySelector("#quantity").value = 50;
  form.hidden = false;
}

document.querySelector("#role-search").addEventListener("change", event => {
  const role = event.target.value.trim();
  if (role && selectedRoles.length < 3 && !selectedRoles.includes(role)) selectedRoles.push(role);
  event.target.value = "";
  renderRoles();
});

function renderRoles() {
  document.querySelector("#selected-roles").innerHTML = selectedRoles.map((role, index) =>
    `<span class="chip">${escapeHtml(role)} <button type="button" data-remove="${index}">×</button></span>`).join("");
  document.querySelectorAll("[data-remove]").forEach(el => el.onclick = () => {
    selectedRoles.splice(Number(el.dataset.remove), 1); renderRoles();
  });
}

form.onsubmit = async event => {
  event.preventDefault();
  try {
    const body = {
      industry: document.querySelector("#industry").value,
      employeeMin: Number(document.querySelector("#min").value),
      employeeMax: Number(document.querySelector("#max").value),
      countries: document.querySelector("#countries").value.split(",").map(x=>x.trim()).filter(Boolean),
      quantity: Number(document.querySelector("#quantity").value),
      roles: selectedRoles,
      adHocBrief: document.querySelector("#ad-hoc").value
    };
    say("Interpretando industria, roles y parámetros ad-hoc...");
    const data = await call(`/api/runs/${run.id}/analyze`, body);
    run = data.run; form.hidden = true; showProposal(data.interpretation); say(data.message);
  } catch(error) { say(`Error: ${error.message}`); }
};

function showProposal(value) {
  proposal.hidden = false;
  proposal.innerHTML = `
    <h3>Interpretación propuesta</h3>
    <p>${escapeHtml(value.explanation)}</p>
    <p><strong>Industria y similares:</strong> ${escapeHtml(value.industryKeywords.join(", "))}</p>
    <p><strong>Títulos equivalentes:</strong> ${escapeHtml(value.roleTitles.join(", "))}</p>
    <p><strong>Seniorities:</strong> ${escapeHtml(value.seniorities.join(", ") || "Sin filtro adicional")}</p>
    <p><strong>Palabras clave:</strong> ${escapeHtml(value.companyKeywords.join(", ") || "Sin filtro adicional")}</p>
    <p><strong>Exclusiones:</strong> ${escapeHtml(value.excludedTitles.join(", ") || "Ninguna")}</p>`;
  actions.innerHTML = "";
  button("Aprobar interpretación y buscar", search);
  button("Modificar filtros", modify);
  button("Nueva búsqueda", boot);
}

async function search() {
  actions.innerHTML = "";
  try {
    const data = await call(`/api/runs/${run.id}/approve-roles`);
    run = data.run; say(data.message);
    if (!run.candidates.length) {
      say(`Propuesta de relajación: ${data.relaxationProposal?.explanation || "Retirar filtros opcionales."}`);
      button("Aprobar relajación y buscar otra vez", relax);
      button("Modificar filtros", modify);
      return;
    }
    await renderRunCandidates(run.id);
    button("Ejecutar prueba de 5", test);
    button("Modificar filtros", modify);
    button("Nueva búsqueda", boot);
  } catch(error) { say(`Error: ${error.message}`); button("Modificar filtros", modify); }
}

async function relax() {
  actions.innerHTML = "";
  try {
    const data = await call(`/api/runs/${run.id}/relax`);
    run = data.run; say(data.message);
    if (run.candidates.length) { await renderRunCandidates(run.id); button("Ejecutar prueba de 5", test); }
    else { say("La relajación aprobada tampoco encontró candidatos."); button("Modificar filtros", modify); }
    button("Nueva búsqueda", boot);
  } catch(error) { say(`Error: ${error.message}`); }
}

function modify() {
  form.hidden = false; proposal.hidden = true; actions.innerHTML = "";
  say("Modifica los filtros y vuelve a interpretar antes de buscar.");
}

async function test() {
  actions.innerHTML="";
  try {
    const data=await call(`/api/runs/${run.id}/test`); run=data.run; say(data.message); renderReport(run.testResults);
    button("Ya verifiqué HubSpot. Continuar importación", () => finalImport());
    button("Nueva búsqueda", boot);
  } catch(error){ say(`Error: ${error.message}`); }
}
async function finalImport(code) {
  actions.innerHTML="";
  try {
    const data=await call(`/api/runs/${run.id}/import`, {approvalCode:code});
    if(data.requiresApprovalCode) {
      say(data.message);
      const input=document.createElement("input"); input.type="password"; input.placeholder="Código de aprobación"; actions.append(input);
      button("Autorizar importación", ()=>finalImport(input.value)); return;
    }
    run=data.run; say(data.message); renderReport(run.finalResults);
    if(data.missing>0) button("Buscar e integrar faltantes", search);
    button("Nueva búsqueda", boot);
  } catch(error){ say(`Error: ${error.message}`); }
}
async function renderRunCandidates(runId) {
  try {
    const data = await call(`/api/import-runs/${runId}/candidates?page_size=5`, {}, "GET");
    renderCandidates(data.candidates || []);
  } catch(error) {
    say(`No pude cargar candidatos: ${error.message}`);
    renderCandidates(run.candidates.slice(0,5));
  }
}
function renderCandidates(items){ say(items.map(x=>`${x.name || `${x.firstName || ""} ${x.lastName || ""}`.trim()} | ${x.title || ""} | ${x.company?.name || x.company || ""} | ${x.email || ""} | ${x.status || "candidate"}`).join("\n")); }
function renderReport(r){ say(`Exitosos: ${r.successful?.length||0}\nFallidos: ${r.failed?.length||0}\n${(r.failed||[]).map(x=>`${x.email}: ${x.error}`).join("\n")}`); }
function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
boot().catch(e=>say(`No se pudo iniciar: ${e.message}`));
