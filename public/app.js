let run;
let selectedRoles = [];
let sessionToken = sessionStorage.getItem("araSessionToken") || "";
let operatorEmail = sessionStorage.getItem("araOperatorEmail") || "";

const $ = selector => document.querySelector(selector);
const feed = $("#operator-feed");
const form = $("#campaign-form");
const loginModal = $("#login-modal");
const loginForm = $("#login-form");
const actions = {
  session: $("#session-button"),
  newRun: $("#new-run"),
  approveSearch: $("#approve-search"),
  editFilters: $("#edit-filters"),
  preview: $("#run-preview"),
  import: $("#run-import")
};

const agents = [
  ["orchestrator", "Revenue Orchestrator", "Coordina run, contexto y handoffs."],
  ["discovery", "Discovery Agent", "Interpreta ICP y busca candidatos en Apollo."],
  ["data", "Data Intelligence", "Normaliza, puntua y genera evidencia."],
  ["account", "Account Intelligence", "Prepara contexto de empresa y dominio."],
  ["hubspot", "HubSpot Sync", "Ejecuta preview o escritura controlada."],
  ["engagement", "Engagement Prep", "Deja listo el contexto de prospeccion."]
];

async function boot() {
  setSystem("Starting", "Inicializando consola ARA.");
  renderTimeline("orchestrator", []);
  bindEvents();
  updateSessionButton();
  if (!sessionToken) {
    clearFeed();
    addFeed("Revenue Orchestrator", "Antes de iniciar, valida tu usuario Freelan.");
    setSystem("Needs login", "Inicia sesion para activar la consola.");
    showLogin();
    return;
  }
  await startRun();
  setSystem("Ready", "Consola lista para configurar una campana.");
}

async function startRun() {
  clearFeed();
  $("#candidate-table").innerHTML = emptyRow("Sin candidatos todavia. Configura un ICP y ejecuta Discovery.");
  $("#candidate-summary").innerHTML = "";
  $("#report").textContent = "Aun no hay ejecuciones.";
  $("#interpretation-panel").hidden = true;
  actions.preview.disabled = true;
  actions.import.disabled = true;
  const data = await call("/api/runs");
  run = data.run;
  selectedRoles = [];
  $("#run-id").textContent = shortId(run.id);
  $("#phase-pill").textContent = readablePhase(run.phase);
  $("#role-options").innerHTML = data.suggestedRoles.map(role => `<option value="${escapeHtml(role)}">`).join("");
  $("#campaign-form").reset();
  $("#min").value = 50;
  $("#max").value = 5000;
  $("#countries").value = "Mexico, Colombia";
  $("#quantity").value = 50;
  renderRoles();
  addFeed("Revenue Orchestrator", "Nuevo run creado. ARA esta esperando el ICP, roles y brief ad-hoc.");
}

function bindEvents() {
  actions.session.onclick = () => {
    if (sessionToken) return logout();
    showLogin();
  };
  loginForm.onsubmit = event => {
    event.preventDefault();
    login().catch(showLoginError);
  };
  actions.newRun.onclick = () => startRun().catch(showError);
  actions.editFilters.onclick = () => {
    $("#interpretation-panel").hidden = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    addFeed("Revenue Orchestrator", "Filtros desbloqueados. Ajusta el ICP y vuelve a interpretar.");
  };
  actions.approveSearch.onclick = () => search().catch(showError);
  actions.preview.onclick = () => preview().catch(showError);
  actions.import.onclick = () => finalImport().catch(showError);
  $("#role-search").onchange = event => {
    const role = event.target.value.trim();
    if (role && selectedRoles.length < 3 && !selectedRoles.includes(role)) selectedRoles.push(role);
    event.target.value = "";
    renderRoles();
  };
  form.onsubmit = event => {
    event.preventDefault();
    analyze().catch(showError);
  };
}

