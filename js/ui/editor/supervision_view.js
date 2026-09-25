// [vite-esm] supervision_view.js — Room-supervision (hall duty) resolution logic
// for the Chronexa editor's "Supervision" perspective.
//
// The data is the Classic `classroomsupervisions` entity
// (`school.classroomsupervisions[]` = { id, classroomid, teacherid, day, week,
// term, period, break?, locked? }).  Each row pre-occupies a teacher in a room
// at a (day, period) slot.
//
// Rows of the view are therefore the SUPERVISED AREAS (classrooms / halls), not
// the teachers — that is the dimension the record is keyed on, and it is what
// the classic "Room supervision" view answers: "who is on duty in this hall at
// this time?"  One teacher can hold slots in several areas, and every area can
// have several slots, so a teacher-per-row layout cannot represent the plan.
//
// The view is READ-ONLY: the chips it builds are plain divs (never
// `.chrx-vkarta`), so pickup/drag/context-menu/keyboard card handlers cannot
// touch them, and the only edit path stays the Supervisions entity dialog.
import "../state.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Raw supervision records, always an array. */
export function getSupervisions(school) {
  if (!school) return [];
  return Array.isArray(school.classroomsupervisions) ? school.classroomsupervisions : [];
}

function teacherById(school) {
  if (!school) return {};
  return (school._idx && school._idx.teacherById) ||
    Object.fromEntries((school.teachers || []).map(t => [t.id, t]));
}

function classroomById(school) {
  if (!school) return {};
  return (school._idx && school._idx.classroomById) ||
    Object.fromEntries((school.classrooms || []).map(r => [r.id, r]));
}

function teacherName(school, id) {
  const t = teacherById(school)[id];
  return (t && (t.name || t.abbr)) || id || "—";
}

function areaName(school, id) {
  const r = classroomById(school)[id];
  return (r && (r.name || r.short)) || id || "—";
}

function isBreak(sup) {
  const b = sup && sup.break;
  return b === true || b === 1 || b === "1" || b === "true";
}

function intOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every supervision as a normalized slot.  Slots without a usable day/period
 * (drafts, imported junk) are kept with day/period = null so callers can count
 * them instead of silently dropping the record.
 */
export function supervisionSlots(school) {
  return getSupervisions(school).map((sup, i) => {
    const day = intOrNull(sup.day);
    const period = intOrNull(sup.period);
    return {
      supId: sup.id || ("sup_row_" + i),
      areaId: sup.classroomid || "",
      areaName: areaName(school, sup.classroomid),
      teacherId: sup.teacherid || "",
      teacherName: teacherName(school, sup.teacherid),
      day,
      period,
      break: isBreak(sup),
      week: sup.week || "",
      term: sup.term || "",
      placed: day !== null && day >= 0 && period !== null && period > 0,
      raw: sup,
    };
  });
}

/**
 * Teaching occupancy per (teacher, day, period).  A multi-period card (lab
 * double) occupies every period it covers, so a supervision on its second half
 * is a conflict too — the same convention as CKritSluzba in
 * js/solver/constraints.js.
 */
function teachingOccupancy(school) {
  const out = Object.create(null);
  if (!school) return out;
  const lessonById = (school._idx && school._idx.lessonById) ||
    Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
  const subjectById = (school._idx && school._idx.subjectById) ||
    Object.fromEntries((school.subjects || []).map(s => [s.id, s]));
  const classById = (school._idx && school._idx.classById) ||
    Object.fromEntries((school.classes || []).map(c => [c.id, c]));

  for (const card of (school.cards || [])) {
    const lesson = lessonById[card.lessonId];
    if (!lesson) continue;
    const day = intOrNull(card.day);
    const period = intOrNull(card.period);
    if (day === null || period === null) continue;
    const len = (lesson.lessonLength || (lesson.isLabDouble ? 2 : 1)) | 0;
    const subject = subjectById[lesson.subjectId];
    const subjName = (subject && (subject.name || subject.abbr)) || lesson.subjectId || "lesson";
    const classNames = (lesson.classIds || [])
      .map(cid => (classById[cid] && (classById[cid].name || classById[cid].short)) || cid)
      .join(", ");
    for (const tid of (lesson.teacherIds || [])) {
      for (let e = 0; e < Math.max(1, len); e++) {
        out[tid + "|" + day + "|" + (period + e)] = { subjName, classNames, lessonId: lesson.id };
      }
    }
  }
  return out;
}

