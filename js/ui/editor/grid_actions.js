// Grid actions from aSc's editor menus that Chronexa lacked:
//   "Remove timetable — unlocked cards", "remove only classrooms",
//   "Empty the classroom", "Merge 2 singles into double".
// Pure functions over a school; callers wrap them in APP.mutate so they
// land on the undo stack. Locked cards are never touched.

const baseId = (id) => String(id).replace(/#\d+$/, "");

// aSc ids are 16 upper-case hex digits; new lessons follow suit so XML export round-trips.
function newAscId() {
  const b = new Uint8Array(8);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 8; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function lessonIndex(school) {
  return (school._idx && school._idx.lessonById) ||
    Object.fromEntries((school.lessons || []).map((l) => [l.id, l]));
}

/** Predicate: does this card belong to the row (perspective, rowId)? null rowId = every card. */
export function rowMatcher(school, perspective, rowId) {
  if (rowId == null) return () => true;
  const byId = lessonIndex(school);
  return (card) => {
    const l = byId[card.lessonId] || byId[baseId(card.lessonId)];
    if (perspective === "room") return card.classroomId === rowId;
    if (!l) return false;
    if (perspective === "class")   return (l.classIds || []).includes(rowId);
    if (perspective === "teacher") return (l.teacherIds || []).includes(rowId);
    if (perspective === "subject") return l.subjectId === rowId;
    return false;
  };
}

/** Unplace every unlocked card the predicate selects. Returns how many. */
export function removeUnlockedCards(school, match) {
  const before = (school.cards || []).length;
  school.cards = (school.cards || []).filter((c) => c.locked || !match(c));
  return before - school.cards.length;
}

/** Drop the classroom from every unlocked card the predicate selects. Returns how many. */
export function clearClassrooms(school, match) {
  let n = 0;
  for (const c of school.cards || []) {
    if (c.locked || !c.classroomId || !match(c)) continue;
    c.classroomId = null;
    n++;
  }
  return n;
}

/**
 * Merge the single card at (day, period) with the same lesson's single card in
 * the next period into one double. The lesson is split: the double becomes a
 * new lesson of 2 periods × 1 card; the rest stay singles. Returns
 * { ok, reason?, lessonId? }.
 */
export function mergeSinglesToDouble(school, lessonId, day, period) {
  const id = baseId(lessonId);
  // Look up through school.lessons, not _idx: inside APP.mutate only the
  // school's own arrays are tracked, so a write via the index is lost.
  const lesson = (school.lessons || []).find((l) => l.id === id);
  if (!lesson) return { ok: false, reason: "Lesson not found." };
  if ((lesson.periodsPerCard | 0) > 1) return { ok: false, reason: "This card is already longer than one period." };
  const cards = school.cards || [];
  const same = (c, p) => baseId(c.lessonId) === id && c.day === day && c.period === p;
  const a = cards.find((c) => same(c, period));
  const b = cards.find((c) => same(c, period + 1));
  if (!a || !b) return { ok: false, reason: "The next period must hold another card of the same lesson." };
  if (a.locked || b.locked) return { ok: false, reason: "Unlock both cards first." };
  const total = lesson.periodsPerWeek | 0;
  if (total < 2) return { ok: false, reason: "The lesson has fewer than 2 periods." };

  let doubleId = id;
  if (total === 2) {
    lesson.periodsPerCard = 2;
    lesson.lessonLength = 2;
  } else {
    lesson.periodsPerWeek = total - 2;
    doubleId = newAscId();
    const dbl = { ...lesson, id: doubleId, periodsPerWeek: 2, periodsPerCard: 2, lessonLength: 2 };
    school.lessons.splice(school.lessons.indexOf(lesson) + 1, 0, dbl);
    if (school._idx && school._idx.lessonById) school._idx.lessonById[doubleId] = dbl;
  }
  school.cards = cards.filter((c) => c !== a && c !== b);
  school.cards.push({ lessonId: doubleId, day, period, classroomId: a.classroomId || b.classroomId || null });
  return { ok: true, lessonId: doubleId };
}
