/**
 * Create-new-timetable wizard.
 * Initializes window.APP.school with empty arrays + a default 6×8 bell schedule,
 * then advances to the Editor step. Users add teachers/classes/etc. via the
 * ribbon dialogs (Agent F + L) and drag cards via the editor (Agent E + J).
 */
(function (global) {
  "use strict";

  const DEFAULT_BELL = {
    periods: [
      { index: 1, label: "P1", startMin: 7 * 60 + 55, endMin: 8 * 60 + 40, isTeaching: true },
      { index: 2, label: "P2", startMin: 8 * 60 + 40, endMin: 9 * 60 + 20, isTeaching: true },
      { index: 3, label: "P3", startMin: 9 * 60 + 20, endMin: 10 * 60,      isTeaching: true },
      { index: 4, label: "P4", startMin: 10 * 60 + 20, endMin: 11 * 60,    isTeaching: true },
      { index: 5, label: "P5", startMin: 11 * 60,      endMin: 11 * 60 + 40, isTeaching: true },
      { index: 6, label: "P6", startMin: 11 * 60 + 40, endMin: 12 * 60 + 20, isTeaching: true },
      { index: 7, label: "P7", startMin: 12 * 60 + 20, endMin: 13 * 60,      isTeaching: true },
      { index: 8, label: "P8", startMin: 13 * 60 + 10, endMin: 13 * 60 + 50, isTeaching: true },
    ],
  };

  // 24 evenly-spaced HSL colors — teachers + subjects + classes get distinct hues.
  function makePalette(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const h = Math.round((i * 360) / n) % 360;
      // Convert HSL to hex
      const s = 70, l = 55;
      const c = (1 - Math.abs(2 * (l / 100) - 1)) * (s / 100);
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l / 100 - c / 2;
      let r, g, b;
      if (h < 60)       { r = c; g = x; b = 0; }
      else if (h < 120) { r = x; g = c; b = 0; }
      else if (h < 180) { r = 0; g = c; b = x; }
      else if (h < 240) { r = 0; g = x; b = c; }
      else if (h < 300) { r = x; g = 0; b = c; }
      else              { r = c; g = 0; b = x; }
      const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
      out.push("#" + toHex(r) + toHex(g) + toHex(b));
    }
    return out;
  }

  const PALETTE_24 = makePalette(24);

  /** Build the _idx index that the editor + pending strip rely on. */
  function buildIndex(school) {
    const teacherById = {};   for (const t of school.teachers || [])   teacherById[t.id]   = t;
    const subjectById = {};   for (const s of school.subjects || [])   subjectById[s.id]   = s;
    const classById = {};     for (const c of school.classes || [])    classById[c.id]     = c;
    const classroomById = {}; for (const r of school.classrooms || []) classroomById[r.id] = r;
    const lessonById = {};    for (const l of school.lessons || [])    lessonById[l.id]    = l;

    const cardsByClass = {};
    const cardsByTeacher = {};
    const cardsByRoom = {};
    for (const card of (school.cards || [])) {
      const lesson = lessonById[card.lessonId];
      if (!lesson) continue;
      for (const cid of (lesson.classIds || [])) {
        (cardsByClass[cid] = cardsByClass[cid] || []).push(card);
      }
      for (const tid of (lesson.teacherIds || [])) {
        (cardsByTeacher[tid] = cardsByTeacher[tid] || []).push(card);
      }
      if (card.classroomId) {
        (cardsByRoom[card.classroomId] = cardsByRoom[card.classroomId] || []).push(card);
      }
    }

    return {
      teacherById, subjectById, classById, classroomById, lessonById,
      cardsByClass, cardsByTeacher, cardsByRoom,
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    };
  }

  function refreshIndex() {
    const APP = global.APP || {};
    if (!APP.school) return;
    APP.school._idx = buildIndex(APP.school);
  }

  /**
   * Initialize an empty school. The user fills it in via the entity dialogs.
   */
  function createBlank(opts = {}) {
    const APP = global.APP || (global.APP = {});
    APP.school = {
      schoolName: opts.schoolName || "My School",
      bell: JSON.parse(JSON.stringify(DEFAULT_BELL)),
      teachers: [],
      classes: [],
      classrooms: [],
      subjects: [],
      lessons: [],
      cards: [],
    };
    APP.school._idx = buildIndex(APP.school);
    APP.editor = APP.editor || {};
    APP.editor.perspective = "class";
    APP.editor.cardInHand = null;
    APP.audit = APP.audit || { _log: [] };
    APP.audit._log.push({ ts: Date.now(), op: "create-new-blank", schoolName: APP.school.schoolName });
    document.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "create-new" } }));
  }

  /**
   * Seed a small demo so the new-timetable user has something to drag immediately.
   * 4 teachers (with distinct colors), 3 classes, 2 classrooms, 3 subjects, 6 lessons.
   */
  function createDemoSeed() {
    const APP = global.APP || (global.APP = {});
    createBlank({ schoolName: "Demo Public School" });
    const S = APP.school;
    const C = PALETTE_24;

    S.subjects = [
      { id: "S1", name: "Mathematics", short: "Math", color: C[0] },
      { id: "S2", name: "Science",     short: "Sci",  color: C[6] },
      { id: "S3", name: "English",     short: "Eng",  color: C[12] },
    ];
    S.teachers = [
      { id: "T1", name: "Mr. Aamir",  short: "AAM", color: C[2] },
      { id: "T2", name: "Ms. Beauty", short: "BTY", color: C[8] },
      { id: "T3", name: "Mr. Chetan", short: "CHE", color: C[14] },
      { id: "T4", name: "Ms. Divya",  short: "DIV", color: C[20] },
    ];
    S.classes = [
      { id: "C1", name: "VI A",  short: "VIA",  color: C[3] },
      { id: "C2", name: "VI B",  short: "VIB",  color: C[9] },
      { id: "C3", name: "VII A", short: "VIIA", color: C[15] },
    ];
    S.classrooms = [
      { id: "R1", name: "Room 101", short: "R101" },
      { id: "R2", name: "Room 102", short: "R102" },
    ];
    S.lessons = [
      { id: "L1", subjectId: "S1", teacherIds: ["T1"], classIds: ["C1"], periodsPerWeek: 4 },
      { id: "L2", subjectId: "S2", teacherIds: ["T2"], classIds: ["C1"], periodsPerWeek: 3 },
      { id: "L3", subjectId: "S3", teacherIds: ["T3"], classIds: ["C1"], periodsPerWeek: 3 },
      { id: "L4", subjectId: "S1", teacherIds: ["T1"], classIds: ["C2"], periodsPerWeek: 4 },
      { id: "L5", subjectId: "S2", teacherIds: ["T4"], classIds: ["C2"], periodsPerWeek: 3 },
      { id: "L6", subjectId: "S1", teacherIds: ["T1"], classIds: ["C3"], periodsPerWeek: 5 },
    ];
    S._idx = buildIndex(S);
    document.dispatchEvent(new CustomEvent("app:school-loaded", { detail: { source: "create-demo" } }));
  }

  /**
   * Assign distinct colors to any teachers/subjects/classes that don't have one.
   * Called automatically when a school is loaded.
   */
  function ensureColors() {
    const APP = global.APP || {};
    if (!APP.school) return;
    const S = APP.school;
    function assign(list) {
      let pi = 0;
      for (const item of (list || [])) {
        if (!item.color || item.color === "" || item.color === "#000000") {
          item.color = PALETTE_24[pi % PALETTE_24.length];
        }
        pi++;
      }
    }
    assign(S.teachers);
    assign(S.subjects);
    assign(S.classes);
  }

  global.CreateNew = { createBlank, createDemoSeed, ensureColors, refreshIndex, buildIndex, PALETTE_24 };
})(window);
