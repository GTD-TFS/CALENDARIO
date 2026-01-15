console.log("APP.JS VERSION 2026-01-14 22:55");
/* app.js — FINAL (V visible)
   - Semana sí / semana no (semana empieza MARTES)
   - Turnos M / T / R / V (V visible)
   - Usuario REAL desde Firebase Auth
   - Lee Firestore schedule/A/days/YYYY-MM-DD (assign map)
   - Admin flag desde users/{uid}.admin
*/

const $ = (s)=>document.querySelector(s);

/* ===== Equipo fijo ===== */
const TEAM = ["u1","u2","u3","u4","u5","u6"];

const USERS = {
  u1: { name: "Javi",   emailPrefix: "javier" },
  u2: { name: "Jose",   emailPrefix: "jose"   }, // ADMIN
  u3: { name: "Tamara", emailPrefix: "tamara" },
  u4: { name: "David",  emailPrefix: "david"  },
  u5: { name: "Sara",   emailPrefix: "sara"   },
  u6: { name: "Tere",   emailPrefix: "tere"   }
};

/* ===== Estado ===== */
let state = {
view: new Date(),   // hoy
  userId: null,
  isAdmin: false,
  adminMode: false,
};

/* ===== Helpers fecha ===== */
function pad2(n){ return String(n).padStart(2,"0"); }
function ymd(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function monthLabel(d){ return d.toLocaleDateString("es-ES",{month:"long",year:"numeric"}); }
function daysInMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0).getDate(); }

/* ===== Usuario desde Auth ===== */
function resolveUserIdFromAuth(){
  const u = fbAuth.currentUser;
  if (!u || !u.email) return null;

  const email = u.email.toLowerCase();
  for (const uid of TEAM){
    if (email.startsWith(USERS[uid].emailPrefix)) return uid;
  }
  return null;
}

/* ===== Firestore read ===== */
async function getAssignForDay(dateStr){
  const snap = await fbDB
    .collection("schedule")
    .doc("A")
    .collection("days")
    .doc(dateStr)
    .get();

  if (!snap.exists) return null;
  return snap.data()?.assign || null; // {u1:"M", ...}
}
async function getAssignRange(startYmd, endYmd){
  const ref = fbDB.collection("schedule").doc("A").collection("days");
  const qs = await ref
    .where(firebase.firestore.FieldPath.documentId(), ">=", startYmd)
    .where(firebase.firestore.FieldPath.documentId(), "<=", endYmd)
    .get();

  const out = {};
  qs.forEach(doc=>{
    const data = doc.data() || {};
    out[doc.id] = data.assign || null;
  });
  return out;
}

async function getAssignRange(startYmd, endYmd){
  const ref = fbDB.collection("schedule").doc("A").collection("days");
  const qs = await ref
    .where(firebase.firestore.FieldPath.documentId(), ">=", startYmd)
    .where(firebase.firestore.FieldPath.documentId(), "<=", endYmd)
    .get();

  const out = {}; // { "YYYY-MM-DD": assignObj }
  qs.forEach(doc=>{
    const data = doc.data() || {};
    out[doc.id] = data.assign || null;
  });
  return out;
}

/* ===== Semana martes ===== */
function startOfTueWeek(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setHours(0,0,0,0);
  const js = d.getDay();
  const iso = js === 0 ? 7 : js;     // 1..7 (lun..dom)
  const offset = iso >= 2 ? iso - 2 : 6; // mar=2 ->0, lun=1 ->6
  d.setDate(d.getDate() - offset);
  return d;
}
function weeksBetween(a,b){
  const ms = 86400000;
  return Math.trunc((b - a) / ms / 7);
}
function isWorkWeek(date){
  const ref = startOfTueWeek(new Date()); // semana actual
  const cur = startOfTueWeek(date);
  return Math.abs(weeksBetween(ref, cur)) % 2 === 1; // esta semana descanso
}

