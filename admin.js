/* admin.js — administración (solo admin)
   - Usa AppTurnos.isAdminMode() real (no texto del botón)
   - Click en celda semanal => rota M/T/R/V y guarda en Firestore
   - Panel vacaciones: Pendientes + Aprobadas (con eliminar)
*/

(()=> {
  const $ = (s)=>document.querySelector(s);

  function api(){
    if (!window.AppTurnos) throw new Error("AppTurnos no disponible (carga app.js antes)");
    return window.AppTurnos;
  }
  function isAdmin(){
    try { return api().isAdmin() === true; } catch { return false; }
  }
  function isAdminMode(){
    try { return api().isAdminMode() === true; } catch { return false; }
  }

  // ---------- helpers ----------
  function fmtES(dateStr){ // YYYY-MM-DD => DD/MM/YYYY
    const [y,m,d] = String(dateStr).split("-");
    return `${d}/${m}/${y}`;
  }
  function fmtESList(dates){
    return (dates||[]).map(fmtES).join(", ");
  }

  function ensureAdminPanel(){
    let panel = $("#adminPanel");
    if (panel) return panel;

    const vacCard = $("#vacacionesCard");
    if (!vacCard) return null;

    panel = document.createElement("div");
    panel.id = "adminPanel";
    panel.hidden = true;
    panel.style.marginTop = "14px";
    panel.style.paddingTop = "12px";
    panel.style.borderTop = "1px solid rgba(255,255,255,.12)";

    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
        <div style="font-weight:800">Administración</div>
        <div style="display:flex;gap:8px">
          <button id="btnAdminRefresh">Actualizar</button>
          <button id="btnAdminApproved">Aprobadas</button>
        </div>
      </div>

      <div id="adminViewPending">
        <div class="muted small" style="margin-bottom:10px">Vacaciones pendientes</div>
        <div id="adminVacPending"></div>
      </div>

      <div id="adminViewApproved" hidden>
        <div class="muted small" style="margin-bottom:10px">Vacaciones aprobadas</div>
        <div id="adminVacApproved"></div>
      </div>
    `;

    vacCard.appendChild(panel);

    $("#btnAdminRefresh")?.addEventListener("click", async ()=>{
      if (panel.hidden) return;
      await renderVacLists(); // render ambas vistas
    });

    $("#btnAdminApproved")?.addEventListener("click", async ()=>{
      if (panel.hidden) return;
      const a = $("#adminViewApproved");
      const p = $("#adminViewPending");
      const openApproved = a.hidden === false;

      // toggle
      a.hidden = openApproved;
      p.hidden = !openApproved;

      // texto botón
      $("#btnAdminApproved").textContent = openApproved ? "Aprobadas" : "Pendientes";

      await renderVacLists();
    });

    return panel;
  }

  // ---------- Turnos: M/T/R/V ----------
  function nextShift(st){
    // rota M -> T -> R -> V -> M
    if (st === "M") return "T";
    if (st === "T") return "R";
    if (st === "R") return "V";
    return "M";
  }

  async function setAssign(dateStr, uid, st){
    await fbDB
      .collection("schedule")
      .doc("A")
      .collection("days")
      .doc(dateStr)
      .set({ assign: { [uid]: st } }, { merge: true });
  }

  // Click en celda semanal (solo admin + adminMode ON)
  document.addEventListener("click", async (ev)=>{
    const cell = ev.target.closest("#weekGrid .weekCell");
    if (!cell) return;

    if (!isAdmin()) return;
    if (!isAdminMode()) return;

    const uid = cell.dataset?.uid;
    const dateStr = cell.dataset?.ymd;
    if (!uid || !dateStr) return;

    // Solo semanas de trabajo
    const [y,m,d] = dateStr.split("-").map(Number);
    if (!api().isWorkWeek(new Date(y, m-1, d))) return;

    const current = (cell.textContent || "").trim() || "M";
    const st = nextShift(current);

    // UI inmediata
    cell.textContent = st;
    cell.classList.remove("m","t","r","v","off");
    cell.classList.add(st==="M"?"m":st==="T"?"t":st==="R"?"r":"v");

    try{
      await setAssign(dateStr, uid, st);
      await api().refresh(); // refresco instantáneo del resto (mensual/semanal)
    }catch(e){
      console.error("ADMIN_SET_ASSIGN_ERROR", e);
    }
  });

  // ---------- Vacaciones admin ----------
 async function listRequestsByStatus(status){
  const qs = await fbDB.collection("vacationRequests")
    .where("status","==",status)
    .get();

  const arr = qs.docs.map(d=>({ id:d.id, ...d.data() }));
  // ordenar en cliente (desc)
  arr.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return arr;
}

  async function updateRequest(id, patch){
    await fbDB.collection("vacationRequests").doc(id).set(patch, { merge:true });
  }

  async function deleteRequest(id){
    await fbDB.collection("vacationRequests").doc(id).delete();
  }

  async function applyVacationAssign(uid, dates){
    for (const dateStr of (dates||[])){
      await fbDB.collection("schedule").doc("A").collection("days").doc(dateStr)
        .set({ assign: { [uid]:"V" } }, { merge:true });
    }
  }

  async function renderVacLists(){
    const panel = ensureAdminPanel();
    if (!panel) return;

    // según vista
    const pendingWrap = $("#adminVacPending");
    const approvedWrap = $("#adminVacApproved");
    if (!pendingWrap || !approvedWrap) return;

    // pending
    pendingWrap.innerHTML = `<div class="muted">Cargando…</div>`;
    approvedWrap.innerHTML = `<div class="muted">Cargando…</div>`;

    let pending = [];
    let approved = [];
    try{
      pending  = await listRequestsByStatus("pending");
      approved = await listRequestsByStatus("approved");
    }catch(e){
      console.error("ADMIN_VAC_READ_ERROR", e);
      pendingWrap.innerHTML = `<div class="muted">Error leyendo solicitudes.</div>`;
      approvedWrap.innerHTML = `<div class="muted">Error leyendo solicitudes.</div>`;
      return;
    }

    // --- render pending ---
    if (!pending.length){
      pendingWrap.innerHTML = `<div class="muted">No hay pendientes.</div>`;
    } else {
      pendingWrap.innerHTML = "";
      for (const r of pending){
const who = (r.name || (window.USERS && window.USERS[r.uid]?.name) || r.uid || "—");
        const created = r.createdAt ? new Date(r.createdAt).toLocaleString("es-ES") : "";

        const box = document.createElement("div");
        box.className = "pedidoItem";
        box.style.marginBottom = "10px";

        box.innerHTML = `
          <div class="top">
            <div><strong>PENDIENTE</strong> · ${who}</div>
            <div class="muted small">${created}</div>
          </div>
          <div class="dates">${fmtESList(r.dates)}</div>
          <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
        `;

        const actions = box.querySelector(".actions");

        const btnOk = document.createElement("button");
        btnOk.textContent = "Aprobar";
        btnOk.addEventListener("click", async ()=>{
          try{
            await updateRequest(r.id, {
              status:"approved",
              decidedAt: Date.now(),
              decidedBy: api().getUserId()
            });
            await applyVacationAssign(r.uid, r.dates||[]);
            await api().refresh();     // CLAVE: V aparece al momento
            await renderVacLists();
          }catch(e){
            console.error("ADMIN_APPROVE_ERROR", e);
          }
        });

        const btnNo = document.createElement("button");
        btnNo.textContent = "Rechazar";
        btnNo.addEventListener("click", async ()=>{
          try{
            await updateRequest(r.id, {
              status:"rejected",
              decidedAt: Date.now(),
              decidedBy: api().getUserId()
            });
            await renderVacLists();
          }catch(e){
            console.error("ADMIN_REJECT_ERROR", e);
          }
        });

        const btnDel = document.createElement("button");
        btnDel.textContent = "Eliminar";
        btnDel.addEventListener("click", async ()=>{
          try{
            await deleteRequest(r.id);
            await renderVacLists();
          }catch(e){
            console.error("ADMIN_DELETE_ERROR", e);
          }
        });

        actions.appendChild(btnOk);
        actions.appendChild(btnNo);
        actions.appendChild(btnDel);

        pendingWrap.appendChild(box);
      }
    }

    // --- render approved ---
    if (!approved.length){
      approvedWrap.innerHTML = `<div class="muted">No hay aprobadas.</div>`;
    } else {
      approvedWrap.innerHTML = "";
      for (const r of approved){
const who = (r.name || (window.USERS && window.USERS[r.uid]?.name) || r.uid || "—");
        const created = r.createdAt ? new Date(r.createdAt).toLocaleString("es-ES") : "";
        const decided = r.decidedAt ? new Date(r.decidedAt).toLocaleString("es-ES") : "";

        const box = document.createElement("div");
        box.className = "pedidoItem";
        box.style.marginBottom = "10px";

        box.innerHTML = `
          <div class="top">
            <div><strong>APROBADA</strong> · ${who}</div>
            <div class="muted small">Solic: ${created}${decided ? " · Dec: "+decided : ""}</div>
          </div>
          <div class="dates">${fmtESList(r.dates)}</div>
          <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
        `;

        const actions = box.querySelector(".actions");

        const btnDel = document.createElement("button");
        btnDel.textContent = "Eliminar";
        btnDel.addEventListener("click", async ()=>{
          try{
            await deleteRequest(r.id);
            await renderVacLists();
          }catch(e){
            console.error("ADMIN_DELETE_APPROVED_ERROR", e);
          }
        });

        actions.appendChild(btnDel);
        approvedWrap.appendChild(box);
      }
    }
  }

  // Mostrar/ocultar panel admin cuando pulsas el botón (solo admin)
  $("#btnAdmin")?.addEventListener("click", async ()=>{
    const panel = ensureAdminPanel();
    if (!panel) return;

    if (!isAdmin()){
      panel.hidden = true;
      return;
    }

    const open = isAdminMode(); // refleja state.adminMode real
    panel.hidden = !open;

    if (open) await renderVacLists();
  });

})();