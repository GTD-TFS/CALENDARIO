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
    vacations: {}, // vacations[team][YYYY][YYYY-MM-DD] = [uid...]
    requests: []   // solicitudes
  }
};

function pad2(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function ym(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function monthLabel(d){ return d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}); }
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }

/* Semana “empieza” el MARTES: semana = martes..lunes */
function startOfTueWeek(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setHours(0,0,0,0);
  const js = d.getDay(); // 0 dom..6 sáb
  const iso = js === 0 ? 7 : js; // 1 lun..7 dom
  const offsetToTueStart = iso >= 2 ? (iso - 2) : 6; // mar=2 -> 0, lun=1 -> 6
  d.setDate(d.getDate() - offsetToTueStart);
  return d;
}
function weeksBetween(aTueStart, bTueStart){
  const ms = 24*60*60*1000;
  const diffDays = Math.round((bTueStart - aTueStart)/ms);
  return Math.trunc(diffDays / 7);
}

/* Regla del usuario:
   - Esta semana (la actual, según reloj del PC) es descanso.
   - Alterna semana trabajo / semana descanso.
*/
function isWorkWeek(date){
  const ref = startOfTueWeek(new Date());     // semana actual (mar..lun)
  const w0 = startOfTueWeek(date);
  const k = weeksBetween(ref, w0);            // 0 = esta semana
  // k=0 descanso, k=1 trabajo, k=2 descanso...
  return (Math.abs(k) % 2) === 1;
}

/* Vacaciones */
function ensure(obj, k, def){ if (!obj[k]) obj[k] = def; return obj[k]; }
function yearOf(date){ return String(date.getFullYear()); }

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

/* Turnos M/T:
   - En días de trabajo: 3 en M y 3 en T.
   - Rotación diaria simple: el “corte” se desplaza con el día.
*/
function shiftFor(uid, date){
  const idx = TEAM.indexOf(uid);
  if (idx < 0) return "M";
  const weekStart = startOfTueWeek(date);
  const dayOffset = Math.round((date - weekStart) / (24*60*60*1000)); // 0..6
  // corte: 3 + (dayOffset mod 2) => alterna 3/3 pero rota quién cae en M/T
  const cut = 3;
  // rotación: suma dayOffset al índice
  const rot = (idx + dayOffset) % 6;
  return rot < cut ? "M" : "T";
}

/* Storage */
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

/* Requests */
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

/* UI handlers */
$("#teamSelect").addEventListener("change", ()=>{
  state.team = $("#teamSelect").value;
  state.sel.clear();
  renderAll();
});
$("#userSelect").addEventListener("change", ()=>{
  state.userId = $("#userSelect").value;
  state.sel.clear();
  renderAll();
});
$("#adminToggle").addEventListener("change", ()=>{
  state.isAdmin = $("#adminToggle").checked;
  renderRequests();
});

$("#btnPrev").addEventListener("click", ()=>{
  state.view = new Date(state.view.getFullYear(), state.view.getMonth()-1, 1);
  state.sel.clear();
  renderAll();
});
$("#btnNext").addEventListener("click", ()=>{
  state.view = new Date(state.view.getFullYear(), state.view.getMonth()+1, 1);
  state.sel.clear();
  renderAll();
});

$("#btnClearSel").addEventListener("click", ()=>{
  state.sel.clear();
  renderSelected();
  renderCalendar();
});

$("#btnSendRequest").addEventListener("click", ()=>{
  const dates = [...state.sel];
  if (!dates.length) return;

  // bloqueo: no pedir un día en el que YA estás de vacaciones (aprobadas)
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
  renderRequests();
});

/* Botones utilidades */
$("#btnSeed").addEventListener("click", ()=>{
  seedExample();
  renderAll();
});
$("#btnReset").addEventListener("click", ()=>{
  localStorage.removeItem(KEY);
  state.db = { vacations:{}, requests:[] };
  renderAll();
});
$("#btnExport").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify({db:state.db}, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `calendario_local_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
$("#btnImport").addEventListener("click", ()=> $("#fileImport").click());
$("#fileImport").addEventListener("change", async (e)=>{
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

function renderAll(){
  $("#monthLabel").textContent = monthLabel(state.view);
  $("#teamSelect").value = state.team;
  $("#userSelect").value = state.userId;
  $("#adminToggle").checked = state.isAdmin;
  $("#userLabel").textContent = USERS[state.userId].name;

  renderSelected();
  renderCalendar();
  renderRequests();
}

function renderSelected(){
  const arr = [...state.sel].sort();
  $("#selDates").textContent = arr.length ? arr.join(", ") : "—";
  $("#btnSendRequest").disabled = !arr.length;
  $("#btnClearSel").disabled = !arr.length;
}

function renderCalendar(){
  const cal = $("#calendar");
  cal.innerHTML = "";

  const d0 = new Date(state.view.getFullYear(), state.view.getMonth(), 1);
  // blanks Mon..Sun; para alinear con lunes 0, usamos getDay ES manual
  const js = d0.getDay(); // 0 dom
  const iso = js === 0 ? 7 : js; // 1..7
  const blanks = iso - 1; // lunes=1 =>0
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

      // Aun así permitimos selección para solicitar vacaciones si quieres,
      // pero normalmente no tendría sentido. Si quieres bloquearlo, lo quito.
      div.addEventListener("click", ()=>{
        if (state.sel.has(key)) state.sel.delete(key);
        else state.sel.add(key);
        renderSelected();
        renderCalendar();
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
        const sh = shiftFor(uid, date); // "M"|"T"
        tag.className = "tag " + (sh === "M" ? "m" : "t");
        tag.textContent = sh;
      }

      row.appendChild(name);
      row.appendChild(tag);
      list.appendChild(row);
    }

    div.appendChild(list);

    // selección vacaciones (para el usuario actual)
    div.addEventListener("click", ()=>{
      if (state.sel.has(key)) state.sel.delete(key);
      else state.sel.add(key);
      renderSelected();
      renderCalendar();
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

function renderRequests(){
  const wrap = $("#requests");
  wrap.innerHTML = "";

  const teamReq = state.db.requests.filter(r=>r.team===state.team);

  $("#adminInfo").textContent = state.isAdmin
    ? "Modo admin activo: puedes aprobar/denegar."
    : "Activa “Admin” para aprobar/denegar.";

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
        renderRequests();
      });
      btns.appendChild(b3);
    }

    wrap.appendChild(box);
  }
}

/* Ejemplo: mete alguna solicitud y alguna vacación aprobada */
function seedExample(){
  const team = "A";
  const y = state.view.getFullYear();
  const m = pad2(state.view.getMonth()+1);

  // vacaciones aprobadas demo
  addVacation(team, `${y}-${m}-10`, "u2");
  addVacation(team, `${y}-${m}-11`, "u2");
  addVacation(team, `${y}-${m}-15`, "u6");

  // solicitud pendiente demo
  createRequest(team, "u1", [`${y}-${m}-20`, `${y}-${m}-21`]);
}

load();
renderAll();