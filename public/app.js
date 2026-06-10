let run;
const chat = document.querySelector("#chat");
const form = document.querySelector("#filters");
const actions = document.querySelector("#actions");

const say = text => chat.insertAdjacentHTML("beforeend", `<div class="msg">${escapeHtml(text)}</div>`);
const call = async (path, body = {}) => {
  const response = await fetch(path, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};
const button = (label, fn) => {
  const el = document.createElement("button"); el.textContent = label; el.onclick = fn; actions.append(el);
};

async function boot() {
  const data = await call("/api/runs");
  run = data.run; say(data.message);
  document.querySelector("#apollo-lists").innerHTML = data.lists
    .map(x => `<option value="${x.id}">${escapeHtml(x.name)}</option>`).join("");
  if (data.listError) say(`Apollo no pudo listar las listas automáticamente. Pega el ID de la lista manualmente. Detalle: ${data.listError}`);
  else if (!data.lists.length) say("Apollo no devolvió listas disponibles. Pega el ID de la lista manualmente.");
  document.querySelector("#roles").innerHTML = data.suggestedRoles.map((x,i) =>
    `<label><input type="checkbox" value="${escapeHtml(x)}" checked> ${escapeHtml(x)}</label>`).join("");
  form.hidden = false;
}

form.onsubmit = async e => {
  e.preventDefault();
  try {
    const body = {
      listId: document.querySelector("#list").value,
      industries: [document.querySelector("#industry1").value, document.querySelector("#industry2").value],
      employeeMin: Number(document.querySelector("#min").value),
      employeeMax: Number(document.querySelector("#max").value),
      countries: document.querySelector("#countries").value.split(",").map(x=>x.trim()).filter(Boolean),
      quantity: Number(document.querySelector("#quantity").value),
      roles: [...document.querySelectorAll("#roles input:checked")].map(x=>x.value)
    };
    const data = await call(`/api/runs/${run.id}/configure`, body);
    run=data.run; form.hidden=true; say(data.message); actions.innerHTML="";
    button("Aprobar roles y buscar candidatos", search);
  } catch(error){ say(`Error: ${error.message}`); }
};

async function search() {
  actions.innerHTML="";
  try {
    const data=await call(`/api/runs/${run.id}/approve-roles`); run=data.run; say(data.message);
    renderCandidates(run.candidates.slice(0,5)); button("Ejecutar prueba de 5", test);
  } catch(error){ say(`Error: ${error.message}`); }
}
async function test() {
  actions.innerHTML="";
  try {
    const data=await call(`/api/runs/${run.id}/test`); run=data.run; say(data.message); renderReport(run.testResults);
    button("Ya verifiqué HubSpot. Continuar importación", () => finalImport());
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
  } catch(error){ say(`Error: ${error.message}`); }
}
function renderCandidates(items){ say(items.map(x=>`${x.firstName} ${x.lastName} | ${x.title} | ${x.email}`).join("\n")); }
function renderReport(r){ say(`Exitosos: ${r.successful?.length||0}\nFallidos: ${r.failed?.length||0}\n${(r.failed||[]).map(x=>`${x.email}: ${x.error}`).join("\n")}`); }
function escapeHtml(s=""){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
boot().catch(e=>say(`No se pudo iniciar: ${e.message}`));
