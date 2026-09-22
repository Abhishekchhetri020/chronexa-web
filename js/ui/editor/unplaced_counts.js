/**
 * Canonical pure calculation of unplaced lessons per class.
 *
 * Rules:
 *  - Needed = Math.ceil(periodsPerWeek / lessonLength).
 *  - Placed = count of cards matching lessonId.
 *  - Missing = Math.max(0, needed - placed).
 *  - Joint lessons: each participating class receives the full missing count once
 *    (e.g., a missing joint lesson with classIds ['c1', 'c2'] counts once for c1 and once for c2).
 *  - Returns a plain dictionary mapping classId -> count (> 0). Classes with 0 unplaced are omitted.
 */

export function computeUnplacedCountsByClass(school) {
  if (!school || !Array.isArray(school.lessons)) return {};

  const placedCounts = Object.create(null);
  for (const card of (school.cards || [])) {
    if (card && card.lessonId) {
      placedCounts[card.lessonId] = (placedCounts[card.lessonId] || 0) + 1;
    }
  }

  const countsByClass = {};

  for (const lesson of school.lessons) {
    if (!lesson) continue;
    const len = lesson.lessonLength || (lesson.isLabDouble ? 2 : 1) || 1;
    const ppw = Math.ceil(lesson.periodsPerWeek || 0);
    const needed = ppw > 0 ? Math.max(1, Math.round(ppw / len)) : 0;
    const placed = placedCounts[lesson.id] || 0;
    const missing = Math.max(0, needed - placed);
    if (missing <= 0) continue;

    const classIds = Array.isArray(lesson.classIds) && lesson.classIds.length > 0
      ? lesson.classIds
      : (lesson.classId ? [lesson.classId] : []);

    for (const cid of classIds) {
      if (!cid) continue;
      countsByClass[cid] = (countsByClass[cid] || 0) + missing;
    }
  }

  return countsByClass;
}

export function getUnplacedCountForClass(schoolOrCounts, classId) {
  if (!schoolOrCounts || !classId) return 0;
  if (typeof schoolOrCounts === "object" && !Array.isArray(schoolOrCounts)) {
    // If it's already a counts map:
    if (!("lessons" in schoolOrCounts)) {
      return Number(schoolOrCounts[classId]) || 0;
    }
  }
  const counts = computeUnplacedCountsByClass(schoolOrCounts);
  return Number(counts[classId]) || 0;
}

export function formatClassUnplacedCount(count) {
  const n = Number(count) || 0;
  return n > 0 ? String(n) : "";
}

if (typeof window !== "undefined") {
  window.UnplacedCounts = {
    computeUnplacedCountsByClass,
    getUnplacedCountForClass,
    formatClassUnplacedCount,
  };
}
