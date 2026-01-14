/* app.js — versión completa con vista semanal (móvil) + mensual (desktop)
   Reglas:
   - Semana sí / semana no
   - La semana empieza MARTES (mar..lun)
   - Esta semana (según reloj del dispositivo) es DESCANSO
   - En días de trabajo: 6 personas con M/T/V (colores via CSS)
   - Vacaciones por solicitudes + aprobación admin (localStorage)
*/

const $ = (s)=>document.querySelector(s);

/* 6 miembros fijos del equipo */
const TEAM = ["u1","u2","u3","u4","u5","u6"];

const USERS = {
  u1: { uid:"u1", name:"Javier" },
  u2: { uid:"u2", name:"Marta"  },
  u3: { uid:"u3", name:"Sergio" },
  u4: { uid:"u4", name:"Lucía"  },
  u5: { uid:"u5", name:"Pablo"  },
  u6: { uid:"u6", name:"Noelia" }
};

const KEY = "CAL_LOCAL_V2";

let state = {
  team: "A",
  view: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  userId: "u1",
  isAdmin: false,
  sel: new Set(),
  db: {
    // vacations[team][YYYY][YYYY-MM-DD] = [uid...]
    vacations: {},
    // requests: [{id,team,uid,dates,status,createdAt,decidedAt,decidedBy}]
    requests: []
  }
};

/* ===== Helpers fecha ===== */
function pad2(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function ym(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function monthLabel(d){ return d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}); }
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }

/* ===== Semana empieza en MARTES (mar..lun) ===== */
function startOfTueWeek(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setHours(0,0,0,0);
  const js = d.getDay(); // 0 dom..6 sáb
  const iso = js === 0 ? 7 : js; // 1 lun..7 dom
  const offsetToTueStart = iso >= 2 ? (iso - 2) : 6; // mar=2 ->0, lun=1 ->6
  d.setDate(d.getDate() - offsetToTueStart);
  return d; // martes
}
function weeksBetween(aTueStart, bTueStart){
  const ms = 24*60*60*1000;
  const diffDays = Math.round((bTueStart - aTueStart)/ms);
  return Math.trunc(diffDays / 7);
}

/* Regla:
   - Esta semana (martes->lunes actual) es DESCANSO
   - Alterna: descanso, trabajo, descanso, trabajo...
*/
function isWorkWeek(date){
  const ref = startOfTueWeek(new Date()); // semana actual
  const w0 = startOfTueWeek(date);
  const k = weeksBetween(ref, w0); // 0 = esta semana
  return (Math.abs(k) % 2) === 1; // 0 descanso, 1 trabajo
}

/* ===== Vacaciones ===== */
function ensure(obj, k, def){
  if (!obj[k]) obj[k] = def;
  return obj[k];
}
function getVacMap(team, year){
  const t = ensure(state.db.vacations, team, {});
  return ensure(t, String(year), {});
}
function addVacation(team, dateStr, uid){
  const v = getVacMap(team, dateStr.slice(0,4));
  const arr = ensure(v, dateStr, []);
  if (!arr.includes(uid)) arr.push(uid);
  save();
}
function removeVacation(team, dateStr, uid){
  const v = getVacMap(team, dateStr.slice(0,4));
  const arr = v[dateStr] || [];
  const out = arr.filter(x=>x!==uid);
  if (out.length) v[dateStr] = out;
  else delete v[dateStr];
  save();
}

/* ===== Turnos M/T (rotación simple) =====
   - Días de trabajo: 3 en M, 3 en T
   - Rotación diaria: se desplaza con el día dentro de la semana mar..lun
*/
function shiftFor(uid, date){
  const idx = TEAM.indexOf(uid);
  if (idx < 0) return "M";
  const weekStart = startOfTueWeek(date);
  const dayOffset = Math.round((date - weekStart) / (24*60*60*1000)); // 0..6
  const cut = 3;
  const rot = (idx + dayOffset) % 6;
  return rot < cut ? "M" : "T";
}

/* ===== Storage ===== */
function load(){
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  try{
    const parsed = JSON.parse(raw);
    if (parsed && parsed.db) state.db = parsed.db;
  }catch{}
}
function save(){
  localStorage.setItem(KEY, JSON.stringify({ db: state.db }));
}

