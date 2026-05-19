/* Holidays dialog — window.EntityHolidays.open().
 *
 * Holidays are date ranges (or single days) when no lessons should be
 * scheduled — Diwali, Christmas, mid-term break, exam week. Stored on
 * school.holidays[] as { id, name, color, startDate, endDate?, dayPattern? }.
 *
 * The solver respects holidays by treating affected (day, week, term) cells
 * as unavailable. Wiring into the constraint engine is a follow-up.
 */
(function (global) {
  "use strict";
  const D = window.EntityDialog;
  if (!D) return;

  function rows() {
    return ((window.APP.school && window.APP.school.holidays) || []).map(h => ({
      id: h.id, name: h.name || "", color: h.color || "",
      startDate: h.startDate || "", endDate: h.endDate || h.startDate || "",
      _ref: h,
    }));
  }

  function columns() { return [
    { key: "color", label: "", sortable: false,
      render: (r) => D.el("span", { class: "chrx-ent-swatch-dot",
        style: `background:${r.color || "transparent"}`, "aria-hidden": "true" }) },
    { key: "name", label: "Name" },
    { key: "startDate", label: "From" },
    { key: "endDate", label: "Till" },
  ]; }

  function openEdit(r) {
    const isNew = !r;
    const today = new Date().toISOString().slice(0, 10);
    const draft = isNew
      ? { name: "", color: "", startDate: today, endDate: today, notes: "" }
      : { name: r.name, color: r.color, startDate: r.startDate, endDate: r.endDate, notes: r._ref.notes || "" };

    const fName = D.el("input", { type: "text", value: draft.name, required: "required",
      maxlength: "80", oninput: (e) => draft.name = e.target.value });
    const fColor = D.buildSwatchPicker(draft.color, v => draft.color = v);
    const fStart = D.el("input", { type: "date", value: draft.startDate,
      oninput: (e) => draft.startDate = e.target.value });
    const fEnd = D.el("input", { type: "date", value: draft.endDate,
      oninput: (e) => draft.endDate = e.target.value });
    const fNotes = D.el("textarea", { rows: "2", maxlength: "240",
      placeholder: "Optional notes (e.g. 'Diwali — mid-state schools also off')",
      oninput: (e) => draft.notes = e.target.value }, draft.notes || "");

    D.buildEditSheet({
      title: isNew ? "New holiday" : `Edit holiday — ${r.name}`,
      fields: [
        { label: "Name",  control: fName },
        { label: "Color", control: fColor },
        { label: "From",  control: fStart },
        { label: "Till",  control: fEnd },
        { label: "Notes", control: fNotes },
      ],
      onSave: () => {
        if (!draft.name.trim()) { fName.focus(); return; }
        const all = (window.APP.school.holidays = window.APP.school.holidays || []);
        if (!isNew) {
          const ref = r._ref;
          const before = { ...ref };
          ref.name = draft.name.trim();
          ref.color = draft.color || undefined;
          ref.startDate = draft.startDate;
          ref.endDate = draft.endDate;
          ref.notes = draft.notes.trim() || undefined;
          window.APP.audit.append({ entity: "holidays", op: "update", before, after: { ...ref } });
        } else {
          const nh = { id: D.uid("h"), name: draft.name.trim(),
            color: draft.color || undefined,
            startDate: draft.startDate, endDate: draft.endDate,
            notes: draft.notes.trim() || undefined };
          all.push(nh);
          window.APP.audit.append({ entity: "holidays", op: "add", after: { ...nh } });
        }
        D.closeSheet(); D.refresh(rows());
      },
    });
  }

  function open() {
    D.open({
      entity: "holidays", title: "Holidays",
      columns: columns(), rows: rows(),
      onAction: (cmd, row) => {
        if (cmd === "new") return openEdit(null);
        if (cmd === "edit" && row) return openEdit(row);
        if (cmd === "delete" && row) {
          const all = window.APP.school.holidays || [];
          const i = all.findIndex(x => x.id === row._ref.id);
          if (i >= 0) {
            const removed = all.splice(i, 1)[0];
            window.APP.audit.append({ entity: "holidays", op: "remove", before: { ...removed } });
            D.refresh(rows());
          }
        }
      },
    });
  }

  global.EntityHolidays = { open };
})(window);