/**
 * Conflicts on the supervision plan.
 *
 *   teaching — the supervising teacher is teaching a lesson in that exact
 *              (day, period) slot ("supervising while teaching").
 *   double   — the same teacher supervises two (or more) areas at that slot.
 *
 * Returns a flat, deterministic list: [{ supId, type, day, period, teacherId,
 * teacherName, areaId, detail, ... }], sorted by day, period, supId, type.
 */
export function detectSupervisionConflicts(school) {
  const slots = supervisionSlots(school).filter(s => s.placed);
  const out = [];

  const teach = teachingOccupancy(school);
  const byTeacherSlot = Object.create(null);
  for (const s of slots) {
    // A row with no teacher yet (draft) cannot clash with anything.
    if (!s.teacherId) continue;
    const key = s.teacherId + "|" + s.day + "|" + s.period;
    (byTeacherSlot[key] = byTeacherSlot[key] || []).push(s);
  }

  for (const s of slots) {
    const t = s.teacherId ? teach[s.teacherId + "|" + s.day + "|" + s.period] : null;
    if (t) {
      out.push({
        supId: s.supId, type: "teaching", day: s.day, period: s.period,
        teacherId: s.teacherId, teacherName: s.teacherName, areaId: s.areaId,
        areaName: s.areaName, lessonId: t.lessonId,
        detail: "Teaching " + [t.subjName, t.classNames].filter(Boolean).join(" ") +
          " at the same time",
      });
    }
    const sameSlot = s.teacherId ? (byTeacherSlot[s.teacherId + "|" + s.day + "|" + s.period] || []) : [];
    if (sameSlot.length > 1) {
      const others = sameSlot.filter(o => o.areaId !== s.areaId).map(o => o.areaName);
      const alsoSame = sameSlot.filter(o => o.areaId === s.areaId && o.supId !== s.supId);
      const names = others.length
        ? others
        : (alsoSame.length ? [s.areaName + " (twice)"] : []);
      out.push({
        supId: s.supId, type: "double", day: s.day, period: s.period,
        teacherId: s.teacherId, teacherName: s.teacherName, areaId: s.areaId,
        areaName: s.areaName,
        detail: "Also supervising " + names.join(" and ") + " at the same time",
      });
    }
  }

  out.sort((a, b) =>
    (a.day - b.day) || (a.period - b.period) ||
    String(a.supId).localeCompare(String(b.supId)) || a.type.localeCompare(b.type));
  return out;
}

/** supId -> conflicts[], computed once per lookup build. */
function conflictsBySup(school) {
  const map = Object.create(null);
  for (const c of detectSupervisionConflicts(school)) {
    (map[c.supId] = map[c.supId] || []).push(c);
  }
  return map;
}

/**
 * The per-render index { areaKey -> { "d_p" -> [chip] } } used by the editor
 * grid, exactly like buildStudentCardLookup does for students.  A cell with no
 * chip is a gap (nobody on duty) and gets no entry at all.
 */
export function buildSupervisionLookup(school, visiblePeriodSet, numDays) {
  const lookup = Object.create(null);
  if (!school) return lookup;
  const conflicts = conflictsBySup(school);
  const maxDays = Number.isFinite(numDays) ? numDays : 6;

  for (const s of supervisionSlots(school)) {
    if (!s.placed || !s.areaId) continue;
    if (s.day >= maxDays) continue;
    if (visiblePeriodSet && !visiblePeriodSet.has(s.period | 0)) continue;
    const bucket = lookup[s.areaId] = lookup[s.areaId] || Object.create(null);
    const key = s.day + "_" + s.period;
    (bucket[key] = bucket[key] || []).push({
      supervision: true,
      supId: s.supId,
      areaId: s.areaId,
      areaName: s.areaName,
      teacherId: s.teacherId,
      teacherName: s.teacherName,
      break: s.break,
      day: s.day,
      period: s.period,
      conflicts: conflicts[s.supId] || [],
    });
  }
  return lookup;
}

function rowLabel(school, areaId) {
  const name = areaName(school, areaId);
  return name || areaId || "—";
}

/**
 * Rows for the editor grid when perspective === "supervision".
 *
 * Included, in this order:
 *  1. every area that holds at least one supervision slot, in the school's
 *     classroom order (so the view is stable as slots are edited);
 *  2. areas whose classroom record is flagged `needsSupervision` but that have
 *     no slot at all — the "supervision is required and nobody is assigned"
 *     case, which a slots-only row set would silently hide;
 *  3. areas referenced by a slot that have no classroom record — shown by id
 *     rather than dropped;
 *  4. slots without a day/period do not create a row (they are counted in the
 *     summary instead).
 */
