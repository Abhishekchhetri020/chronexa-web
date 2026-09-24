/**
 * W2-2 published-viewer: read-only week-grid renderer (contract C2, reader side).
 *
 * render(rootEl, snapshot, opts) validates, then builds a self-contained
 * published view: view switcher (class / teacher / classroom), entity picker,
 * per-day week grid with break bands, phone day tabs, print button, and an
 * optional dated substitution overlay (struck-through original + substitute).
 *
 * Deliberately uses NO editor affordances: no .chrx-vkarta cards, nothing
 * draggable, no contextmenu listeners, no Generate/Test/entity-dialog code
 * paths. Editor document-level listeners gate on editor selectors, so they
 * stay inert here.
 */
import { validateSnapshot } from "./validate.js";
import "../../css/viewer.css";

const VIEW_LABELS = { class: "Class", teacher: "Teacher", classroom: "Classroom" };

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function byId(list) {
  const m = new Map();
  for (const e of list || []) {
    if (e && typeof e.id === "string") m.set(e.id, e);
  }
  return m;
}

function localToday() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function changeDates(snapshot) {
  const dates = [...new Set((snapshot.changes || []).map((c) => c.date))];
  dates.sort();
  return dates;
}

/** Pick the date the substitution overlay defaults to (contract C3: today). */
function defaultDate(snapshot) {
  const dates = changeDates(snapshot);
  if (dates.length === 0) return "";
  const today = localToday();
  if (dates.includes(today)) return today;
  return dates[0];
}

/** Default active day: today's weekday when it is in the snapshot, else first. */
function defaultDay(snapshot) {
  const days = snapshot.days || [];
  if (days.length === 0) return 0;
  const js = new Date().getDay(); // 0=Sun..6=Sat
  const idx = (js >= 1 && js <= 6) ? js - 1 : 0;
  return days.some((d) => d.index === idx) ? idx : days[0].index;
}

/**
 * Review 2: the desktop week grid highlights today's column. -1 when today's
 * weekday is not in the snapshot (e.g. Sunday) → no column highlighted.
 */
function todayColumnIdx(snapshot) {
  const days = snapshot.days || [];
  const js = new Date().getDay(); // 0=Sun..6=Sat
  const idx = (js >= 1 && js <= 6) ? js - 1 : -1;
  return days.some((d) => d.index === idx) ? idx : -1;
}

/**
 * Does a C3 change record apply to a snapshot lesson cell?
 * Matches day+period, and the absent teacher must be one of the lesson's
 * teachers — or the lesson carries no teacher info at all (restricted
 * editions), in which case day+period alone decides.
 */
function changeAppliesTo(change, lesson, snapshot) {
  if (!change || !lesson) return false;
  if (change.day !== lesson.day) return false;
  let matchesPeriod = change.period === lesson.period;
  if (!matchesPeriod && (lesson.span || 1) > 1 && snapshot && Array.isArray(snapshot.periods)) {
    const pIdx = snapshot.periods.findIndex((p) => p.index === lesson.period);
    if (pIdx >= 0) {
      const covered = snapshot.periods.slice(pIdx, pIdx + (lesson.span || 1)).map((p) => p.index);
      matchesPeriod = covered.includes(change.period);
    }
  }
  if (!matchesPeriod) return false;
  const teachers = lesson.teacherIds || [];
  if (teachers.length === 0) return true;
  return teachers.includes(change.absentTeacherId);
}

function cellSubstitution(lesson, changesForDate, snapshot) {
  for (const c of changesForDate) {
    if (changeAppliesTo(c, lesson, snapshot)) return c;
  }
  return null;
}

function renderError(rootEl, title, messages) {
  rootEl.innerHTML =
    '<div class="chrx-pub chrx-pub-error" role="alert">' +
      `<h1>${esc(title)}</h1>` +
      "<ul>" + messages.map((m) => `<li>${esc(m)}</li>`).join("") + "</ul>" +
      '<p class="chrx-pub-error-hint">Ask the school office for a fresh published link or file.</p>' +
    "</div>";
}