async function analyze() {
  await ensureRun();
  const body = readFilters();
  setSystem("Analyzing", "Discovery Agent esta interpretando el ICP.");
  renderTimeline("discovery", ["orchestrator"]);
  addFeed("Discovery Agent", "Estoy traduciendo industria, roles y brief a filtros compatibles con Apollo.");
  const data = await call(`/api/runs/${run.id}/analyze`, body);
  run = data.run;
  $("#phase-pill").textContent = readablePhase(run.phase);
  renderInterpretation(data.interpretation);
  $("#interpretation-panel").hidden = false;
  addFeed("Data Intelligence", data.interpretation.explanation);
  setSystem("Review", "Valida el plan antes de consumir Apollo.");
}

async function search() {
  await ensureRun();
  setSystem("Searching", "Discovery Agent esta consultando Apollo.");
  renderTimeline("data", ["orchestrator", "discovery"]);
  addFeed("Discovery Agent", "Busqueda aprobada. Ejecutando Apollo con email verificado, telefono valido y dominio de empresa.");
  const data = await call(`/api/runs/${run.id}/approve-roles`);
  run = data.run;
  $("#phase-pill").textContent = readablePhase(run.phase);
  if (!run.candidates.length) {
    renderTimeline("discovery", ["orchestrator"]);
    addFeed("Discovery Agent", `No encontre candidatos elegibles.\n${data.relaxationProposal?.explanation || "Sugiero relajar filtros opcionales."}`);
    $("#candidate-table").innerHTML = emptyRow("No hubo candidatos con los filtros actuales.");
    setSystem("Needs input", "Ajusta o relaja filtros.");
    return;
  }
  addFeed("Data Intelligence", `Normalice ${run.candidates.length} candidatos y los guarde en Candidate Inbox.`);
  await loadCandidates();
  actions.preview.disabled = false;
  actions.import.disabled = false;
  renderTimeline("hubspot", ["orchestrator", "discovery", "data", "account"]);
  setSystem("Candidates ready", "Revisa candidatos antes de sincronizar.");
}

async function preview() {
  await ensureRun();
  setSystem("Preview", "HubSpot Sync esta preparando prueba controlada.");
  renderTimeline("hubspot", ["orchestrator", "discovery", "data", "account"]);
  const data = await call(`/api/runs/${run.id}/test`);
  run = data.run;
  $("#phase-pill").textContent = readablePhase(run.phase);
  renderReport("Preview de 5", data.message, run.testResults);
  addFeed("HubSpot Sync", data.message);
}

async function finalImport(code) {
  await ensureRun();
  setSystem("Sync", "HubSpot Sync esta preparando la importacion.");
  const data = await call(`/api/runs/${run.id}/import`, { approvalCode: code });
  if (data.requiresApprovalCode) {
    const approvalCode = prompt(data.message);
    if (!approvalCode) return;
    return finalImport(approvalCode);
  }
  run = data.run;
  $("#phase-pill").textContent = readablePhase(run.phase);
  renderReport("Importacion", data.message, run.finalResults);
  addFeed("HubSpot Sync", data.message);
  renderTimeline("engagement", ["orchestrator", "discovery", "data", "account", "hubspot"]);
  setSystem("Complete", "Run terminado. Revisa reporte y HubSpot.");
}

async function loadCandidates() {
  await ensureRun();
  let data = await call(`/api/candidates?run_id=${encodeURIComponent(run.id)}&page_size=25`, {}, "GET");
  if (!data.candidates?.length) data = await call(`/api/import-runs/${run.id}/candidates?page_size=25`, {}, "GET");
  renderCandidateSummary(data);
  renderCandidates(data.candidates || []);
}

async function ensureRun() {
  if (run?.id) return run;
  addFeed("Revenue Orchestrator", "No habia un run activo. Estoy creando uno nuevo antes de continuar.");
  await startRun();
  if (!run?.id) throw new Error("No pude inicializar un run. Verifica el token y reintenta.");
  return run;
}

function readFilters() {
  return {
    industry: $("#industry").value.trim(),
    employeeMin: Number($("#min").value),
    employeeMax: Number($("#max").value),
    countries: $("#countries").value.split(",").map(value => value.trim()).filter(Boolean),
    quantity: Number($("#quantity").value),
    roles: selectedRoles,
    adHocBrief: $("#ad-hoc").value.trim()
  };
}