export function rowsFor(school) {
  if (!school) return [];
  ensureStyles();
  const slots = supervisionSlots(school).filter(s => s.placed && s.areaId);
  const conflicts = conflictsBySup(school);

  const byArea = new Map();
  const ensure = (areaId) => {
    if (!byArea.has(areaId)) {
      const room = classroomById(school)[areaId];
      byArea.set(areaId, {
        key: areaId,
        label: rowLabel(school, areaId),
        sub: "",
        duties: 0,
        conflicts: 0,
        breaks: 0,
        needsSupervision: !!(room && room.needsSupervision),
        assigned: false,
        room: !!room,
      });
    }
    return byArea.get(areaId);
  };

  for (const s of slots) {
    const row = ensure(s.areaId);
    row.duties++;
    row.assigned = true;
    if (s.break) row.breaks++;
    if (conflicts[s.supId] && conflicts[s.supId].length) row.conflicts++;
  }

  for (const room of (school.classrooms || [])) {
    if (room && room.needsSupervision) ensure(room.id);
  }

  const order = new Map((school.classrooms || []).map((r, i) => [r.id, i]));
  const rows = [...byArea.values()].sort((a, b) => {
    const ai = order.has(a.key) ? order.get(a.key) : Number.MAX_SAFE_INTEGER;
    const bi = order.has(b.key) ? order.get(b.key) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return String(a.key).localeCompare(String(b.key));
  });

  for (const row of rows) {
    const bits = [];
    if (row.duties) {
      bits.push(row.duties + (row.duties === 1 ? " duty" : " duties"));
      if (row.conflicts) bits.push(row.conflicts + (row.conflicts === 1 ? " conflict" : " conflicts"));
      if (row.breaks) bits.push(row.breaks + " at break");
    } else {
      bits.push("needs supervision · none assigned");
    }
    row.sub = bits.join(" · ");
  }
  return rows;
}

/**
 * Counts for the overview bar and for anything that needs a truthful headline.
 */
export function supervisionSummary(school) {
  const slots = supervisionSlots(school);
  const placed = slots.filter(s => s.placed && s.areaId);
  const conflicts = detectSupervisionConflicts(school);
  const conflictedSupIds = new Set(conflicts.map(c => c.supId));
  const areaIds = new Set(placed.map(s => s.areaId));
  let unassigned = 0;
  for (const room of (school && school.classrooms) || []) {
    // A classroom with no id cannot be matched against slots or the grid.
    if (room && room.needsSupervision && room.id && !areaIds.has(room.id)) unassigned++;
  }
  return {
    // `areas` is what the view actually shows as rows, so the overview bar can
    // never disagree with the row count on screen.
    areas: rowsFor(school).length,
    slots: slots.length,
    duties: placed.length,
    conflicts: conflictedSupIds.size,
    breakDuties: slots.filter(s => s.break && s.placed).length,
    unassigned,
    withoutSlot: slots.length - placed.length,
  };
}

/* ── Chip rendering ─────────────────────────────────────────────────────── */

/* One stylesheet for the view, injected once.  It lives here rather than in a
   css/ file because this lane owns only js/ui/editor/supervision_view.js —
   five lanes are editing css/ in parallel. */
const STYLE_ID = "chrx-supervision-style";
const CSS = `
.chrx-sup-chip{position:absolute;inset:1px;border-radius:6px;padding:4px 5px 4px 6px;display:flex;flex-direction:column;justify-content:center;gap:1px;overflow:hidden;font-size:11px;line-height:1.15;text-align:left;background:#eef2ff;border:1px solid rgba(15,23,42,.16);color:#0f172a;}
.chrx-sup-chip__teacher{font-weight:700;white-space:normal;overflow-wrap:anywhere;}
.chrx-sup-chip__tag{font-size:9px;text-transform:uppercase;letter-spacing:.04em;opacity:.75;}
.chrx-sup-chip__warn{font-size:9px;font-weight:700;color:#b42318;white-space:normal;overflow-wrap:anywhere;}
.chrx-sup-chip--compact{align-items:center;padding:2px;}
.chrx-sup-chip--compact .chrx-sup-chip__teacher{font-size:11px;text-align:center;}
.chrx-sup-chip--conflict{background:#fee4e2;border-color:#b42318;box-shadow:inset 0 0 0 1px #b42318;}
.chrx-sup-chip--conflict .chrx-sup-chip__teacher{color:#7a271a;}
.chrx-sup-gap{box-shadow:inset 0 0 0 1px rgba(148,163,184,.30);}
.chrx-sup-gap--required{box-shadow:inset 0 0 0 1px rgba(217,119,6,.55);}
.chrx-sup-hint{color:#8a5a00;}
`;
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function hueOf(str) {
  let hsh = 0;
  for (let i = 0; i < String(str).length; i++) hsh = (hsh * 31 + String(str).charCodeAt(i)) % 360;
  return hsh;
}