/* ===== Requests ===== */
function createRequest(team, uid, dates){
  const id = "r_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36);
  state.db.requests.unshift({
    id, team, uid,
    dates: [...dates].sort(),
    status: "pending",
    createdAt: Date.now(),
    decidedAt: null,
    decidedBy: null
  });
  save();
}
function decideRequest(id, status){
  const r = state.db.requests.find(x=>x.id===id);
  if (!r) return null;
  r.status = status;
  r.decidedAt = Date.now();
  r.decidedBy = state.userId;
  save();
  return r;
}

/* ===== UI handlers ===== */
const elTeam = $("#teamSelect");
const elUser = $("#userSelect");
const elAdmin = $("#adminToggle");

if (elTeam){
  elTeam.addEventListener("change", ()=>{
    state.team = elTeam.value;
    state.sel.clear();
    renderAll();
  });
}

if (elUser){
  elUser.addEventListener("change", ()=>{
    state.userId = elUser.value;
    state.sel.clear();
    renderAll();
  });
}

if (elAdmin){
  elAdmin.addEventListener("change", ()=>{
    state.isAdmin = elAdmin.checked;
    renderRequests();
  });
}

const btnPrev = $("#btnPrev");
const btnNext = $("#btnNext");

if (btnPrev){
  btnPrev.addEventListener("click", ()=>{
    state.view = new Date(state.view.getFullYear(), state.view.getMonth()-1, 1);
    state.sel.clear();
    renderAll();
  });
}
if (btnNext){
  btnNext.addEventListener("click", ()=>{
    state.view = new Date(state.view.getFullYear(), state.view.getMonth()+1, 1);
    state.sel.clear();
    renderAll();
  });
}

/* Navegación semanal (móvil) */
const btnWeekPrev = $("#btnWeekPrev");
const btnWeekNext = $("#btnWeekNext");

if (btnWeekPrev){
  btnWeekPrev.addEventListener("click", ()=>{
    const ws = startOfTueWeek(state.view);
    ws.setDate(ws.getDate() - 7);
    state.view = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate());
    state.sel.clear();
    renderAll();
  });
}
if (btnWeekNext){
  btnWeekNext.addEventListener("click", ()=>{
    const ws = startOfTueWeek(state.view);
    ws.setDate(ws.getDate() + 7);
    state.view = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate());
    state.sel.clear();
    renderAll();
  });
}

const btnClearSel = $("#btnClearSel");
if (btnClearSel){
  btnClearSel.addEventListener("click", ()=>{
    state.sel.clear();
    renderSelected();
    renderCalendar();
    renderWeek();
  });
}

const btnSend = $("#btnSendRequest");
if (btnSend){
  btnSend.addEventListener("click", ()=>{
    const dates = [...state.sel];
    if (!dates.length) return;

    // bloquear: no pedir un día en el que YA estás de vacaciones (aprobadas)
    const vac = getVacMap(state.team, new Date().getFullYear());
    for (const d of dates){
      if ((vac[d] || []).includes(state.userId)){
        alert(`Ya estás de vacaciones el ${d}.`);
        return;
      }
    }

    createRequest(state.team, state.userId, dates);
    state.sel.clear();
    renderSelected();
    renderCalendar();
    renderWeek();
    renderRequests();
  });
}

/* Utilidades */
const btnSeed = $("#btnSeed");
const btnReset = $("#btnReset");
const btnExport = $("#btnExport");
const btnImport = $("#btnImport");
const fileImport = $("#fileImport");

if (btnSeed){
  btnSeed.addEventListener("click", ()=>{
    seedExample();
    renderAll();
  });
}
if (btnReset){
  btnReset.addEventListener("click", ()=>{
    localStorage.removeItem(KEY);
    state.db = { vacations:{}, requests:[] };
    renderAll();
  });
}
if (btnExport){
  btnExport.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify({db:state.db}, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario_local_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
if (btnImport && fileImport){
  btnImport.addEventListener("click", ()=> fileImport.click());
  fileImport.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;
    try{
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      if (!parsed?.db) throw new Error("Formato inválido");
      state.db = parsed.db;
      save();
      renderAll();
    }catch(err){
      alert("No se pudo importar: " + err.message);
    }finally{
      e.target.value = "";
    }
  });
}