/* ===== Rotación base ===== */
function shiftFor(uid, date){
  const idx = TEAM.indexOf(uid);
  const ws = startOfTueWeek(date);
  const d = Math.round((date - ws)/86400000);
  return ((idx + d) % 6) < 3 ? "M" : "T";
}

/* ===== UI: navegación ===== */
$("#btnPrev")?.addEventListener("click", ()=>{
  state.view = new Date(state.view.getFullYear(), state.view.getMonth()-1, 1);
  renderAll();
});
$("#btnNext")?.addEventListener("click", ()=>{
  state.view = new Date(state.view.getFullYear(), state.view.getMonth()+1, 1);
  renderAll();
});
$("#btnWeekPrev")?.addEventListener("click", ()=>{
  const w = startOfTueWeek(state.view); w.setDate(w.getDate()-7);
  state.view = new Date(w); renderAll();
});
$("#btnWeekNext")?.addEventListener("click", ()=>{
  const w = startOfTueWeek(state.view); w.setDate(w.getDate()+7);
  state.view = new Date(w); renderAll();
});

/* ===== Botón Admin: solo toggle UI ===== */
$("#btnAdmin")?.addEventListener("click", ()=>{
  if (!state.isAdmin) return;

  state.adminMode = !state.adminMode;

  const b = document.getElementById("btnAdmin");
  if (b) b.textContent = state.adminMode ? "Cerrar admin" : "Administrar";

  document.body.classList.toggle("admin-mode", state.adminMode);
});

/* ===== Render ===== */
async function renderAll(){
  const ml = $("#monthLabel");
  if (ml) ml.textContent = monthLabel(state.view);

  // Ambos leen lo mismo (assign), así que los hacemos async para V visible siempre.
  await renderCalendar();
  await renderWeek();
}

/* ===== Helpers de pintado estado ===== */
function normalizeState(st, fallback){
  // admitimos M/T/R/V. Si viene null/undefined/otra cosa -> fallback (normalmente shiftFor)
  if (st === "M" || st === "T" || st === "R" || st === "V") return st;
  return fallback;
}
function clsForState(st){
  if (st === "M") return "m";
  if (st === "T") return "t";
  if (st === "R") return "r";
  if (st === "V") return "v";
  return "off";
}

/* ===== Mensual (Firestore para V/R/M/T) ===== */
async function renderCalendar(){
  const cal = $("#calendar");
  if (!cal) return;
  cal.innerHTML = "";

  const d0 = new Date(state.view.getFullYear(), state.view.getMonth(), 1);
  const blanks = ((d0.getDay()||7) - 1);
  for (let i=0;i<blanks;i++){
    const div = document.createElement("div");
    div.className = "day off";
    cal.appendChild(div);
  }

  const n = daysInMonth(state.view);

  // === 1 sola lectura Firestore para TODO el mes ===
  const y = state.view.getFullYear();
  const m = state.view.getMonth() + 1;
  const start = `${y}-${pad2(m)}-01`;
  const end   = `${y}-${pad2(m)}-${pad2(n)}`;

  let assignsByDay = {};
  try{
    // getAssignRange debe existir (la función que te di antes)
    assignsByDay = await getAssignRange(start, end); // { "YYYY-MM-DD": {u1:"M"...} }
  }catch(e){
    assignsByDay = {};
    console.warn("MONTH_RANGE_READ_FAIL", e);
  }

  for (let day=1; day<=n; day++){
    const date = new Date(y, m-1, day);
    const key = ymd(date);
    const work = isWorkWeek(date);

    const div = document.createElement("div");
    div.className = "day" + (work ? "" : " rest");
    div.dataset.ymd = key;
    div.innerHTML = `<div class="d">${day}</div>`;

    if (!work){
      div.innerHTML += `<div class="restLabel">DESCANSO</div>`;
      cal.appendChild(div);
      continue;
    }

    const assign = assignsByDay[key] || null;

    const list = document.createElement("div");
    list.className = "people";

    for (const uid of TEAM){
      const row = document.createElement("div");
      row.className = "person";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = USERS[uid].name;

      const base = shiftFor(uid, date);
      const st = normalizeState(assign?.[uid], base);

      const tag = document.createElement("div");
      tag.className = "tag " + clsForState(st);
      tag.textContent = st;

      row.appendChild(name);
      row.appendChild(tag);
      list.appendChild(row);
    }

    div.appendChild(list);
    cal.appendChild(div);
  }
}
/* ===== Semanal (Firestore manda, V visible) ===== */
async function renderWeek(){
  const grid = $("#weekGrid"), lab = $("#weekLabel");
  if (!grid || !lab) return;

  const ws = startOfTueWeek(state.view);
  const days = [...Array(7)].map((_,i)=> new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()+i));
  const work = isWorkWeek(days[0]);

