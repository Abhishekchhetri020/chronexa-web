/**
 * Placement — real-time validity classifier for the in-hand card.
 *
 * Mirrors the seven hard constraints from js/solver/constraints.js
 * (Agent C) but stays pure-client: no solver call, no async work, no
 * allocation in the hot path. Caller (card_in_hand.js) throttles invocations
 * to ≤ 1 per 16ms; classify itself runs in single-digit microseconds.
 *
 * Returns:
 *   { validity: "green"|"amber"|"red", reasons: string[] }
 *
 * Validity ladder:
 *   red    — any hard constraint fails (teacher/class/room busy, time-off
 *            "unavailable", required-room-type mismatch, fixed-slot mismatch,
 *            lab-double can't fit in two consecutive teaching periods).
 *   amber  — placement legal but breaks a soft preference (teacher time-off
 *            marked "preferred" off, period flagged non-teaching).
 *   green  — clean placement.
 */
(function () {
  "use strict";

  function classify(lessonId, day, period, classroomId) {
    const S = window.APP && window.APP.school;
    if (!S) return { validity: "green", reasons: [] };
    const idx = S._idx;
    const lesson = idx.lessonById[lessonId];
    if (!lesson) return { validity: "red", reasons: ["unknown lesson"] };

    const reasons = [];
    let level = 0; // 0=green, 1=amber, 2=red
    const flag = (lvl, msg) => { if (lvl > level) level = lvl; reasons.push(msg); };

    // 1. Fixed-slot mismatch (hard).
    if (lesson.fixedDay != null && lesson.fixedDay !== day) {
      flag(2, `fixed day ${dayLabel(lesson.fixedDay)}`);
    }
    if (lesson.fixedPeriod != null && lesson.fixedPeriod !== period) {
      flag(2, `fixed period ${lesson.fixedPeriod}`);
    }

    // 2. Period must be a teaching period for hard placement; non-teaching is amber.
    const periodObj = (S.bell.periods || []).find(p => p.index === period);
    if (periodObj && periodObj.isTeaching === false) {
      flag(1, `${periodObj.label || "P" + period} is non-teaching`);
    }

    // 2b. Per-class bell check (Top-30 #3). If any class on this lesson has a
    // bellId whose periods don't include this period, the placement is hard-
    // invalid — matches csp_solver.canPlace's FAIL.CLASS_BELL_PERIOD_INVALID.
    if (window.BellResolver) {
      for (const cid of (lesson.classIds || [])) {
        const bell = window.BellResolver.forClass(S, cid);
        if (bell && Array.isArray(bell.periods) &&
            !bell.periods.some(p => (p.index | 0) === (period | 0))) {
          const cls = idx.classById[cid];
          flag(2, `${cls ? cls.name : cid} bell has no period ${period}`);
        }
      }
    }

    // Build a per-(day,period) occupancy view from S.cards. Cheap enough at
    // editor sizes (≤ ~2000 cards); avoids the cost of maintaining a live
    // index that lessons/edit dialogs would have to keep in sync.
    const sameSlot = S.cards.filter(c => c.day === day && c.period === period);

    // 3. Class conflicts (hard).
    const myClasses = new Set(lesson.classIds || []);
    for (const c of sameSlot) {
      const other = idx.lessonById[c.lessonId];
      if (!other) continue;
      for (const cid of (other.classIds || [])) {
        if (myClasses.has(cid)) {
          const cls = idx.classById[cid];
          flag(2, `class ${cls ? cls.name : cid} busy`);
          break;
        }
      }
    }

    // 4. Teacher conflicts (hard) + teacher unavailable (hard) / preferred (amber).
    for (const tid of (lesson.teacherIds || [])) {
      const teacher = idx.teacherById[tid];
      for (const c of sameSlot) {
        const other = idx.lessonById[c.lessonId];
        if (other && (other.teacherIds || []).includes(tid)) {
          flag(2, `teacher ${teacher ? (teacher.abbr || teacher.name) : tid} busy`);
          break;
        }
      }
      if (teacher && teacher.timeOff) {
        const key = day + "_" + period;
        const mark = teacher.timeOff[key];
        if (mark === "unavailable") {
          flag(2, `teacher ${teacher.abbr || teacher.name} unavailable`);
        } else if (mark === "preferred") {
          flag(1, `teacher ${teacher.abbr || teacher.name} prefers off`);
        }
      }
    }

    // 5. Room conflict + required-room-type (hard).
    const rid = classroomId || lesson.preferredRoomId;
    if (rid) {
      for (const c of sameSlot) {
        const otherRid = c.classroomId || idx.lessonById[c.lessonId]?.preferredRoomId;
        if (otherRid === rid) {
          const room = idx.classroomById[rid];
          flag(2, `room ${room ? room.name : rid} busy`);
          break;
        }
      }
      if (lesson.requiredRoomType) {
        const room = idx.classroomById[rid];
        if (room && room.roomType && room.roomType !== lesson.requiredRoomType) {
          flag(2, `room type ${lesson.requiredRoomType} required`);
        }
      }
    } else if (lesson.requiredRoomType) {
      flag(2, `room type ${lesson.requiredRoomType} required`);
    }

    // 6. Lab-double: needs `period+1` also free (hard).
    if (lesson.isLabDouble) {
      const periods = S.bell.periods || [];
      const next = periods.find(p => p.index === period + 1);
      if (!next || next.isTeaching === false) {
        flag(2, "lab needs consecutive period");
      } else {
        const next2 = S.cards.filter(c => c.day === day && c.period === period + 1);
        // Re-check class/teacher/room conflict at period+1 (only the strict trio).
        const labClassBusy = next2.some(c =>
          (idx.lessonById[c.lessonId]?.classIds || []).some(cid => myClasses.has(cid)));
        if (labClassBusy) flag(2, "lab P+1: class busy");
        const myTeachers = new Set(lesson.teacherIds || []);
        const labTeacherBusy = next2.some(c =>
          (idx.lessonById[c.lessonId]?.teacherIds || []).some(tid => myTeachers.has(tid)));
        if (labTeacherBusy) flag(2, "lab P+1: teacher busy");
        if (rid) {
          const labRoomBusy = next2.some(c =>
            (c.classroomId || idx.lessonById[c.lessonId]?.preferredRoomId) === rid);
          if (labRoomBusy) flag(2, "lab P+1: room busy");
        }
      }
    }

    return {
      validity: level === 2 ? "red" : level === 1 ? "amber" : "green",
      reasons,
    };
  }

  function dayLabel(d) {
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] || "D" + d;
  }

  window.Placement = { classify };
})();