/* ===== Render ===== */
function renderAll(){
  const ml = $("#monthLabel");
  if (ml) ml.textContent = monthLabel(state.view);

  if (elTeam) elTeam.value = state.team;
  if (elUser) elUser.value = state.userId;
  if (elAdmin) elAdmin.checked = state.isAdmin;

  const ul = $("#userLabel");
  if (ul) ul.textContent = USERS[state.userId]?.name || state.userId;

  renderSelected();
  renderCalendar(); // desktop
  renderWeek();     // móvil
  renderRequests();
}

function renderSelected(){
  const arr = [...state.sel].sort();
  const out = $("#selDates");
  if (out) out.textContent = arr.length ? arr.join(", ") : "—";

  if (btnSend) btnSend.disabled = !arr.length;
  if (btnClearSel) btnClearSel.disabled = !arr.length;
}

/* === Mensual (desktop) ===
   Mantiene tu idea original: cada día de trabajo muestra los 6 miembros con M/T/V.
   En móvil se oculta por CSS, pero se renderiza igual (no rompe nada).
*/
function renderCalendar(){
  const cal = $("#calendar");
  if (!cal) return;
  cal.innerHTML = "";

  const d0 = new Date(state.view.getFullYear(), state.view.getMonth(), 1);
  // blanks (lunes=0)
  const js = d0.getDay(); // 0 dom
  const iso = js === 0 ? 7 : js; // 1..7
  const blanks = iso - 1;

  for (let i=0;i<blanks;i++){
    const div = document.createElement("div");
    div.className = "day off";
    cal.appendChild(div);
  }

  const vacYear = getVacMap(state.team, state.view.getFullYear());
  const n = daysInMonth(state.view);

  for (let day=1; day<=n; day++){
    const date = new Date(state.view.getFullYear(), state.view.getMonth(), day);
    const key = ymd(date);

    const work = isWorkWeek(date);

    const div = document.createElement("div");
    div.className = "day" + (work ? "" : " rest");
    div.innerHTML = `<div class="d">${day}</div>`;

    if (!work){
      const lbl = document.createElement("div");
      lbl.className = "restLabel";
      lbl.textContent = "DESCANSO";
      div.appendChild(lbl);

      // Selección (solo para el usuario actual) — en descanso la bloqueamos por defecto
      // Si quieres permitir solicitar también en descanso, quita este return.
      div.addEventListener("click", ()=>{ /* bloqueado */ });

      cal.appendChild(div);
      continue;
    }

    // Día de trabajo: lista 6 miembros con M/T/V
    const list = document.createElement("div");
    list.className = "people";

    for (const uid of TEAM){
      const row = document.createElement("div");
      row.className = "person";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = USERS[uid].name;

      const tag = document.createElement("div");
      const isVac = (vacYear[key] || []).includes(uid);

      if (isVac){
        tag.className = "tag v";
        tag.textContent = "V";
      } else {
        const sh = shiftFor(uid, date);
        tag.className = "tag " + (sh === "M" ? "m" : "t");
        tag.textContent = sh;
      }

      row.appendChild(name);
      row.appendChild(tag);
      list.appendChild(row);
    }

    div.appendChild(list);

    // Selección de vacaciones: clic en el día (para el usuario actual)
    div.addEventListener("click", ()=>{
      if (state.sel.has(key)) state.sel.delete(key);
      else state.sel.add(key);
      renderSelected();
      renderCalendar();
      renderWeek();
    });

    if (state.sel.has(key)){
      const b = document.createElement("div");
      b.className = "badges";
      const s = document.createElement("span");
      s.className = "badge sel";
      s.textContent = "✓";
      b.appendChild(s);
      div.appendChild(b);
    }

    cal.appendChild(div);
  }
}