lab.textContent =
  `${pad2(days[0].getDate())}/${pad2(days[0].getMonth()+1)}–${pad2(days[6].getDate())}/${pad2(days[6].getMonth()+1)}`;
  let assigns = {};
if (work){
  const start = ymd(days[0]);
  const end   = ymd(days[6]);
  try{
    assigns = await getAssignRange(start, end); // 1 sola lectura
  }catch{
    assigns = {};
  }
}

  grid.innerHTML =
  "<div></div>" +
  ["Mar","Mié","Jue","Vie","Sáb","Dom","Lun"]
    .map((dw,i)=>`<div class="weekHead"><div class="wd">${dw}</div><div class="dn">${days[i].getDate()}</div></div>`)
    .join("");

  for (const uid of TEAM){
    grid.innerHTML += `<div class="weekName">${USERS[uid].name}</div>`;

    for (const d of days){
      const key = ymd(d);

      if (!work){
        grid.innerHTML += `<div class="weekCell off" data-uid="${uid}" data-ymd="${key}">—</div>`;
        continue;
      }

      const base = shiftFor(uid, d);
      const st = normalizeState(assigns[key]?.[uid], base);
      const cls = clsForState(st);

      grid.innerHTML += `<div class="weekCell ${cls}" data-uid="${uid}" data-ymd="${key}">${st}</div>`;
    }
  }
}

/* ===== API pública (vacaciones / admin) ===== */
window.AppTurnos = {
  getUserId: ()=> state.userId,
  isAdmin: ()=> state.isAdmin,
  ymd,
  isWorkWeek,
  startOfTueWeek,

  markSelected: (dateStr, on)=>{ /* ...tu código... */ },

  isAdminMode: ()=> state.adminMode,
  refresh: async ()=> { await renderAll(); },
};

fbAuth.onAuthStateChanged(async (u)=>{
  if (!u) return;

  // RESET DURO de modo admin en cada cambio de sesión
state.adminMode = false;
document.body.classList.remove("admin-mode");

const btn = document.getElementById("btnAdmin");
if (btn){
  btn.textContent = "Administrar";
  btn.hidden = true;          // hasta que confirmemos admin en Firestore
}

  state.userId = resolveUserIdFromAuth();

  const ref = fbDB.collection("users").doc(u.uid);
  let snap;

  try{
    snap = await ref.get({ source: "server" });
  }catch{
    snap = await ref.get();
  }

  // 🔑 SI NO EXISTE, SE CREA AQUÍ
  if (!snap.exists){
    const displayName = document.querySelector(".brand")?.textContent || "";

    await ref.set({
      name: displayName,
      admin: displayName === "Jose"   // 👈 SOLO JOSE ES ADMIN
    });

    state.isAdmin = (displayName === "Jose");
  } else {
    state.isAdmin = snap.data()?.admin === true;
  }

  const b = document.getElementById("btnAdmin");
  if (b) b.hidden = !state.isAdmin;

  console.log("ADMIN_CHECK", {
    userId: state.userId,
    isAdmin: state.isAdmin,
    uid: u.uid
  });

  await renderAll();
});
