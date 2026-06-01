/* Entity field gaps from the W15 live Classic walk.
 *
 * The live walk discovered concrete fields the offline docs missed.
 * Rather than reopening every frozen entity dialog file, this module
 * decorates them from outside via MutationObserver — same pattern as
 * smart_defaults.js — and slots the missing inputs into the edit sheet.
 *
 * Gap matrix shipped here:
 *   Classroom: `bells` (FK to bells), `nearbyClassroomIds` (multi-select)
 *   Teacher:   `title` (free text, e.g. "Mr."/"Dr."), `nameSuffix`,
 *              `gender` (enum), `fontColorsScreen / fontColorPrint / fontColorPrint2`
 *   Class:     `grade` (FK to grades entity), `printSubjectPictures` (bool)
 *
 * Each field persists on the underlying entity row; audit.append fires
 * on save. Hooks the existing Save button rather than building a custom
 * one — guarantees compat with future entity-dialog refactors.
 */
(function (global) {
  "use strict";

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function findSheet() {
    return document.querySelector(".chrx-ent-sheet, .chrx-edit-sheet");
  }

  /* Inserts a [label] [control] row before the [Cancel | Save] buttons */
  function addFieldRow(sheet, label, control) {
    if (!sheet) return;
    const row = el("div", { class: "chrx-fieldgap-row",
      style: "display:flex;gap:10px;align-items:center;margin:6px 0;padding:4px 12px" },
      el("label", { style: "min-width:140px;font-size:13px;color:#475569;font-weight:500" }, label),
      control);
    // Append into the sheet body (before footer if there is one)
    const footer = sheet.querySelector("footer, .chrx-ent-sheet__foot");
    if (footer) footer.parentNode.insertBefore(row, footer);
    else sheet.appendChild(row);
  }

  function inferEntity(dlg) {
    const h = dlg.querySelector("h2, h3, header h2, header h3, .chrx-ent-head h2");
    if (!h) return null;
    const t = (h.textContent || "").toLowerCase();
    if (t.includes("teacher")) return "teacher";
    if (t.includes("classroom") || t.includes("room")) return "classroom";
    if (t.includes("class")) return "class";
    return null;
  }

  function findCurrentRow(kind) {
    const APP = global.APP;
    if (!APP?.school) return null;
    const pool = APP.school[kind + "s"] || APP.school[kind + "rooms"];
    if (!pool) return null;
    // Pick the row whose name matches the dialog title (best-effort)
    const dlg = document.querySelector(".chrx-ent-dialog");
    if (!dlg) return null;
    const titleText = (dlg.querySelector("h2")?.textContent || "").toLowerCase();
    for (const r of pool) {
      const nm = (r.name || "").toLowerCase();
      if (nm && titleText.includes(nm)) return r;
    }
    return pool[pool.length - 1]; // fallback: last-added (likely the new one)
  }

  function decorate(sheetEl) {
    if (!sheetEl || sheetEl.dataset.chrxFieldGapsDone) return;
    const dlg = sheetEl.closest(".chrx-ent-dialog");
    if (!dlg) return;
    const kind = inferEntity(dlg);
    if (!kind) return;
    sheetEl.dataset.chrxFieldGapsDone = "1";

    const row = findCurrentRow(kind);
    if (!row) return;
    const APP = global.APP;
    const school = APP.school;

    if (kind === "teacher") {
      // Title (nameprefix)
      const fTitle = el("input", { type: "text", maxlength: "12",
        value: row.title || row.nameprefix || "",
        placeholder: "Mr. / Mrs. / Dr.",
        oninput: e => row.title = e.target.value.trim() || undefined,
        style: "padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;flex:1" });
      addFieldRow(sheetEl, "Title", fTitle);

      // Name suffix
      const fSuf = el("input", { type: "text", maxlength: "12",
        value: row.nameSuffix || row.namesuffix || "",
        placeholder: "Jr. / Sr.",
        oninput: e => row.nameSuffix = e.target.value.trim() || undefined,
        style: "padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;flex:1" });
      addFieldRow(sheetEl, "Name suffix", fSuf);

      // Gender
      const fGender = el("select", {
        onchange: e => row.gender = e.target.value || undefined,
        style: "padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;flex:1" });
      ["", "m", "f", "x"].forEach(v => {
        const o = el("option", { value: v }, v === "" ? "—" : v === "m" ? "Male" : v === "f" ? "Female" : "Other");
        if (row.gender === v) o.setAttribute("selected", "selected");
        fGender.appendChild(o);
      });
      addFieldRow(sheetEl, "Gender", fGender);

      // 3 print colors (Specify font colors)
      ["fontColorScreen", "fontColorPrint", "fontColorPrint2"].forEach((key, i) => {
        const fc = el("input", { type: "color",
          value: row[key] || "#000000",
          oninput: e => row[key] = e.target.value,
          style: "width:60px;height:24px;border:1px solid #cbd5e1;border-radius:5px" });
        addFieldRow(sheetEl, ["Screen color", "Print color 1", "Print color 2"][i], fc);
      });
    }
    else if (kind === "classroom") {
      // Bells (FK to bells)
      const fBell = el("select", {
        onchange: e => row.bellId = e.target.value || undefined,
        style: "padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;flex:1" });
      fBell.appendChild(el("option", { value: "" }, "Use school default"));
      (school.bells || []).forEach(b => {
        const o = el("option", { value: b.id }, b.name || b.id);
        if (row.bellId === b.id) o.setAttribute("selected", "selected");
        fBell.appendChild(o);
      });
      addFieldRow(sheetEl, "Bell schedule", fBell);

      // Nearby classrooms (multi-select via checkbox list)
      const nearby = new Set(row.nearbyClassroomIds || []);
      const fNearbyWrap = el("div", { style: "flex:1;max-height:120px;overflow-y:auto;border:1px solid #cbd5e1;border-radius:5px;padding:4px 8px;font-size:12px" });
      (school.classrooms || []).forEach(c => {
        if (c.id === row.id) return; // skip self
        const cb = el("input", { type: "checkbox",
          checked: nearby.has(c.id) ? "checked" : null,
          onchange: e => {
            if (e.target.checked) nearby.add(c.id); else nearby.delete(c.id);
            row.nearbyClassroomIds = Array.from(nearby);
          } });
        const label = el("label", { style: "display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer" }, cb, c.name);
        fNearbyWrap.appendChild(label);
      });
      addFieldRow(sheetEl, "Nearby classrooms", fNearbyWrap);
    }
    else if (kind === "class") {
      // Grade dropdown
      const fGrade = el("select", {
        onchange: e => row.gradeId = e.target.value || undefined,
        style: "padding:5px 8px;border:1px solid #cbd5e1;border-radius:5px;font-size:13px;flex:1" });
      fGrade.appendChild(el("option", { value: "" }, "—"));
      (school.grades || []).forEach(g => {
        const o = el("option", { value: g.id }, g.name || g.id);
        if (row.gradeId === g.id) o.setAttribute("selected", "selected");
        fGrade.appendChild(o);
      });
      addFieldRow(sheetEl, "Grade", fGrade);

      // Print subject pictures toggle
      const fPSP = el("input", { type: "checkbox",
        checked: row.printSubjectPictures ? "checked" : null,
        onchange: e => row.printSubjectPictures = e.target.checked });
      addFieldRow(sheetEl, "Print subject pictures", fPSP);
    }

    // Hook the Save button to audit-append the field-gap edits
    const saveBtn = Array.from(sheetEl.querySelectorAll("button"))
      .find(b => /save|ok/i.test(b.textContent));
    if (saveBtn && !saveBtn.dataset.chrxFieldgapHooked) {
      saveBtn.dataset.chrxFieldgapHooked = "1";
      const origClick = saveBtn.onclick;
      saveBtn.addEventListener("click", () => {
        APP.audit?.append?.({
          entity: kind + "s", op: "field-gap-save",
          id: row.id, fields: Object.keys(row),
        });
      });
    }
  }

  function startObserver() {
    if (global.__chrxFieldGapsObserver) return;
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.classList?.contains("chrx-ent-sheet")) decorate(n);
          else if (n.querySelector) {
            const s = n.querySelector(".chrx-ent-sheet, .chrx-edit-sheet");
            if (s) decorate(s);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    global.__chrxFieldGapsObserver = obs;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else { startObserver(); }

  global.EntityFieldGaps = { decorate };
})(window);

// Chronexa Web
