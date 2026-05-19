/**
 * Classic Timetable XML → SchoolData (per docs/DATA_SHAPES.md).
 *
 * Browser-side only — no upload, all parsing in the user's tab.
 *
 * Output shape:
 *   {
 *     schoolName, bell:{periods:[...]},
 *     teachers, classes, classrooms, subjects, lessons,
 *     cards: [{lessonId, day, period, classroomId?}],   // placed cards from the XML
 *     _idx: {                                            // viewer-only indexes
 *       teacherById, classById, classroomById, subjectById, lessonById,
 *       cardsByClass:  {classId:  [{day,period,subject,teacher,classroom,lessonId}]},
 *       cardsByTeacher:{teacherId:[{day,period,subject,classes,classroom,lessonId}]},
 *       cardsByRoom:   {roomId:   [{day,period,subject,teacher,classes,lessonId}]}
 *     }
 *   }
 *
 * Day indexing matches DATA_SHAPES.md: 0=Mon..5=Sat (CLASSIC daysdef bit positions).
 * Period indexing is 1-based to mirror <card period="N">.
 *
 * Floor-duty supervision "classes" (e.g. "1st Floor") are skipped — same rule
 * as the sitting-planner parser. Cards whose only class is a Floor are dropped.
 */
window.parseTimetableXml = (function () {
  "use strict";

  const DAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SKIP_CLASS_PATTERNS = ["Floor"];

  function attr(el, name) { return el.getAttribute(name) || ""; }
  function pickLabel(el) {
    return (el.getAttribute("short") || el.getAttribute("name") || "").trim();
  }
  function pickName(el) {
    return (el.getAttribute("name") || el.getAttribute("short") || "").trim();
  }
  function timeToMin(t) {
    if (!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  function isFloor(label) {
    return SKIP_CLASS_PATTERNS.some(p => (label || "").includes(p));
  }

  async function parseFile(file) {
    if (!file) throw new Error("No file provided.");
    const text = await file.text();
    return parseText(text, file.name || "sample.xml");
  }

  function parseText(text, sourceName) {
    const xml = new DOMParser().parseFromString(text, "application/xml");
    const errNode = xml.querySelector("parsererror");
    if (errNode) throw new Error("Invalid XML: " + errNode.textContent.slice(0, 200));

    const root = xml.querySelector("timetable");
    const schoolName = root ? (root.getAttribute("displayname") || "") : "";

    // --- Days per week (inferred from daysdefs, mirrors Swift port) ------------
    // CLASSIC's daysdefs has one entry per logical day (Mon, Tue, …) plus aggregate
    // entries ("Any day", "Every day"). A SINGLE-DAY entry has exactly one "1"
    // in its `days` bitmask. We count those to set school.daysPerWeek so the
    // solver's `inferDays()` doesn't fall back to 5 when no cards exist.
    // GD Goenka has 6 single-day entries (Mon-Sat) → 6 × 7 = 42 slots/class
    // and we hit the Swift-port 92%+ placement baseline. Without this, the
    // solver was misreading the school as Mon-Fri and capping at ~75%.
    let daysPerWeek = 0;
    xml.querySelectorAll("daysdefs > daysdef").forEach(d => {
      const days = (d.getAttribute("days") || "").trim();
      // Single-day = no commas (aggregates use comma-separated bitmasks) and
      // exactly one "1" in the bitmask.
      if (days && !days.includes(",")) {
        const ones = (days.match(/1/g) || []).length;
        if (ones === 1) daysPerWeek++;
      }
    });
    if (daysPerWeek === 0) daysPerWeek = 5; // safety: never go below the inferDays default

    // --- Periods (bell schedule from XML, not from local memory) ---------------
    const periods = [];
    xml.querySelectorAll("periods > period").forEach(p => {
      const idx = parseInt(attr(p, "period"), 10);
      if (!idx) return;
      periods.push({
        index: idx,
        label: (p.getAttribute("name") || p.getAttribute("short") || String(idx)).trim(),
        startMin: timeToMin(attr(p, "starttime")),
        endMin:   timeToMin(attr(p, "endtime")),
        isTeaching: true,
      });
    });
    periods.sort((a, b) => a.index - b.index);

    // --- Subjects -------------------------------------------------------------
    const subjects = [];
    const subjectById = Object.create(null);
    xml.querySelectorAll("subjects > subject").forEach(s => {
      const obj = {
        id: attr(s, "id"),
        name: pickName(s),
        abbr: (s.getAttribute("short") || "").trim() || undefined,
      };
      if (!obj.id) return;
      subjects.push(obj);
      subjectById[obj.id] = obj;
    });

    // --- Teachers -------------------------------------------------------------
    const teachers = [];
    const teacherById = Object.create(null);
    xml.querySelectorAll("teachers > teacher").forEach(t => {
      const obj = {
        id: attr(t, "id"),
        name: pickName(t),
        abbr: (t.getAttribute("short") || "").trim() || undefined,
      };
      if (!obj.id) return;
      teachers.push(obj);
      teacherById[obj.id] = obj;
    });

    // --- Classrooms -----------------------------------------------------------
    const classrooms = [];
    const classroomById = Object.create(null);
    xml.querySelectorAll("classrooms > classroom").forEach(r => {
      const cap = (r.getAttribute("capacity") || "").trim();
      const obj = {
        id: attr(r, "id"),
        name: pickName(r),
        capacity: (cap && cap !== "*") ? parseInt(cap, 10) || undefined : undefined,
        roomType: undefined,
      };
      if (!obj.id) return;
      classrooms.push(obj);
      classroomById[obj.id] = obj;
    });

    // --- Classes --------------------------------------------------------------
    // Per spec, the canonical SchoolData "classes" entry is a single record per
    // grade, with sections inside. To stay useful for the viewer (which renders
    // one row per section), we expose one entry per <class id="..."/> directly,
    // with `id` and `name` mirroring the XML. Mother-section grouping can be
    // layered on by other agents later.
    const classes = [];
    const classById = Object.create(null);
    xml.querySelectorAll("classes > class").forEach(c => {
      const name = pickName(c);
      if (!name || isFloor(name)) return;
      const obj = {
        id: attr(c, "id"),
        name,
        sections: undefined,
        _classroomIds: (attr(c, "classroomids") || "").split(",").filter(Boolean),
        _teacherId: attr(c, "teacherid") || undefined,
      };
      if (!obj.id) return;
      classes.push(obj);
      classById[obj.id] = obj;
    });
    // Sort classes by school-order: Nursery, LKG, UKG, then Roman-numeral grades
    classes.sort(classOrder);

    // --- Lessons --------------------------------------------------------------
    // --- Groups (class subdivisions: Boys/Girls, Group 1/Group 2, Entire) ----
    // Without parsing these the solver treats split-group lessons as
    // whole-class conflicts and refuses to schedule simultaneous classes.
    const groups = [];
    const groupById = Object.create(null);
    xml.querySelectorAll("groups > group").forEach(g => {
      const obj = {
        id: attr(g, "id"),
        name: attr(g, "name") || "",
        classId: attr(g, "classid") || "",
        entireClass: attr(g, "entireclass") === "1",
        divisionTag: parseInt(attr(g, "divisiontag"), 10) || 0,
      };
      if (!obj.id) return;
      groups.push(obj);
      groupById[obj.id] = obj;
    });

    const lessons = [];
    const lessonById = Object.create(null);
    xml.querySelectorAll("lessons > lesson").forEach(l => {
      const classIds = (attr(l, "classids") || "").split(",").filter(Boolean);
      const realClassIds = classIds.filter(id => classById[id]);  // drops Floors
      if (realClassIds.length === 0) return;

      const teacherIds = (attr(l, "teacherids") || "").split(",").filter(Boolean)
        .filter(id => teacherById[id]);
      const subjectId  = attr(l, "subjectid");
      const roomIds    = (attr(l, "classroomids") || "").split(",").filter(Boolean);
      const groupIds   = (attr(l, "groupids") || "").split(",").filter(Boolean)
        .filter(id => groupById[id]);

      const obj = {
        id: attr(l, "id"),
        classIds: realClassIds,
        teacherIds,
        subjectId,
        groupIds,
        periodsPerWeek: parseFloat(attr(l, "periodsperweek")) || 0,
        requiredRoomType: undefined,
        preferredRoomId: roomIds[0] || undefined,
        fixedDay: undefined,
        fixedPeriod: undefined,
        isLabDouble: parseInt(attr(l, "periodspercard"), 10) > 1 || undefined,
        _lessonRoomIds: roomIds,
      };
      if (!obj.id) return;
      lessons.push(obj);
      lessonById[obj.id] = obj;
    });

    // --- Cards (placed sessions) ---------------------------------------------
    const cards = [];
    xml.querySelectorAll("cards > card").forEach(card => {
      const lessonId = attr(card, "lessonid");
      const lesson = lessonById[lessonId];
      if (!lesson) return;

      const period = parseInt(attr(card, "period"), 10);
      if (!period) return;

      // Card-level classroom OVERRIDES lesson-level (per advisor / Classic semantics).
      const cardRoomIds = (attr(card, "classroomids") || "").split(",").filter(Boolean);
      const classroomId = cardRoomIds[0] || lesson.preferredRoomId || undefined;

      const days = attr(card, "days") || "";
      for (let di = 0; di < days.length && di < DAYS_EN.length; di++) {
        if (days[di] !== "1") continue;
        cards.push({ lessonId, day: di, period, classroomId });
      }
    });

    // --- Viewer indexes (denormalised for grid rendering) --------------------
    const cardsByClass   = Object.create(null);
    const cardsByTeacher = Object.create(null);
    const cardsByRoom    = Object.create(null);

    for (const c of cards) {
      const lesson = lessonById[c.lessonId];
      if (!lesson) continue;
      const subject = subjectById[lesson.subjectId];
      const room    = c.classroomId ? classroomById[c.classroomId] : null;
      const subjAbbr = subject ? (subject.abbr || subject.name) : "";
      const subjName = subject ? subject.name : "";
      const teacherNames = lesson.teacherIds.map(tid => teacherById[tid]?.name).filter(Boolean);
      const classNames   = lesson.classIds.map(cid => classById[cid]?.name).filter(Boolean);

      const entry = {
        day: c.day, period: c.period,
        lessonId: c.lessonId,
        subjectId: lesson.subjectId, subject: subjName, subjectAbbr: subjAbbr,
        teacherIds: lesson.teacherIds.slice(), teachers: teacherNames,
        classIds: lesson.classIds.slice(),     classes: classNames,
        classroomId: c.classroomId || null,
        classroom: room ? room.name : "",
      };

      for (const cid of lesson.classIds) {
        (cardsByClass[cid] = cardsByClass[cid] || []).push(entry);
      }
      for (const tid of lesson.teacherIds) {
        (cardsByTeacher[tid] = cardsByTeacher[tid] || []).push(entry);
      }
      if (c.classroomId) {
        (cardsByRoom[c.classroomId] = cardsByRoom[c.classroomId] || []).push(entry);
      }
    }

    // Strip viewer-only fields from the canonical contract output
    const cleanLessons = lessons.map(l => ({
      id: l.id,
      classIds: l.classIds,
      teacherIds: l.teacherIds,
      subjectId: l.subjectId,
      groupIds: l.groupIds || [],
      periodsPerWeek: l.periodsPerWeek,
      requiredRoomType: l.requiredRoomType,
      preferredRoomId: l.preferredRoomId,
      fixedDay: l.fixedDay,
      fixedPeriod: l.fixedPeriod,
      isLabDouble: l.isLabDouble,
    }));
    const cleanClasses = classes.map(c => ({
      id: c.id, name: c.name, sections: c.sections,
    }));

    return {
      schoolName,
      daysPerWeek,
      bell: { periods },
      teachers,
      classes: cleanClasses,
      classrooms,
      subjects,
      lessons: cleanLessons,
      groups,
      cards,
      _meta: {
        sourceFilename: sourceName,
        generatedAt: new Date().toISOString(),
        days: DAYS_EN,
        counts: {
          teachers: teachers.length,
          classes: cleanClasses.length,
          classrooms: classrooms.length,
          subjects: subjects.length,
          lessons: cleanLessons.length,
          cards: cards.length,
          periods: periods.length,
          groups: groups.length,
        },
      },
      _idx: {
        teacherById, classById, classroomById, subjectById, lessonById, groupById,
        cardsByClass, cardsByTeacher, cardsByRoom,
        days: DAYS_EN,
      },
    };
  }

  // --- Helpers -------------------------------------------------------------
  const ROMAN_ORDER = { "I":1,"II":2,"III":3,"IV":4,"V":5,"VI":6,"VII":7,"VIII":8,"IX":9,"X":10,"XI":11,"XII":12 };
  const PRE_ORDER = { "NURSERY":-3, "LKG":-2, "UKG":-1 };

  function classOrder(a, b) {
    return classRank(a.name) - classRank(b.name) || a.name.localeCompare(b.name);
  }
  function classRank(name) {
    const u = (name || "").toUpperCase().trim();
    if (u in PRE_ORDER) return PRE_ORDER[u];
    const m = u.match(/^([IVX]+)\b/);
    if (m && m[1] in ROMAN_ORDER) {
      // Tie-break by section letter
      const sect = u.slice(m[1].length).trim();
      const letterBoost = sect ? (sect.charCodeAt(0) - 64) / 100 : 0;
      return ROMAN_ORDER[m[1]] + letterBoost;
    }
    return 100;
  }

  return { parseFile, parseText, DAYS: DAYS_EN };
})();
