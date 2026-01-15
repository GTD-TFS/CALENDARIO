/* vacaciones.js — Firestore ONLY (FIX)
   - Pedir: activa selección
   - Confirmar: crea doc en vacationRequests (status pending)
   - Pedidos: alterna Pedidos/Cerrar (cerrar oculta de verdad)
   - Cada pedido: botón ELIMINAR (pending/approved/rejected)
   - SIN orderBy (evita índices). Orden en JS por createdAt desc.
*/

(()=> {
  const $ = (s)=>document.querySelector(s);

  let pedirMode = false;
  let sel = new Set();

  function api(){ return window.AppTurnos; }

  function isSelectable(dateStr){
    const [y,m,d] = dateStr.split("-").map(Number);
    return api().isWorkWeek(new Date(y, m-1, d));
  }

  function datesToES(list){
    return (list || []).map(ds=>{
      const [y,m,d] = String(ds).split("-");
      if (!y || !m || !d) return String(ds);
      return `${d}/${m}/${y}`;
    }).join(", ");
  }

 function clearSelection(){
  sel.forEach(d=>api().markSelected(d,false));
  sel.clear();

  const b = $("#btnConfirmarPedido");
  if (b) b.disabled = true;

  // CLAVE: limpiar también la marca directa en el DOM
  document.querySelectorAll(".reqSel").forEach(el=>el.classList.remove("reqSel"));
}

  function setPedir(on){
    pedirMode = !!on;
    const bar = $("#pedirBar");
    if (bar) bar.hidden = !pedirMode;
    if (!pedirMode) clearSelection();
  }

  function onPick(dateStr, elHit){
  if (!pedirMode || !isSelectable(dateStr)) return;

  const willOn = !sel.has(dateStr);

  if (willOn){
    sel.add(dateStr);
  } else {
    sel.delete(dateStr);
  }

  // Mantén tu vía “oficial”
  api().markSelected(dateStr, willOn);

  // CLAVE: marca también el elemento realmente pulsado (mínimo, sin depender de querySelector)
  if (elHit) elHit.classList.toggle("reqSel", willOn);

  const b = $("#btnConfirmarPedido");
  if (b) b.disabled = !sel.size;
}

  // click en cualquier elemento con data-ymd (mensual y semanal)
  document.addEventListener("click", ev=>{
    const el = ev.target.closest("[data-ymd]");
    if (!el) return;

    // si es semanal y tiene uid, solo permitir seleccionar tu fila
    if (el.dataset.uid && el.dataset.uid !== api().getUserId()) return;

onPick(el.dataset.ymd, el);
  });

  function closePedidos(){
    const panel = $("#panelPedidos");
    if (!panel) return;
    panel.hidden = true;
    panel.style.display = "none";     // fuerza ocultación real
    const b = $("#btnPedidos");
    if (b) b.textContent = "Pedidos";
  }

  async function openPedidos(){
    const panel = $("#panelPedidos");
    if (!panel) return;

    panel.hidden = false;
    panel.style.display = "";         // vuelve a CSS normal
    const b = $("#btnPedidos");
    if (b) b.textContent = "Cerrar";

    panel.innerHTML = `<div class="muted">Cargando…</div>`;

    let snap;
    try{
      snap = await fbDB
        .collection("vacationRequests")
.where("authUid","==",fbAuth.currentUser.uid)
        .get(); // SIN orderBy para evitar índice
    }catch(e){
      panel.innerHTML = `<div class="muted">Error leyendo pedidos.</div>`;
      console.error("VAC_PEDIDOS_READ_ERROR", e);
      return;
    }

    const items = snap.docs
      .map(d=>({ id:d.id, ...d.data() }))
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

    if (!items.length){
      panel.innerHTML = `<div class="muted">No hay pedidos.</div>`;
      return;
    }

    panel.innerHTML = "";

    for (const r of items){
      const box = document.createElement("div");
      box.className = "pedidoItem";

      const st = String(r.status || "pending").toUpperCase();
      const datesES = datesToES(r.dates);
      const created = r.createdAt ? new Date(r.createdAt).toLocaleString("es-ES") : "";

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <strong>${st}</strong>
          <button class="btnDelReq" style="padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit;cursor:pointer">Eliminar</button>
        </div>
        <div class="muted small" style="margin-top:6px">${created}</div>
        <div style="margin-top:8px">${datesES}</div>
      `;

      box.querySelector(".btnDelReq")?.addEventListener("click", async ()=>{
        try{
          await fbDB.collection("vacationRequests").doc(r.id).delete();
          // refrescar lista sin recargar página
          await openPedidos();
        }catch(e){
          console.error("VAC_DELETE_ERROR", e);
          alert("No se pudo eliminar.");
        }
      });

      panel.appendChild(box);
    }
  }

  // --- Botones UI ---
  $("#btnPedir").onclick = ()=>{
  if (window.AppTurnos?.isAdminMode?.()){
    toast("Sal del modo Admin para pedir vacaciones");
    return;
  }
  closePedidos();
  setPedir(!pedirMode);
};

  $("#btnCancelarPedido").onclick = ()=> setPedir(false);

  $("#btnConfirmarPedido").onclick = async ()=>{
    if (!sel.size) return;

    try{
      const u = fbAuth.currentUser;

     await fbDB.collection("vacationRequests").add({
  uid: api().getUserId(),                 // u1..u6
  name: document.querySelector(".brand")?.textContent || api().getUserId(),
  authUid: u?.uid || null,
  dates: [...sel].sort(),
  status: "pending",
  createdAt: Date.now(),
  decidedAt: null,
  decidedBy: null
});

      setPedir(false);
      clearSelection();
      alert("Solicitud enviada");
    }catch(e){
      console.error("VAC_CREATE_ERROR", e);
      alert("Error guardando solicitud");
    }
  };

 $("#btnPedidos").onclick = async ()=>{
  const panel = $("#panelPedidos");
  if (!panel) return;

  const willOpen = panel.hidden;
  if (willOpen) await openPedidos();
  else closePedidos();
};

  // estado inicial
  const pedirBar = $("#pedirBar");
  if (pedirBar) pedirBar.hidden = true;

  const panel = $("#panelPedidos");
  if (panel){
    panel.hidden = true;
    panel.style.display = "none";
  }
})();
function toast(msg){
  let t = document.getElementById("toast");
  if (!t){
    t = document.createElement("div");
    t.id = "toast";
    t.style.cssText = `
      position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
      background:rgba(20,25,40,.95);color:#fff;
      padding:10px 14px;border-radius:12px;
      border:1px solid rgba(255,255,255,.18);
      font-weight:700;z-index:9999;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.style.display="none", 2200);
}