/** A readable chip background/accent pair from the teacher's colour. */
function chipColors(teacherId, school) {
  const t = teacherById(school)[teacherId];
  const rgb = hexToRgb(t && t.color);
  if (rgb) {
    const [r, g, b] = rgb;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return {
      bg: "rgba(" + r + "," + g + "," + b + "," + (lum > 0.6 ? "0.30" : "0.22") + ")",
      accent: t.color,
    };
  }
  const hue = hueOf(teacherId);
  return { bg: "hsl(" + hue + " 62% 90%)", accent: "hsl(" + hue + " 60% 45%)" };
}

/** "Ms. Anita Sharma" → "AS" — the supervision equivalent of a subject code. */
export function teacherInitials(name) {
  const cleaned = String(name || "").replace(/^(mr|mrs|ms|miss|dr|shri|smt|sri)\.?\s+/i, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * The supervision cell chip.  Deliberately NOT a `.chrx-vkarta`: it is not a
 * timetable card, so pickup/drag/double-click/context-menu handlers (which all
 * look for `.chrx-vkarta`) never reach it.
 *
 * `opts.compact` is set for the all-areas overview, where a cell is ~30px wide
 * and a full teacher name cannot fit — the same reason the lesson grid shows
 * subject codes there.  Compact shows the teacher's initials; the full name
 * stays in the title, the aria-label and `data-teacher-name`.
 */
export function supervisionChipHtml(chip, school, opts) {
  if (!chip) return "";
  ensureStyles();
  const compact = !!(opts && opts.compact);
  const conflicts = chip.conflicts || [];
  const types = new Set(conflicts.map(c => c.type));
  const cls = ["chrx-sup-chip"];
  if (conflicts.length) cls.push("chrx-sup-chip--conflict");
  if (types.has("teaching")) cls.push("chrx-sup-chip--teaching");
  if (types.has("double")) cls.push("chrx-sup-chip--double");
  if (chip.break) cls.push("chrx-sup-chip--break");
  if (compact) cls.push("chrx-sup-chip--compact");

  const colors = chipColors(chip.teacherId, school || (typeof window !== "undefined" ? window.APP && window.APP.school : null));
  const title = [
    chip.teacherName + " · " + chip.areaName,
    DAYS[chip.day] != null ? DAYS[chip.day] + " period " + chip.period : "",
    chip.break ? "break duty" : "",
    ...conflicts.map(c => "⚠ " + c.detail),
  ].filter(Boolean).join(" — ");
  const conflictText = conflicts.map(c => c.type + ": " + c.detail).join(" | ");
  const aria = chip.teacherName +
    (chip.break ? " (break duty)" : "") + " supervising " + chip.areaName +
    (conflicts.length ? ", " + conflicts.map(c => c.detail).join("; ") : "");

  const label = compact ? teacherInitials(chip.teacherName) : chip.teacherName;
  // The teacher's colour is the chip's accent; a conflicting duty gets the
  // red class treatment instead of the tint, so a clash is unmissable.
  const style = conflicts.length
    ? "border-left:3px solid #b42318;"
    : "background:" + colors.bg + ";border-left:3px solid " + colors.accent + ";";

  return `<div class="${cls.join(" ")}" data-sup-id="${esc(chip.supId)}" data-area-id="${esc(chip.areaId)}" data-teacher-id="${esc(chip.teacherId)}" data-teacher-name="${esc(chip.teacherName)}" data-day="${chip.day}" data-period="${chip.period}"${conflictText ? ` data-conflict="${esc(conflictText)}"` : ""} title="${esc(title)}" aria-label="${esc(aria)}" role="img" style="${style}">`
    + `<span class="chrx-sup-chip__teacher">${esc(label)}</span>`
    + (chip.break && !compact
      ? `<span class="chrx-sup-chip__tag">Break duty</span>`
      : "")
    + (conflicts.length
      ? `<span class="chrx-sup-chip__warn">⚠${compact ? "" : " " + esc(conflicts.map(c => c.type === "teaching" ? "Teaching now" : "Two areas").join(" + "))}</span>`
      : "")
    + `</div>`;
}

/**
 * Test hook — seed three supervision slots into whatever school is loaded.
 *
 * The bundled demo ships no `classroomsupervisions` rows (EduPage's own live
 * project has zero as well), so the e2e flow needs a fixture.  One of the three
 * deliberately lands on a slot where that teacher already teaches, so the
 * conflict highlight is exercised end to end.  Writes go through APP.mutate so
 * the seeded rows are undoable like any other edit.  Idempotent.
 */
export function seedFixture(school) {
  if (!school) return [];
  if (!Array.isArray(school.classroomsupervisions)) school.classroomsupervisions = [];
  if (school.classroomsupervisions.length) return school.classroomsupervisions;

  const lessonById = (school._idx && school._idx.lessonById) || {};
  const cards = (school.cards || []).slice().sort((a, b) => (a.day - b.day) || (a.period - b.period));
  const teachingCard = cards.find(c => {
    const l = lessonById[c.lessonId];
    return l && (l.teacherIds || []).length > 0;
  });

  const rooms = school.classrooms || [];
  const roomA = rooms[0];
  const roomB = rooms[1] || rooms[0];
  const roomC = rooms[2] || rooms[0];
  if (!roomA) return [];

  // Two of the three slots are picked from slots where that teacher is free, so
  // the fixture has exactly one clash and a reviewer can tell a highlighted
  // clash from a clean duty at a glance.
  const occupied = teachingOccupancy(school);
  const used = Object.create(null);
  const days = Math.max(1, Math.min(6, (school.daysPerWeek | 0) || 6));
  const periods = ((school.bell && school.bell.periods) || []).length || 8;
  const freeSlot = (teacherId) => {
    for (let d = 0; d < days; d++) {
      for (let p = 1; p <= periods; p++) {
        const key = teacherId + "|" + d + "|" + p;
        if (!occupied[key] && !used[key]) { used[key] = true; return { day: d, period: p }; }
      }
    }
    return null;
  };

  const rows = [];
  if (teachingCard) {
    // 1. The same (teacher, day, period) as a real lesson → clashes with teaching.
    const teacherId = lessonById[teachingCard.lessonId].teacherIds[0];
    used[teacherId + "|" + teachingCard.day + "|" + teachingCard.period] = true;
    rows.push({ classroomid: roomA.id, teacherid: teacherId,
      day: teachingCard.day, period: teachingCard.period });
  }
  const otherTeacher = (school.teachers || []).find(t => !teachingCard || t.id !== lessonById[teachingCard.lessonId].teacherIds[0]);
  const t3 = (school.teachers || [])[2] || otherTeacher;
  const slotB = otherTeacher ? freeSlot(otherTeacher.id) : null;
  if (otherTeacher && slotB) {
    rows.push(Object.assign({ classroomid: roomB.id, teacherid: otherTeacher.id }, slotB));
  }
  const slotC = t3 ? freeSlot(t3.id) : null;
  if (t3 && slotC) {
    rows.push(Object.assign({ classroomid: roomC.id, teacherid: t3.id, break: 1 }, slotC));
  }

  const payload = rows.map((r, i) => Object.assign({ id: "sup_fixture_" + (i + 1) }, r));
  const apply = (s) => {
    for (const p of payload) {
      if (!s.classroomsupervisions.some(x => x.id === p.id)) s.classroomsupervisions.push(Object.assign({}, p));
    }
  };
  if (window.APP && typeof window.APP.mutate === "function") window.APP.mutate("Add example supervisions", apply);
  else apply(school);

  if (typeof document !== "undefined" && document.dispatchEvent) {
    document.dispatchEvent(new CustomEvent("app:school-changed", { detail: { label: "Add example supervisions", source: "mutate" } }));
    const host = document.querySelector(".chrx-editor");
    if (host && window.Editor && typeof window.Editor.render === "function") window.Editor.render(host);
  }
  return school.classroomsupervisions;
}

// Global exposure for non-ESM / legacy caller paths
if (typeof window !== "undefined") {
  window.SupervisionView = {
    getSupervisions,
    supervisionSlots,
    detectSupervisionConflicts,
    buildSupervisionLookup,
    rowsFor,
    supervisionSummary,
    supervisionChipHtml,
    teacherInitials,
    seedFixture,
  };
}
