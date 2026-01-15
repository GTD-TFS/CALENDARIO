/* semester.js — Vista semestral (solo lectura)
   - Click en #monthLabel => modal 6 meses
   - Navega semestre anterior/siguiente (sin saltos)
   - Click en un mes => AppTurnos.setViewMonth(y,m) y cierra
*/

(()=> {
  const $ = (s)=>document.querySelector(s);

  function api(){
    if (!window.AppTurnos) throw new Error("AppTurnos no disponible");
    return window.AppTurnos;
  }

  function monthNameES(y, m1to12){
    const d = new Date(y, m1to12-1, 1);
    const s = d.toLocaleDateString("es-ES", { month:"long", year:"numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function ymd(d){
    try { return api().ymd(d); } catch {}
    const pad2 = (n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function daysInMonth(y,m1to12){
    return new Date(y, m1to12, 0).getDate();
  }

  function firstDowMon(y,m1to12){
    // 0..6 (Mon..Sun) para cuadrícula
    const js = new Date(y, m1to12-1, 1).getDay(); // 0 Sun .. 6 Sat
    const iso = js === 0 ? 7 : js; // 1..7 (Mon..Sun)
    return iso - 1; // 0..6 (Mon..Sun)
  }

  // ----- Estado semestre (robusto, sin Date mutable) -----
  let semAnchor = null; // { y: number, m0: number } m0 0..11 inicio semestre (0 o 6)

  function viewMonthStart(){
    // Si AppTurnos expone algo, lo usamos; si no, hoy.
    try{
      const d = api().getViewDate?.();
      if (d) return new Date(d.getFullYear(), d.getMonth(), 1);
    }catch{}
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  function toSemAnchor(d){
    const y = d.getFullYear();
    const m = d.getMonth();           // 0..11
    const m0 = (m < 6) ? 0 : 6;       // 0 = ene, 6 = jul
    return { y, m0 };
  }

  function addMonthsAnchor(y, m0, delta){
    const t = y * 12 + m0 + delta;
    return { y: Math.floor(t / 12), m0: ((t % 12) + 12) % 12 };
  }

  function anchorToDate(a){
    return new Date(a.y, a.m0, 1);
  }

  // ----- Modal DOM -----
  function ensureModal(){
    let wrap = $("#semesterModal");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "semesterModal";
    wrap.hidden = true;
    wrap.innerHTML = `
      <div class="sem-backdrop" data-sem-close="1"></div>
      <div class="sem-card" role="dialog" aria-modal="true" aria-label="Vista semestral">
        <div class="sem-top">
          <button class="sem-btn" id="semPrev" title="Semestre anterior">◀</button>
          <div class="sem-title" id="semTitle">—</div>
          <button class="sem-btn" id="semNext" title="Semestre siguiente">▶</button>
          <button class="sem-btn sem-close" data-sem-close="1" title="Cerrar">✕</button>
        </div>
        <div class="sem-grid" id="semGrid"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    // cerrar (backdrop / X)
    wrap.addEventListener("click", (ev)=>{
      if (ev.target.closest("[data-sem-close]")) hide();
    });
    document.addEventListener("keydown", (ev)=>{
      if (wrap.hidden) return;
      if (ev.key === "Escape") hide();
    });

    // prev/next: 1 SOLO listener (no dentro de render)
    $("#semPrev")?.addEventListener("click", (ev)=>{
      ev.preventDefault();
      semAnchor = semAnchor || toSemAnchor(viewMonthStart());
      semAnchor = addMonthsAnchor(semAnchor.y, semAnchor.m0, -6);
      render();
    });

    $("#semNext")?.addEventListener("click", (ev)=>{
      ev.preventDefault();
      semAnchor = semAnchor || toSemAnchor(viewMonthStart());
      semAnchor = addMonthsAnchor(semAnchor.y, semAnchor.m0, +6);
      render();
    });

    // click en un mes (delegación): 1 SOLO listener
    $("#semGrid")?.addEventListener("click", async (ev)=>{
      const box = ev.target.closest(".sem-month");
      if (!box) return;

      const yy = Number(box.dataset.y);
      const mm = Number(box.dataset.m); // 1..12
      if (!yy || !mm) return;

      try{
        const r = api().setViewMonth(yy, mm);
        if (r && typeof r.then === "function") await r;
      }catch(e){
        console.error("SEM_SET_MONTH_ERROR", e);
        return;
      }

      hide();
    });

    return wrap;
  }

  function show(){
    const wrap = ensureModal();
    if (!semAnchor) semAnchor = toSemAnchor(viewMonthStart());
    render();
    wrap.hidden = false;
    document.body.classList.add("sem-open");
  }

  function hide(){
    const wrap = $("#semesterModal");
    if (!wrap) return;
    wrap.hidden = true;
    document.body.classList.remove("sem-open");
  }

  function render(){
    ensureModal();

    const grid = $("#semGrid");
    const title = $("#semTitle");
    if (!grid || !title) return;

    semAnchor = semAnchor || toSemAnchor(viewMonthStart());
    const semStart = anchorToDate(semAnchor);

    const y0 = semStart.getFullYear();
    const m0 = semStart.getMonth() + 1;

    const end = new Date(semStart.getFullYear(), semStart.getMonth() + 5, 1);
    const y1 = end.getFullYear();
    const m1 = end.getMonth() + 1;

    title.textContent = `${monthNameES(y0,m0)} – ${monthNameES(y1,m1)}`;
    grid.innerHTML = "";

    for (let i=0;i<6;i++){
      const ms = new Date(semStart.getFullYear(), semStart.getMonth()+i, 1);
      const y = ms.getFullYear();
      const m = ms.getMonth()+1;

      const box = document.createElement("div");
      box.className = "sem-month";
      box.dataset.y = String(y);
      box.dataset.m = String(m);

      box.innerHTML = `
        <div class="sem-month-title">${monthNameES(y,m)}</div>
        <div class="sem-dow">
          <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
        <div class="sem-days"></div>
      `;

      const daysWrap = box.querySelector(".sem-days");

      const blanks = firstDowMon(y,m);
      for (let b=0;b<blanks;b++){
        const d = document.createElement("div");
        d.className = "sem-day off";
        daysWrap.appendChild(d);
      }

      const n = daysInMonth(y,m);
      for (let day=1; day<=n; day++){
        const d = document.createElement("div");
        d.className = "sem-day";
        d.textContent = String(day);

        // solo lectura: marcamos descanso vs trabajo (si api lo tiene)
        try{
          const dateStr = ymd(new Date(y, m-1, day));
          const [yy,mm,dd] = dateStr.split("-").map(Number);
          const work = api().isWorkWeek(new Date(yy, mm-1, dd));
          if (!work) d.classList.add("rest");
        }catch{}

        daysWrap.appendChild(d);
      }

      grid.appendChild(box);
    }
  }

  // Hook: click en el label del mes
  document.addEventListener("click", (ev)=>{
    const lab = ev.target.closest("#monthLabel");
    if (!lab) return;
    show();
  });

})();