/**
 * Render a validated snapshot into rootEl.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function render(rootEl, snapshot, opts = {}) {
  const check = validateSnapshot(snapshot);
  if (!check.ok) {
    renderError(rootEl, "Could not open this published timetable", check.errors);
    return { ok: false, errors: check.errors };
  }

  const hasTeachers = Array.isArray(snapshot.teachers) && snapshot.teachers.length > 0;
  const hasRooms = Array.isArray(snapshot.classrooms) && snapshot.classrooms.length > 0;
  const views = ["class"];
  if (hasTeachers) views.push("teacher");
  if (hasRooms) views.push("classroom");

  const subjectById = byId(snapshot.subjects);
  const teacherById = byId(snapshot.teachers);
  const roomById = byId(snapshot.classrooms);
  const classById = byId(snapshot.classes);

  const state = {
    view: views[0],
    entityId: null,
    day: defaultDay(snapshot),
    date: typeof opts.date === "string" ? opts.date : defaultDate(snapshot),
  };

  const entitiesFor = (view) => {
    if (view === "teacher") return snapshot.teachers || [];
    if (view === "classroom") return snapshot.classrooms || [];
    return snapshot.classes || [];
  };
  const pickDefault = () => {
    const list = entitiesFor(state.view);
    if (!list.some((e) => e.id === state.entityId)) {
      state.entityId = list.length > 0 ? list[0].id : null;
    }
  };
  pickDefault();

  const lessonsFor = (dayIdx, periodIdx) => (snapshot.lessons || []).filter((l) => {
    if (l.day !== dayIdx || l.period !== periodIdx) return false;
    if (state.view === "teacher") return (l.teacherIds || []).includes(state.entityId);
    if (state.view === "classroom") return (l.classroomIds || []).includes(state.entityId);
    return (l.classIds || []).includes(state.entityId);
  });

  const changesForDate = () =>
    state.date ? (snapshot.changes || []).filter((c) => c.date === state.date) : [];

  function cellHtml(lesson) {
    const subj = subjectById.get(lesson.subjectId) || {};
    const color = subj.color || "#64748b";
    const lines = [`<div class="chrx-pub-subj">${esc(subj.name || subj.short || "?")}</div>`];

    // The "other parties" depend on the active view; teacher names are only
    // ever shown when the snapshot carries teachers (edition-filtered).
    const parts = [];
    if (state.view === "class") {
      if (hasTeachers) {
        const names = (lesson.teacherIds || []).map((id) => teacherById.get(id)?.name || "?");
        if (names.length) parts.push(names.join(", "));
      }
      const rooms = (lesson.classroomIds || []).map((id) => roomById.get(id)?.name || "?");
      if (rooms.length) parts.push(rooms.join(", "));
    } else if (state.view === "teacher") {
      const names = (lesson.classIds || []).map((id) => classById.get(id)?.name || "?");
      if (names.length) parts.push(names.join(", "));
      const rooms = (lesson.classroomIds || []).map((id) => roomById.get(id)?.name || "?");
      if (rooms.length) parts.push(rooms.join(", "));
    } else {
      const names = (lesson.classIds || []).map((id) => classById.get(id)?.name || "?");
      if (names.length) parts.push(names.join(", "));
      if (hasTeachers) {
        const tnames = (lesson.teacherIds || []).map((id) => teacherById.get(id)?.name || "?");
        if (tnames.length) parts.push(tnames.join(", "));
      }
    }
    if (parts.length) lines.push(`<div class="chrx-pub-meta">${esc(parts.join(" · "))}</div>`);

    const sub = cellSubstitution(lesson, changesForDate(), snapshot);
    if (sub) {
      const absent = teacherById.get(sub.absentTeacherId)?.name || "Teacher";
      if (sub.substituteTeacherId) {
        const repl = teacherById.get(sub.substituteTeacherId)?.name || "Substitute";
        lines.push(
          `<div class="chrx-pub-sub"><s class="chrx-pub-sub-orig">${esc(absent)}</s>` +
          `<span class="chrx-pub-sub-new"> → ${esc(repl)}</span></div>`
        );
      } else {
        lines.push(
          `<div class="chrx-pub-sub"><s class="chrx-pub-sub-orig">${esc(absent)}</s>` +
          `<span class="chrx-pub-sub-cancel"> · Cancelled</span></div>`
        );
      }
      if (sub.note) lines.push(`<div class="chrx-pub-note">${esc(sub.note)}</div>`);
    }
    return `<div class="chrx-pub-cell" style="border-left-color:${esc(color)}">${lines.join("")}</div>`;
  }

  function daySectionHtml(day) {
    const rows = [];
    let skipCount = 0;
    for (let pi = 0; pi < snapshot.periods.length; pi++) {
      const p = snapshot.periods[pi];
      if (skipCount > 0) {
        skipCount--;
        // The slot cell was emitted with rowspan in the starting period row;
        // only render the period header here.
        rows.push(
          `<tr class="chrx-pub-row"><th class="chrx-pub-period" scope="row">` +
          `<span class="chrx-pub-plabel">${esc(p.label)}</span>` +
          (p.start ? `<span class="chrx-pub-ptime">${esc(p.start)}–${esc(p.end || "")}</span>` : "") +
          `</th></tr>`
        );
      } else {
        const lessons = lessonsFor(day.index, p.index);
        const maxAllowed = snapshot.periods.length - pi;
        const span = Math.min(maxAllowed, Math.max(1, ...lessons.map((l) => l.span || 1)));
        const cell = lessons.length
          ? lessons.map(cellHtml).join("")
          : '<div class="chrx-pub-empty">—</div>';
        const rowspanAttr = span > 1 ? ` rowspan="${span}"` : "";
        rows.push(
          `<tr class="chrx-pub-row"><th class="chrx-pub-period" scope="row">` +
          `<span class="chrx-pub-plabel">${esc(p.label)}</span>` +
          (p.start ? `<span class="chrx-pub-ptime">${esc(p.start)}–${esc(p.end || "")}</span>` : "") +
          `</th><td class="chrx-pub-slot"${rowspanAttr}>${cell}</td></tr>`
        );
        if (span > 1) {
          skipCount = span - 1;
        }
      }
      for (const b of snapshot.breaks || []) {
        if (b.afterPeriod === p.index) {
          rows.push(
            `<tr class="chrx-pub-break"><td colspan="2">` +
            `${esc(b.label)}${b.start ? ` · ${esc(b.start)}–${esc(b.end || "")}` : ""}` +
            `</td></tr>`
          );
        }
      }
    }
    return (
      `<section class="chrx-pub-day${day.index === state.day ? " is-active" : ""}" data-day="${day.index}">` +
      `<h2>${esc(day.name)}</h2>` +
      `<table class="chrx-pub-table"><tbody>${rows.join("")}</tbody></table>` +
      `</section>`
    );
  }

  /**
   * Review 2: desktop week grid (≥768px). Periods are rows (label + times),
   * days are columns, lesson cells carry subject + teacher (unless the
   * edition hides teachers) + room, break bands are full-width rows between
   * periods, today's column gets .is-today. Phone keeps the day sections.
   */
  function weekGridHtml(todayIdx) {
    const days = snapshot.days || [];
    const head =
      `<thead><tr class="chrx-pub-grid-headrow"><th class="chrx-pub-grid-corner" scope="col">` +
      `<span class="chrx-pub-grid-cornerlabel">Period</span></th>` +
      days.map((d) =>
        `<th class="chrx-pub-grid-day${d.index === todayIdx ? " is-today" : ""}" scope="col" data-day="${d.index}">` +
        `${esc(d.name)}</th>`
      ).join("") + `</tr></thead>`;

    // Multi-period lessons: track remaining rows spanned per day column so a
    // 2-period lesson occupies ONE cell with rowspan, never extra cells.
    const skipCountByDay = new Map();
    for (const d of days) skipCountByDay.set(d.index, 0);

    const rows = [];
    for (let pi = 0; pi < snapshot.periods.length; pi++) {
      const p = snapshot.periods[pi];
      const cells = [];
      for (const d of days) {
        const remaining = skipCountByDay.get(d.index) || 0;
        if (remaining > 0) {
          skipCountByDay.set(d.index, remaining - 1);
          continue;
        }
        const lessons = lessonsFor(d.index, p.index);
        const maxAllowed = snapshot.periods.length - pi;
        const span = Math.min(maxAllowed, Math.max(1, ...lessons.map((l) => l.span || 1)));
        const inner = lessons.length
          ? lessons.map(cellHtml).join("")
          : '<div class="chrx-pub-empty">—</div>';
        const rowspanAttr = span > 1 ? ` rowspan="${span}"` : "";
        cells.push(
          `<td class="chrx-pub-grid-slot${d.index === todayIdx ? " is-today" : ""}" ` +
          `data-day="${d.index}" data-period="${p.index}"${rowspanAttr}>${inner}</td>`
        );
        if (span > 1) {
          skipCountByDay.set(d.index, span - 1);
        }
      }
      rows.push(
        `<tr class="chrx-pub-grid-row" data-period="${p.index}">` +
        `<th class="chrx-pub-grid-period" scope="row">` +
        `<span class="chrx-pub-plabel">${esc(p.label)}</span>` +
        (p.start ? `<span class="chrx-pub-ptime">${esc(p.start)}–${esc(p.end || "")}</span>` : "") +
        `</th>${cells.join("")}</tr>`
      );
      for (const b of snapshot.breaks || []) {
        if (b.afterPeriod === p.index) {
          rows.push(
            `<tr class="chrx-pub-break chrx-pub-grid-break"><td colspan="${days.length + 1}">` +
            `${esc(b.label)}${b.start ? ` · ${esc(b.start)}–${esc(b.end || "")}` : ""}` +
            `</td></tr>`
          );
        }
      }
    }
    return (
      `<table class="chrx-pub-grid" aria-label="Week timetable">` +
      head + `<tbody>${rows.join("")}</tbody></table>`
    );
  }

  function paint() {
    pickDefault();
    const entity = entitiesFor(state.view).find((e) => e.id === state.entityId);
    const dates = changeDates(snapshot);
    const todayIdx = todayColumnIdx(snapshot);
    const tabs = views.map((v) =>
      `<button type="button" class="chrx-pub-tab${v === state.view ? " is-on" : ""}" ` +
      `data-pub-view="${v}" role="tab" aria-selected="${v === state.view}">${VIEW_LABELS[v]}</button>`
    ).join("");
    const dayTabs = (snapshot.days || []).map((d) =>
      `<button type="button" class="chrx-pub-daytab${d.index === state.day ? " is-on" : ""}" ` +
      `data-pub-day="${d.index}" role="tab" aria-selected="${d.index === state.day}">${esc(d.short || d.name)}</button>`
    ).join("");
    const dateBox = dates.length
      ? `<label class="chrx-pub-dateline">Changes on ` +
        `<input type="date" class="chrx-pub-date" value="${esc(state.date)}" ` +
        `min="${esc(dates[0])}" max="${esc(dates[dates.length - 1])}">` +
        `</label>`
      : "";

    rootEl.innerHTML =
      `<div class="chrx-pub">` +
        `<header class="chrx-pub-head"><div>` +
          `<h1>${esc(snapshot.school.name)}</h1>` +
          `<p>${esc([snapshot.school.year, snapshot.edition + " edition"].filter(Boolean).join(" · "))}</p>` +
        `</div><button type="button" class="chrx-pub-print">Print</button></header>` +
        `<div class="chrx-pub-tabs" role="tablist" aria-label="Timetable view">${tabs}</div>` +
        `<div class="chrx-pub-controls"><label class="chrx-pub-pick">${esc(VIEW_LABELS[state.view])} ` +
          `<select class="chrx-pub-entity">` +
            entitiesFor(state.view).map((e) =>
              `<option value="${esc(e.id)}"${e.id === state.entityId ? " selected" : ""}>${esc(e.name)}</option>`
            ).join("") +
          `</select></label>${dateBox}</div>` +
        `<div class="chrx-pub-daytabs" role="tablist" aria-label="Day">${dayTabs}</div>` +
        `<div class="chrx-pub-grid-wrap">${weekGridHtml(todayIdx)}</div>` +
        `<div class="chrx-pub-week">${(snapshot.days || []).map(daySectionHtml).join("")}</div>` +
        `<footer class="chrx-pub-foot">Published read-only copy · Chronexa</footer>` +
      `</div>`;

    rootEl.querySelector(".chrx-pub-print")?.addEventListener("click", () => window.print());
    rootEl.querySelectorAll("[data-pub-view]").forEach((b) =>
      b.addEventListener("click", () => {
        state.view = b.getAttribute("data-pub-view");
        state.entityId = null;
        paint();
      })
    );
    rootEl.querySelector(".chrx-pub-entity")?.addEventListener("change", (e) => {
      state.entityId = e.target.value;
      paint();
    });
    rootEl.querySelectorAll("[data-pub-day]").forEach((b) =>
      b.addEventListener("click", () => {
        state.day = Number(b.getAttribute("data-pub-day"));
        paint();
      })
    );
    rootEl.querySelector(".chrx-pub-date")?.addEventListener("change", (e) => {
      state.date = e.target.value;
      paint();
    });

    if (entity) {
      try { document.title = `${snapshot.school.name} — ${entity.name} · Chronexa viewer`; } catch {}
    }
  }

  paint();
  return { ok: true, errors: [] };
}

// W2-3 (offline single-file viewer) inlines this same renderer.
if (typeof window !== "undefined") {
  window.ChronexaViewer = window.ChronexaViewer || {};
  window.ChronexaViewer.render = render;
  window.ChronexaViewer.validate = validateSnapshot;
}
