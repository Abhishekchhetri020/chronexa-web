/* Bells (per-class bell schedules) CRUD dialog. window.EntityBells.open()
 * Each row = a named bell schedule (e.g. "Primary", "Secondary") with a
 * sub-table of periods (starttime / endtime / isTeaching). GDGPSD has 9
 * bell schedules — one per class-band — so the solver can use different
 * timings for primary vs. secondary in the same project. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.bells)) {
      // If `s.bell` exists (from parser) seed it as the first row.
      s.bells = [];
      if (s.bell && Array.isArray(s.bell.periods) && s.bell.periods.length) {
        s.bells.push({
          id: D.uid("bell"), name: "Default", short: "DEF",
          periods: s.bell.periods.map(p => ({
            index: p.index, label: p.label || String(p.index),
            starttime: minToTime(p.startMin), endtime: minToTime(p.endMin),
            isTeaching: p.isTeaching !== false,
          })),
        });
      }
    }
    return s.bells;
  }

  function minToTime(m) {
    if (m == null) return "";
    const h = Math.floor(m / 60), mm = m % 60;
    return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`;
  }

  function rows() {
    return ensure().map(b => ({
      id: b.id, name: b.name || "(unnamed)",
      short: b.short || "",
      periodCount: (b.periods || []).length,
      span: spanFor(b),
      _ref: b,
    }));
  }

  function spanFor(b) {
    const p = b.periods || []; if (!p.length) return "—";
    return `${p[0].starttime || "?"} – ${p[p.length-1].endtime || "?"}`;
  }

  function columns() { return [
    { key:"name",        label:"Name" },
    { key:"short",       label:"Short" },
    { key:"periodCount", label:"# Periods" },
    { key:"span",        label:"Span" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const draft = isNew
      ? { name:"", short:"" }
      : { name:r._ref.name || "", short:r._ref.short || "" };
    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"40", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });

    D.buildEditSheet({
      title: isNew ? "New bell schedule" : `Edit bell — ${r.name}`,
      fields:[
        { label:"Name",  control:fName },
        { label:"Short", control:fShort },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = ensure();
        if (!isNew) {
          const ref = r._ref; const before = { ...ref };
          ref.name = draft.name.trim();
          ref.short = draft.short.trim() || undefined;
          window.APP.audit.append({ entity:"bells", op:"update", before, after:{...ref} });
        } else {
          const nb = { id:D.uid("bell"), name:draft.name.trim(),
            short:draft.short.trim() || undefined, periods:[] };
          if (all.some(x => x.name === nb.name)) { fName.focus(); return; }
          all.push(nb);
          window.APP.audit.append({ entity:"bells", op:"add", after:{...nb} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function openPeriods(r) {
    const ref = r._ref;
    ref.periods = ref.periods || [];
    const tbl = D.el("table", { class:"chrx-ent-subtable" });
    function render() {
      tbl.innerHTML = "";
      tbl.appendChild(D.el("thead", null, D.el("tr", null,
        D.el("th", null, "#"), D.el("th", null, "Label"),
        D.el("th", null, "Start"), D.el("th", null, "End"),
        D.el("th", null, "Teaching?"), D.el("th", null, ""))));
      const tb = D.el("tbody");
      if (!ref.periods.length) {
        tb.appendChild(D.el("tr", null,
          D.el("td", { colspan:"6", class:"chrx-ent-empty" },
            "No periods yet. Click ‘Add period’ below.")));
      }
      ref.periods.forEach((p, i) => {
        const fLbl = D.el("input", { type:"text", value:p.label || String(p.index || i+1),
          oninput:(e)=>p.label = e.target.value });
        const fSt = D.el("input", { type:"time", value:p.starttime || "",
          oninput:(e)=>p.starttime = e.target.value });
        const fEt = D.el("input", { type:"time", value:p.endtime || "",
          oninput:(e)=>p.endtime = e.target.value });
        const fTe = D.el("input", { type:"checkbox",
          checked: p.isTeaching !== false ? "checked" : null,
          onchange:(e)=>p.isTeaching = e.target.checked });
        const del = D.el("button", { type:"button", class:"chrx-btn chrx-btn--danger",
          onclick:()=>{ ref.periods.splice(i,1); render(); } }, "Delete");
        tb.appendChild(D.el("tr", null,
          D.el("td", null, String(i+1)), D.el("td", null, fLbl),
          D.el("td", null, fSt), D.el("td", null, fEt),
          D.el("td", null, fTe), D.el("td", null, del)));
      });
      tbl.appendChild(tb);
    }
    render();
    const add = D.el("button", { type:"button", class:"chrx-btn", onclick:()=>{
      ref.periods.push({ index: ref.periods.length+1, label: String(ref.periods.length+1),
        starttime: "", endtime: "", isTeaching: true });
      render();
    } }, "+ Add period");
    D.openSheet(D.el("div", null, tbl, D.el("div", { class:"chrx-ent-row" }, add),
      D.el("div", { class:"chrx-ent-form__foot" },
        D.el("button", { type:"button", class:"chrx-btn chrx-btn--primary",
          onclick:()=>{
            window.APP.audit.append({ entity:"bells", op:"periods", id:ref.id, after: ref.periods.slice() });
            D.closeSheet(); D.refresh(rows());
          } }, "Done"),
      ),
    ), { title:`Periods — ${ref.name}` });
  }

  function open() {
    ensure();
    D.open({
      entity:"bells", title:"Bell schedules",
      columns:columns(), rows:rows(),
      extras:[ { id:"periods", label:"Periods" } ],
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"bells", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
          return;
        }
        if (cmd === "periods" && row) return openPeriods(row);
      },
    });
  }

  global.EntityBells = { open };
})(window);