/* === Semanal (móvil): filas=personas, columnas=Mar..Lun ===
   - Se selecciona tocando SOLO en tu fila (uid==userId) y solo si es semana de trabajo.
*/
function renderWeek(){
  const grid = $("#weekGrid");
  const lab = $("#weekLabel");
  if (!grid || !lab) return;

  const ws = startOfTueWeek(state.view); // martes
  const days = [];
  for (let i=0;i<7;i++){
    const d = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate());
    d.setDate(d.getDate()+i);
    days.push(d);
  }

  const fmt = (d)=> `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
  const work = isWorkWeek(days[0]);
  lab.textContent = `${fmt(days[0])}–${fmt(days[6])} · ${work ? "TRABAJO" : "DESCANSO"}`;

  const vacYear = getVacMap(state.team, days[0].getFullYear());

  grid.innerHTML = "";

  // Cabecera
  const blank = document.createElement("div");
  blank.className = "weekHead";
  blank.textContent = "";
  grid.appendChild(blank);

  const dow = ["Mar","Mié","Jue","Vie","Sáb","Dom","Lun"];
  for (let i=0;i<7;i++){
    const h = document.createElement("div");
    h.className = "weekHead";
    h.textContent = `${dow[i]} ${days[i].getDate()}`;
    grid.appendChild(h);
  }

  // Filas por persona
  for (const uid of TEAM){
    const nm = document.createElement("div");
    nm.className = "weekName";
    nm.textContent = USERS[uid].name;
    grid.appendChild(nm);

    for (let i=0;i<7;i++){
      const d = days[i];
      const key = ymd(d);

      let val = "—";
      let cls = "weekCell off";

      if (isWorkWeek(d)){
        const isVac = (vacYear[key] || []).includes(uid);
        if (isVac){
          val = "V";
          cls = "weekCell v";
        } else {
          const sh = shiftFor(uid, d);
          val = sh;
          cls = "weekCell " + (sh === "M" ? "m" : "t");
        }
      }

      const cell = document.createElement("div");
      cell.className = cls;
      cell.textContent = val;

      cell.addEventListener("click", ()=>{
        // Solo seleccionar en tu fila
        if (uid !== state.userId) return;
        // Bloquear selección si no es semana de trabajo
        if (!isWorkWeek(d)) return;

        if (state.sel.has(key)) state.sel.delete(key);
        else state.sel.add(key);

        renderSelected();
        renderWeek();

        // Si está visible el mensual (desktop), refrescarlo también
        if (window.matchMedia("(min-width: 821px)").matches) renderCalendar();
      });

      grid.appendChild(cell);
    }
  }
}

/* ===== Solicitudes ===== */
function renderRequests(){
  const wrap = $("#requests");
  const info = $("#adminInfo");
  if (!wrap) return;

  wrap.innerHTML = "";

  const teamReq = state.db.requests.filter(r=>r.team===state.team);

  if (info){
    info.textContent = state.isAdmin
      ? "Modo admin activo: puedes aprobar/denegar."
      : "Activa “Admin” para aprobar/denegar.";
  }

  for (const r of teamReq){
    const box = document.createElement("div");
    box.className = "req";

    const who = USERS[r.uid]?.name || r.uid;
    const st = r.status.toUpperCase();

    box.innerHTML = `
      <h4>${st} · ${who}</h4>
      <div class="meta">${r.dates.join(", ")}</div>
      <div class="btns"></div>
    `;

    const btns = box.querySelector(".btns");

    if (r.status === "pending" && state.isAdmin){
      const b1 = document.createElement("button");
      b1.textContent = "Aprobar";
      b1.addEventListener("click", ()=>{
        const rr = decideRequest(r.id, "approved");
        for (const d of rr.dates) addVacation(rr.team, d, rr.uid);
        renderCalendar();
        renderWeek();
        renderRequests();
      });

      const b2 = document.createElement("button");
      b2.textContent = "Denegar";
      b2.addEventListener("click", ()=>{
        decideRequest(r.id, "rejected");
        renderRequests();
      });

      btns.appendChild(b1);
      btns.appendChild(b2);
    }

    if (r.status === "approved" && state.isAdmin){
      const b3 = document.createElement("button");
      b3.textContent = "Revocar (test)";
      b3.addEventListener("click", ()=>{
        r.status = "rejected";
        r.decidedAt = Date.now();
        r.decidedBy = state.userId;
        for (const d of r.dates) removeVacation(r.team, d, r.uid);
        save();
        renderCalendar();
        renderWeek();
        renderRequests();
      });
      btns.appendChild(b3);
    }

    wrap.appendChild(box);
  }
}

/* ===== Demo ===== */
function seedExample(){
  const team = "A";
  const y = state.view.getFullYear();
  const m = pad2(state.view.getMonth()+1);

  // Vacaciones aprobadas demo
  addVacation(team, `${y}-${m}-10`, "u2");
  addVacation(team, `${y}-${m}-11`, "u2");
  addVacation(team, `${y}-${m}-15`, "u6");

  // Solicitud pendiente demo
  createRequest(team, "u1", [`${y}-${m}-20`, `${y}-${m}-21`]);
}

/* ===== Boot ===== */
load();
renderAll();