function renderRoles() {
  $("#selected-roles").innerHTML = selectedRoles.map((role, index) =>
    `<span class="chip">${escapeHtml(role)} <button type="button" data-remove="${index}" aria-label="Quitar ${escapeHtml(role)}">x</button></span>`
  ).join("");
  document.querySelectorAll("[data-remove]").forEach(button => {
    button.onclick = () => {
      selectedRoles.splice(Number(button.dataset.remove), 1);
      renderRoles();
    };
  });
}

function renderInterpretation(value) {
  $("#interpretation").innerHTML = [
    insight("Industria y similares", value.industryKeywords),
    insight("Titulos equivalentes", value.roleTitles),
    insight("Seniorities", value.seniorities.length ? value.seniorities : ["Sin filtro adicional"]),
    insight("Senales comerciales", value.companyKeywords.length ? value.companyKeywords : ["Se guardaran como contexto, no como filtro duro"]),
    insight("Exclusiones", value.excludedTitles.length ? value.excludedTitles : ["Ninguna"]),
    `<div class="insight full"><strong>Recomendacion de relajacion</strong>${escapeHtml(value.relaxation?.explanation || "Mantener filtros actuales.")}</div>`
  ].join("");
}

function insight(label, values) {
  return `<div class="insight"><strong>${escapeHtml(label)}</strong>${escapeHtml(values.join(", "))}</div>`;
}

function renderCandidateSummary(data) {
  const items = data.candidates || [];
  const recommended = items.filter(item => item.lifecycle_status === "RECOMMENDED").length;
  const pending = items.filter(item => item.approval_status === "PENDING").length;
  $("#candidate-summary").innerHTML = [
    metric("Candidatos", data.pagination?.total ?? items.length),
    metric("Recomendados", recommended),
    metric("Pendientes", pending),
    metric("Run", shortId(run.id))
  ].join("");
}

function renderCandidates(items) {
  if (!items.length) {
    $("#candidate-table").innerHTML = emptyRow("No hay candidatos disponibles para este run.");
    return;
  }
  $("#candidate-table").innerHTML = items.map(candidate => {
    const evidence = (candidate.evidence || []).slice(0, 2).map(item => item.message || item.code).filter(Boolean).join("; ");
    return `<tr>
      <td><span class="candidate-name">${escapeHtml(candidate.name || "Sin nombre")}</span><span class="candidate-meta">${escapeHtml(candidate.email || "")}</span></td>
      <td>${escapeHtml(candidate.company || "")}<span class="candidate-meta">${escapeHtml(candidate.title || "")}</span></td>
      <td><span class="score">${escapeHtml(candidate.opportunity_score ?? candidate.icp_score ?? "-")}</span></td>
      <td>${escapeHtml(candidate.lifecycle_status || candidate.status || "candidate")}<span class="candidate-meta">${escapeHtml(candidate.approval_status || "")}</span></td>
      <td>${escapeHtml(evidence || candidate.recommendation || "Sin evidencia visible")}</td>
      <td>${escapeHtml(candidate.next_action || "commercial_approval")}</td>
    </tr>`;
  }).join("");
}

function renderTimeline(active, done = []) {
  document.querySelectorAll(".agent").forEach(button => {
    button.classList.toggle("active", button.dataset.agent === active);
  });
  $("#timeline").innerHTML = agents.map(([key, name, detail]) => {
    const status = key === active ? "active" : done.includes(key) ? "done" : "";
    return `<li class="${status}"><span></span><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(detail)}</small></div></li>`;
  }).join("");
}

function renderReport(title, message, results = {}) {
  const successful = results.successful || [];
  const failed = results.failed || [];
  $("#report").innerHTML = `<strong>${escapeHtml(title)}</strong>
    <pre>${escapeHtml(message)}

Exitosos: ${successful.length}
Fallidos: ${failed.length}
${failed.map(item => `${item.email}: ${item.error}`).join("\n")}</pre>`;
}

