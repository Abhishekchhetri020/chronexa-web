/* Days CRUD dialog. window.EntityDays.open()
 * Defines reusable day-of-week patterns: each pattern is a 6-bit bitmask
 * (Mon..Sat) that lessons / supervisions can scope themselves to. Mirrors
 * CLASSIC <daysdef days="100000"> wire shape, including comma-separated
 * "Any day" alternatives. Fields: name, short, color, days (bitmask).
 *
 * Default seed: 6 single days + "Any day" + "Every day". Stored on
 * window.APP.school.days; persists in snapshots like every other entity. */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat"];
  const DAY_SHORTS = ["Mo","Tu","We","Th","Fr","Sa"];

  // Default day-pattern seed — mirrors sample-school.xml so a fresh school
  // already has working "any day" / "every day" patterns for the lesson
  // dialog to pick.
  function seedDefaults(arr) {
    const single = (idx, name, short) => {
      const bits = ["0","0","0","0","0","0"];
      bits[idx] = "1";
      return { id: D.uid("day"), name, short, days: bits.join("") };
    };
    arr.push(single(0, "Monday",    "Mo"));
    arr.push(single(1, "Tuesday",   "Tu"));
    arr.push(single(2, "Wednesday", "We"));
    arr.push(single(3, "Thursday",  "Th"));
    arr.push(single(4, "Friday",    "Fr"));
    arr.push(single(5, "Saturday",  "Sa"));
    arr.push({ id: D.uid("day"), name: "Mon-Fri", short: "M-F",
      days: "111110" });
    arr.push({ id: D.uid("day"), name: "Any day", short: "X",
      days: "100000,010000,001000,000100,000010,000001" });
    arr.push({ id: D.uid("day"), name: "Every day", short: "E",
      days: "111111" });
  }

  function ensure() {
    const s = window.APP.school = window.APP.school || {};
    if (!Array.isArray(s.days)) {
      s.days = [];
      seedDefaults(s.days);
    } else if (s.days.length === 0) {
      seedDefaults(s.days);
    }
    return s.days;
  }

  function patternLabel(daysStr) {
    // Render bitmask string as a compact "Mo/Tu/Fr" preview.
    if (!daysStr) return "";
    const alts = daysStr.split(",").filter(Boolean);
    // Aggregate by OR — show which days are reachable.
    const merged = ["0","0","0","0","0","0"];
    alts.forEach(bits => {
      for (let i = 0; i < 6 && i < bits.length; i++) {
        if (bits[i] === "1") merged[i] = "1";
      }
    });
    const picked = [];
    for (let i = 0; i < 6; i++) {
      if (merged[i] === "1") picked.push(DAY_SHORTS[i]);
    }
    if (picked.length === 0) return "(none)";
    if (picked.length === 6) return "Mon–Sat";
    if (alts.length > 1 && picked.length > 1) return picked.join("/") + " (any)";
    return picked.join("/");
  }

  function rows() {
    return ensure().map(d => ({
      id: d.id, name: d.name || "(unnamed)",
      short: d.short || "",
      color: d.color || "",
      days: d.days || "",
      pattern: patternLabel(d.days),
      _ref: d,
    }));
  }

  function columns() { return [
    { key:"color", label:"", sortable:false,
      render:(r)=>D.el("span", { class:"chrx-ent-swatch-dot",
        style:`background:${r.color || "transparent"}`, "aria-hidden":"true" }) },
    { key:"name",    label:"Name" },
    { key:"short",   label:"Short" },
    { key:"pattern", label:"Days" },
  ]; }

  function buildBitmaskEditor(initial, onChange) {
    // initial is a single bitmask string like "111110". For "any-day"
    // multi-alt patterns we collapse to the OR set and warn the user.
    const bits = ["0","0","0","0","0","0"];
    const first = (initial || "").split(",")[0] || "";
    for (let i = 0; i < 6 && i < first.length; i++) {
      bits[i] = first[i] === "1" ? "1" : "0";
    }

    const isAnyDay = (initial || "").indexOf(",") !== -1;

    const wrap = D.el("div", { class:"chrx-ent-daybits",
      style:"display:flex;flex-wrap:wrap;gap:6px;align-items:center" });

    function fire() {
      onChange(bits.join(""));
    }

    DAY_LABELS.forEach((lbl, i) => {
      const cb = D.el("input", { type:"checkbox",
        checked: bits[i] === "1" ? "checked" : null,
        onchange:(e)=>{
          bits[i] = e.target.checked ? "1" : "0";
          fire();
        },
      });
      wrap.appendChild(D.el("label", {
        style:"display:inline-flex;gap:4px;align-items:center;cursor:pointer;padding:2px 6px;border:1px solid var(--chrx-border,#d1d5db);border-radius:6px" },
        cb, D.el("span", null, lbl)));
    });

    if (isAnyDay) {
      wrap.appendChild(D.el("p", {
        class:"chrx-ent-help",
        style:"flex-basis:100%;margin:4px 0;font-size:11px;opacity:.7" },
        "Note: this pattern uses comma-separated alternatives (an 'Any day' style). Editing here collapses it to a single bitmask."));
    }

    return wrap;
  }

  function openEdit(r) {
    const isNew = !r;
    const ref = r ? r._ref : null;
    const draft = isNew
      ? { name:"", short:"", color:"", days:"100000" }
      : { name:ref.name || "", short:ref.short || "",
          color:ref.color || "", days:ref.days || "100000" };

    const fName = D.el("input", { type:"text", value:draft.name, required:"required",
      maxlength:"30", oninput:(e)=>draft.name = e.target.value });
    const fShort = D.el("input", { type:"text", value:draft.short, maxlength:"10",
      oninput:(e)=>draft.short = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fBits = buildBitmaskEditor(draft.days, v => draft.days = v);

    D.buildEditSheet({
      title: isNew ? "New day pattern" : `Edit day pattern — ${draft.name}`,
      fields:[
        { label:"Name",  control:fName },
        { label:"Short", control:fShort },
        { label:"Days",  control:fBits },
        { label:"Color", control:fColor },
      ],
      onSave:()=>{
        if (!draft.name.trim()) { fName.focus(); return; }
        if (!/[1]/.test(draft.days)) {
          // Empty bitmask — refuse silently with focus on first day cell.
          fBits.querySelector("input[type=checkbox]")?.focus();
          return;
        }
        const all = ensure();
        const payload = {
          name: draft.name.trim(),
          short: draft.short.trim() || undefined,
          color: draft.color || undefined,
          days: draft.days,
        };
        if (!isNew) {
          const before = { ...ref };
          Object.assign(ref, payload);
          window.APP.audit.append({ entity:"days", op:"update", before, after:{...ref} });
        } else {
          if (all.some(x => x.name === payload.name)) { fName.focus(); return; }
          payload.id = D.uid("day");
          all.push(payload);
          window.APP.audit.append({ entity:"days", op:"add", after:{...payload} });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    ensure();
    D.open({
      entity:"days", title:"Days",
      columns:columns(), rows:rows(),
      onAction:(cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = ensure();
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i,1)[0];
            window.APP.audit.append({ entity:"days", op:"remove", before:{...removed} });
            D.refresh(rows());
          }
        }
      },
    });
  }

  // Helper used by other modules (lessons.js) to look up the default
  // "any day" entry for fallback selection.
  function defaultId() {
    const all = ensure();
    const any = all.find(d => /,/.test(d.days || "")) ||
                all.find(d => d.days === "111111") ||
                all[all.length - 1];
    return any ? any.id : null;
  }

  global.EntityDays = { open, ensure, defaultId, patternLabel };
})(window);

// Chronexa Web
