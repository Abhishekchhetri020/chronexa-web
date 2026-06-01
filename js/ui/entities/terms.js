/* Terms CRUD dialog. window.EntityTerms.open()
 * Defines reusable term-pattern entries (Term-1, Term-2, "Whole year") that
 * lessons / supervisions can scope themselves to. Each pattern is a bitmask
 * string — "1" for whole-year, "10"/"01" for which term applies in a
 * 2-term school. Mirrors CLASSIC <termsdef terms="…"> wire shape.
 * Fields: name, short, color, terms. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function seedDefaults(arr) {
    arr.push({ id: D.uid("term"), name: "Whole year", short: "YR", terms: "1" });
  }

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.terms)) {
      s.terms = [];
      seedDefaults(s.terms);
    } else if (s.terms.length === 0) {
      seedDefaults(s.terms);
    }
    return s.terms;
  }

  function patternLabel(terms) {
    if (!terms) return "";
    const bits = String(terms);
    if (bits === "1") return "Whole year";
    const on = [];
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] === "1") on.push("T" + (i + 1));
    }
    if (!on.length) return "(none)";
    if (on.length === bits.length) return "All " + bits.length + " terms";
    return on.join("/");
  }

  function rows() {
    return ensure().map(t => ({
      id: t.id, name: t.name || "(unnamed)",
      short: t.short || "", color: t.color || "",
      terms: t.terms || "",
      pattern: patternLabel(t.terms),
      _ref: t,
    }));
  }

  function columns() { return [
    { key:"color", label:"", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}`, "aria-hidden":"true" }) },
    { key:"name",    label:"Name" },
    { key:"short",   label:"Short" },
    { key:"pattern", label:"Terms" },
  ]; }

  function buildBitmaskEditor(initial, onChange) {
    let bits = String(initial || "1").split("");

    const wrap = D.el("div", {
      style:"display:flex;flex-direction:column;gap:6px" });
    const row = D.el("div", {
      style:"display:flex;flex-wrap:wrap;gap:6px;align-items:center" });
    wrap.appendChild(row);

    function fire() { onChange(bits.join("")); }

    function render() {
      row.innerHTML = "";
      bits.forEach((b, i) => {
        const cb = D.el("input", { type:"checkbox",
          checked: b === "1" ? "checked" : null,
          onchange:(e)=>{ bits[i] = e.target.checked ? "1" : "0"; fire(); },
        });
        row.appendChild(D.el("label", {
          style:"display:inline-flex;gap:4px;align-items:center;cursor:pointer;padding:2px 6px;border:1px solid var(--chrx-border,#d1d5db);border-radius:6px" },
          cb, D.el("span", null, "Term " + (i + 1))));
      });
    }
    render();

    const countWrap = D.el("div", {
      style:"display:flex;gap:6px;align-items:center;font-size:12px;opacity:.85" },
      D.el("span", null, "# of terms:"),
      D.el("input", { type:"number", min:"1", max:"6", value:String(bits.length),
        style:"width:64px",
        oninput:(e)=>{
          const n = Math.max(1, Math.min(6, parseInt(e.target.value, 10) || 1));
          if (n === bits.length) return;
          if (n > bits.length) while (bits.length < n) bits.push("1");
          else bits.length = n;
          fire(); render();
        } }));
    wrap.appendChild(countWrap);

    wrap.appendChild(D.el("p", {
      class:"chrx-ent-help",
      style:"margin:0;font-size:11px;opacity:.7" },
      "1 = lesson runs that term, 0 = skipped. Two terms = Semester 1 / 2 schools."));

    return wrap;
  }

  function openEdit(r) {
    const isNew = !r;
    const ref = r ? r._ref : null;
    const draft = isNew
      ? { name:"", short:"", color:"", terms:"1" }
      : { name:ref.name || "", short:ref.short || "",
          color:ref.color || "", terms:ref.terms || "1" };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fBits = buildBitmaskEditor(draft.terms, v => draft.terms = v);

    D.buildEditSheet({
      title: isNew ? "New term" : `Edit term — ${draft.name}`,
      fields:[
        { label:"Name",  control:fName },
        { label:"Short", control:fShort },
        { label:"Terms", control:fBits },
        { label:"Color", control:fColor },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        if (!/[1]/.test(draft.terms)) {
          fBits.querySelector("input[type=checkbox]")?.focus();
          return;
        }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          short: draft.short.trim() || undefined,
          color: draft.color || undefined,
          terms: draft.terms,
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"terms", op:"update", before, after:{...ref} });
        } else {
          if (all.some(x => x.name === payload.name)) { fName.focus(); return; }
          payload.id = D.uid("term");
          all.push(payload);
          window.APP.audit.append({ entity:"terms", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"terms", title:"Terms",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"terms", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  function defaultId() {
    const all = ensure();
    const whole = all.find(t => t.terms === "1") || all[0];
    return whole ? whole.id : null;
  }

  global.EntityTerms = { open, ensure, defaultId, patternLabel };
})(window);

// Chronexa Web