function addFeed(agent, text, type = "info") {
  feed.insertAdjacentHTML("afterbegin", `<div class="feed-entry ${type}"><strong>${escapeHtml(agent)}</strong>\n${escapeHtml(text)}</div>`);
}

function clearFeed() {
  feed.innerHTML = "";
}

function showError(error) {
  const correlation = error.correlationId ? `\nCorrelation ID: ${error.correlationId}` : "";
  addFeed("ARA", `${error.message}${correlation}`, "error");
  setSystem("Attention", "Revisa el mensaje de error.");
}

async function call(path, body = {}, method = "POST") {
  if (!sessionToken) throw new Error("Inicia sesion para activar la consola.");
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", "X-ARA-Session-Token": sessionToken },
    body: method === "GET" ? undefined : JSON.stringify(body)
  });
  const data = await safeJson(response);
  if (!response.ok) {
    const message = data.error?.message || "No se pudo completar la operacion.";
    const error = new Error(message);
    error.code = data.error?.code;
    error.correlationId = data.correlation_id || data.correlationId;
    if (response.status === 401) {
      clearSession();
      showLogin();
      error.message = "Sesion invalida o expirada. Inicia sesion y reintenta.";
    }
    throw error;
  }
  return data;
}

async function login() {
  const email = $("#login-email").value.trim().toLowerCase();
  const password = $("#login-password").value;
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await safeJson(response);
  if (!response.ok) {
    const error = new Error(data.error?.message || "No se pudo iniciar sesion.");
    error.correlationId = data.correlation_id || data.correlationId;
    throw error;
  }
  sessionToken = data.session.token;
  operatorEmail = data.session.operator_email;
  sessionStorage.setItem("araSessionToken", sessionToken);
  sessionStorage.setItem("araOperatorEmail", operatorEmail);
  $("#login-password").value = "";
  hideLogin();
  updateSessionButton();
  await startRun();
  setSystem("Ready", "Consola lista para configurar una campana.");
}

function logout() {
  clearSession();
  run = undefined;
  clearFeed();
  $("#run-id").textContent = "No run";
  $("#phase-pill").textContent = "Idle";
  $("#candidate-table").innerHTML = emptyRow("Inicia sesion para activar la consola.");
  $("#candidate-summary").innerHTML = "";
  $("#report").textContent = "Aun no hay ejecuciones.";
  actions.preview.disabled = true;
  actions.import.disabled = true;
  updateSessionButton();
  setSystem("Needs login", "Inicia sesion para activar la consola.");
  showLogin();
}

function clearSession() {
  sessionToken = "";
  operatorEmail = "";
  sessionStorage.removeItem("araSessionToken");
  sessionStorage.removeItem("araOperatorEmail");
}

function showLogin() {
  $("#login-email").value = operatorEmail || "antonio.rubio@freelan.com.mx";
  $("#login-error").textContent = "";
  loginModal.hidden = false;
  setTimeout(() => $("#login-password").focus(), 0);
}

function hideLogin() {
  loginModal.hidden = true;
}

function showLoginError(error) {
  const correlation = error.correlationId ? ` Correlation ID: ${error.correlationId}` : "";
  $("#login-error").textContent = `${error.message}${correlation}`;
}

function updateSessionButton() {
  actions.session.textContent = sessionToken ? "Cerrar sesion" : "Iniciar sesion";
  actions.session.classList.toggle("ready", Boolean(sessionToken));
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: "Respuesta no valida del servidor." } };
  }
}

function metric(label, value) {
  return `<div class="metric"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function emptyRow(message) {
  return `<tr><td colspan="6" class="empty">${escapeHtml(message)}</td></tr>`;
}

function setSystem(state, detail) {
  $("#system-state").textContent = state;
  $("#system-detail").textContent = detail;
}

function readablePhase(value = "idle") {
  return value.replaceAll("_", " ");
}

function shortId(value = "") {
  return value ? value.slice(0, 8) : "No run";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

boot().catch(showError);
