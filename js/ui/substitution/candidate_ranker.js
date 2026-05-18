/**
 * Candidate ranker — pure scoring algorithm.
 *
 * Ported from Code.gs / Index.html (GDGPSD Substitution Planner). Operates
 * directly on SchoolData (no spreadsheet round-trip).
 *
 * Scoring (per requirements):
 *   +100  same subject as the cancelled class
 *   +30   teacher already teaches this class section on other periods
 *   -5    per substitution already assigned to candidate today
 *   +5    free in the next period too (continuity bonus)
 *
 * Inputs:
 *   school        SchoolData (post parseAscXml)
 *   absentIds[]   teacher IDs absent that day
 *   day           0..5 (Mon..Sat) — matches school._idx.cardsByTeacher day index
 *
 * Returns assignments[]: one per (absent teacher, period) where they had a card.
 *   {
 *     slotKey, classSection, classId, period, subject, subjectId,
 *     originalTeacher, originalTeacherId,
 *     candidates: [{teacher, teacherId, score, reasons:[]}],
 *     chosen: <candidate or null>,
 *     uncovered: bool,
 *   }
 */
(function () {
  "use strict";

  function rankAll(school, absentIds, day) {
    if (!school || !school._idx) return [];
    const absentSet = new Set(absentIds);
    const teachers = school.teachers || [];
    const idx = school._idx;

    // 1) Collect target slots: every card on `day` belonging to an absent teacher.
    const slots = [];
    for (const tid of absentIds) {
      const tCards = idx.cardsByTeacher[tid] || [];
      for (const c of tCards) {
        if (c.day !== day) continue;
        slots.push({
          teacherId: tid,
          teacherName: (idx.teacherById[tid]?.name) || tid,
          period: c.period,
          classId: (c.classIds || [])[0] || "",
          classSection: (c.classes || [])[0] || "",
          subjectId: c.subjectId || "",
          subject: c.subject || "",
          lessonId: c.lessonId,
        });
      }
    }
    slots.sort((a, b) => a.period - b.period ||
                        String(a.classSection).localeCompare(String(b.classSection)));

    // 2) Pre-compute teacher → set of periods they are busy on this day.
    const busyByTeacher = Object.create(null);
    teachers.forEach(t => { busyByTeacher[t.id] = new Set(); });
    for (const t of teachers) {
      for (const c of (idx.cardsByTeacher[t.id] || [])) {
        if (c.day === day) busyByTeacher[t.id].add(c.period);
      }
    }
    // 3) Teacher → set of subjectIds they ever teach (used for +100 same subject).
    const subjectsByTeacher = Object.create(null);
    // 4) Teacher → set of classIds they ever teach (used for +30 same class).
    const classesByTeacher = Object.create(null);
    for (const t of teachers) {
      const ss = new Set(); const cs = new Set();
      for (const c of (idx.cardsByTeacher[t.id] || [])) {
        if (c.subjectId) ss.add(c.subjectId);
        (c.classIds || []).forEach(cid => cs.add(cid));
      }
      subjectsByTeacher[t.id] = ss;
      classesByTeacher[t.id] = cs;
    }

    // 5) Running tally of substitutions already assigned today
    //    (mutates as we process slots in order so later slots see earlier picks).
    const subsToday = Object.create(null);

    const assignments = [];
    for (const slot of slots) {
      const candidates = [];
      const slotKey = `${slot.period}::${slot.classId || slot.classSection}::${slot.teacherId}`;

      for (const t of teachers) {
        if (absentSet.has(t.id)) continue;
        if (busyByTeacher[t.id].has(slot.period)) continue;

        let score = 0;
        const reasons = [];

        if (slot.subjectId && subjectsByTeacher[t.id].has(slot.subjectId)) {
          score += 100;
          reasons.push("same subject");
        }
        if (slot.classId && classesByTeacher[t.id].has(slot.classId)) {
          score += 30;
          reasons.push("teaches this class");
        }
        const already = subsToday[t.id] || 0;
        if (already > 0) {
          score -= 5 * already;
          reasons.push(`${already} sub${already === 1 ? "" : "s"} today`);
        }
        if (!busyByTeacher[t.id].has(slot.period + 1)) {
          score += 5;
          reasons.push("free next period");
        }

        candidates.push({
          teacherId: t.id,
          teacher: t.name || t.id,
          abbr: t.abbr || "",
          score,
          reasons,
        });
      }

      candidates.sort((a, b) => b.score - a.score ||
                                a.teacher.localeCompare(b.teacher));
      const top3 = candidates.slice(0, 3);
      const chosen = top3[0] || null;
      if (chosen) {
        subsToday[chosen.teacherId] = (subsToday[chosen.teacherId] || 0) + 1;
      }

      assignments.push({
        slotKey,
        classSection: slot.classSection,
        classId: slot.classId,
        period: slot.period,
        subject: slot.subject,
        subjectId: slot.subjectId,
        originalTeacher: slot.teacherName,
        originalTeacherId: slot.teacherId,
        candidates: top3,
        allCandidates: candidates, // kept for "change substitute" UI
        chosen,
        uncovered: !chosen,
      });
    }

    return assignments;
  }

  /**
   * Recompute `chosen` for one assignment after the user picks a different
   * candidate. Also updates the subsToday tally so subsequent reranks reflect
   * the new choice. (Used by classwise_output.)
   */
  function reassign(assignments, slotKey, newTeacherId) {
    const a = assignments.find(x => x.slotKey === slotKey);
    if (!a) return;
    const pick = (a.allCandidates || a.candidates).find(c => c.teacherId === newTeacherId);
    if (!pick) return;
    a.chosen = pick;
    a.uncovered = false;
  }

  window.SubstitutionRanker = { rankAll, reassign };
})();
