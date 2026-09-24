/**
 * W2-2 published-viewer: snapshot validation (contract C2).
 *
 * Pure functions, no DOM — unit-tested in __tests__/viewer.test.js.
 * The writer (lane W2-3, Publish dialog) produces snapshots against the same
 * contract; the reader must reject anything else with a *clear error screen*,
 * never a blank page (boot.js / render() handle the UI side).
 */

export const SNAPSHOT_FORMAT = "chronexa-published";
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_EDITIONS = ["staff", "students", "public"];

/**
 * Validate a published snapshot object.
 * @param {*} snap parsed JSON
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSnapshot(snap) {
  const errors = [];
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
    return { ok: false, errors: ["Snapshot must be a JSON object."] };
  }
  if (snap.format !== SNAPSHOT_FORMAT) {
    errors.push(
      `Bad snapshot format: expected "format": ${JSON.stringify(SNAPSHOT_FORMAT)}, ` +
      `got ${JSON.stringify(snap.format)}.`
    );
  }
  if (snap.version !== SNAPSHOT_VERSION) {
    errors.push(
      `Unsupported snapshot version ${JSON.stringify(snap.version)}: ` +
      `this viewer reads version ${SNAPSHOT_VERSION}.`
    );
  }
  if (!SNAPSHOT_EDITIONS.includes(snap.edition)) {
    errors.push(
      `Unknown edition ${JSON.stringify(snap.edition)}: ` +
      `expected one of ${SNAPSHOT_EDITIONS.join(", ")}.`
    );
  }
  if (!snap.school || typeof snap.school !== "object") {
    errors.push(`Missing "school" info object.`);
  } else if (!snap.school.name) {
    errors.push(`Missing "school.name".`);
  }

  const dayIdx = new Set();
  if (!Array.isArray(snap.days) || snap.days.length === 0) {
    errors.push(`Snapshot needs a non-empty "days" array.`);
  } else {
    snap.days.forEach((d, i) => {
      if (!d || typeof d.index !== "number" || !d.name) {
        errors.push(`days[${i}] needs {index, name}.`);
      } else {
        dayIdx.add(d.index);
      }
    });
  }

  const periodIdx = new Set();
  if (!Array.isArray(snap.periods) || snap.periods.length === 0) {
    errors.push(`Snapshot needs a non-empty "periods" array.`);
  } else {
    snap.periods.forEach((p, i) => {
      if (!p || typeof p.index !== "number" || !p.label) {
        errors.push(`periods[${i}] needs {index, label}.`);
      } else {
        periodIdx.add(p.index);
      }
    });
  }

  const classIds = new Set();
  if (!Array.isArray(snap.classes) || snap.classes.length === 0) {
    errors.push(`Snapshot needs a non-empty "classes" array.`);
  } else {
    snap.classes.forEach((c, i) => {
      if (!c || typeof c.id !== "string" || !c.name) {
        errors.push(`classes[${i}] needs {id, name}.`);
      } else {
        classIds.add(c.id);
      }
    });
  }

  const subjectIds = new Set();
  for (const s of snap.subjects || []) {
    if (s && typeof s.id === "string") subjectIds.add(s.id);
  }

  // Teachers / classrooms may be omitted in restricted editions (e.g. public
  // hides teachers). When omitted, lessons must not reference hidden ids.
  const hasTeachers = Array.isArray(snap.teachers) && snap.teachers.length > 0;
  const teacherIds = new Set((snap.teachers || []).map((t) => t && t.id));
  const hasRooms = Array.isArray(snap.classrooms) && snap.classrooms.length > 0;
  const roomIds = new Set((snap.classrooms || []).map((r) => r && r.id));

  if (!Array.isArray(snap.lessons)) {
    errors.push(`Missing "lessons" array.`);
  } else {
    snap.lessons.forEach((l, i) => {
      const at = `lessons[${i}]`;
      if (!l || typeof l !== "object") { errors.push(`${at} must be an object.`); return; }
      if (!dayIdx.has(l.day)) errors.push(`${at}: day ${JSON.stringify(l.day)} is not in "days".`);
      if (!periodIdx.has(l.period)) errors.push(`${at}: period ${JSON.stringify(l.period)} is not in "periods".`);
      if (typeof l.subjectId !== "string" || !subjectIds.has(l.subjectId)) {
        errors.push(`${at}: unknown subjectId ${JSON.stringify(l.subjectId)}.`);
      }
      for (const c of l.classIds || []) {
        if (!classIds.has(c)) { errors.push(`${at}: unknown classId ${JSON.stringify(c)}.`); break; }
      }
      for (const t of l.teacherIds || []) {
        if (!hasTeachers) { errors.push(`${at} names a teacher but the snapshot has no "teachers".`); break; }
        if (!teacherIds.has(t)) { errors.push(`${at}: unknown teacherId ${JSON.stringify(t)}.`); break; }
      }
      for (const r of l.classroomIds || []) {
        if (!hasRooms) { errors.push(`${at} names a classroom but the snapshot has no "classrooms".`); break; }
        if (!roomIds.has(r)) { errors.push(`${at}: unknown classroomId ${JSON.stringify(r)}.`); break; }
      }
    });
  }

  // Optional sections: shape-checked lightly, never fatal to the grid.
  if (snap.breaks !== undefined) {
    if (!Array.isArray(snap.breaks)) {
      errors.push(`"breaks" must be an array.`);
    } else {
      snap.breaks.forEach((b, i) => {
        if (!b || typeof b.afterPeriod !== "number" || !b.label) {
          errors.push(`breaks[${i}] needs {afterPeriod, label}.`);
        }
      });
    }
  }
  if (snap.changes !== undefined) {
    if (!Array.isArray(snap.changes)) {
      errors.push(`"changes" must be an array.`);
    } else {
      snap.changes.forEach((c, i) => {
        if (!c || typeof c !== "object" || typeof c.date !== "string" ||
            typeof c.day !== "number" || typeof c.period !== "number" ||
            typeof c.absentTeacherId !== "string" ||
            !("substituteTeacherId" in c)) {
          errors.push(
            `changes[${i}] needs {date, day, period, absentTeacherId, substituteTeacherId}.`
          );
        }
      });
    }
  }

  return { ok: errors.length === 0, errors };
}
