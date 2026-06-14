/* Print presets — 20+ named report configurations that load into the
 * pivot engine. Each preset is a partial PrintReport.
 *
 * IDs are aligned with legacy template-file IDs so that pivot-preset
 * registrations overwrite legacy registrations in the dropdown. The
 * dispatch in print_preview.js prefers registry-registered renders
 * (non-builtin) so the pivot engine wins.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const PRESETS = [
    // ── Built-in 5 (override legacy hardcoded renderers) ─────────────────
    {
      id: "class",
      name: "Timetable for each class",
      context: "class",
      pages: ["class"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "teacher",
      name: "Timetable for each teacher",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "room",
      name: "Timetable for each classroom",
      context: "classroom",
      pages: ["classroom"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary",
      name: "Summary timetable of classes",
      context: "summary",
      pages: [], rows: ["class"], cols: ["day","period"],
      cells: "summary-class-day-period", fitWidth: true, fitHeight: true,
    },
    {
      id: "poster",
      name: "Wall poster of classes",
      context: "poster",
      pages: ["day"], rows: ["class"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Per-entity timetables WITH side table ────────────────────────────
    {
      id: "classwise_with_table",
      name: "TimeTable for each class — with table",
      context: "class",
      pages: ["class"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 18 },
        { type: "sum-of-lessons", header: "Count",    width: 7 },
      ],
    },
    {
      id: "teacherwise_with_table",
      name: "TimeTable for each teacher — with table",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 18 },
        { type: "sum-of-lessons", header: "Count",    width: 7 },
      ],
    },
    {
      id: "teacherwise_extra",
      name: "TimeTable for each teacher — with extra",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      render: renderTeacherExtra,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 16 },
        { type: "sum-of-lessons", header: "Total",    width: 7 },
      ],
    },

    // ── Per-subject timetable ────────────────────────────────────────────
    {
      id: "timetable_for_each_subject",
      name: "Timetable for each subject",
      context: "subject",
      pages: ["subject"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Per-student timetable ────────────────────────────────────────────
    {
      id: "timetable_for_student",
      name: "Timetable for each student",
      context: "summary",
      pages: ["student"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "timetable_for_each_student",
      name: "Timetable for each student (compact)",
      context: "summary",
      pages: ["student"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Summary timetables (single-page overview) ────────────────────────
    {
      id: "summary_of_teachers",
      name: "Summary timetable of teachers",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary_of_classrooms",
      name: "Summary timetable of classrooms",
      context: "summary",
      pages: [], rows: ["classroom"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary_of_subjects",
      name: "Summary timetable of subjects",
      context: "summary",
      pages: [], rows: ["subject"], cols: ["day","period"],
      cells: "count-placed", fitWidth: true, fitHeight: true,
    },
    {
      id: "summary_of_students",
      name: "Summary timetable of students",
      context: "summary",
      pages: [], rows: ["student"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },

    // ── Wall posters (one day per page, all entities stacked) ────────────
    {
      id: "wall_poster_teachers",
      name: "Wall poster of teachers",
      context: "poster",
      pages: ["day"], rows: ["teacher"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "wall_poster_classrooms",
      name: "Wall poster of classrooms",
      context: "poster",
      pages: ["day"], rows: ["classroom"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      render: renderWallPosterClassrooms,
    },

    // ── Lesson grid: Class × Subject matrix ──────────────────────────────
    {
      id: "lesson_grid",
      name: "Lesson grid",
      context: "summary",
      pages: [], rows: ["class"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
      render: renderLessonGrid,
    },

    // ── Lists (no grid; just enumerate) ──────────────────────────────────
    {
      id: "list_of_teachers",
      name: "List of teachers",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
      render: renderTeacherList,
    },
    {
      id: "list_of_classes",
      name: "List of classes",
      context: "summary",
      pages: [], rows: ["class"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
      render: renderClassList,
    },

    // ── Daily attendance / contract overview ─────────────────────────────
    {
      id: "daily_attendance",
      name: "Daily attendance",
      context: "summary",
      pages: ["day"], rows: ["class"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      render: renderDailyAttendance,
    },
    {
      id: "contract_overview",
      name: "Contract overview",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["subject"],
      cells: "count-lessons", fitWidth: true, fitHeight: true,
      render: renderContractOverview,
    },

    // ── Wait-points reports (Phase 9 — uses "count-placed" cell for gap analysis) ─
    {
      id: "wait_points_classes",
      name: "Wait points of classes",
      context: "summary",
      pages: [], rows: ["class"], cols: ["day","period"],
      cells: "count-placed", fitWidth: true, fitHeight: true, hideEmptyCols: false,
    },
    {
      id: "wait_points_teachers",
      name: "Wait points of teachers",
      context: "summary",
      pages: [], rows: ["teacher"], cols: ["day","period"],
      cells: "count-placed", fitWidth: true, fitHeight: true, hideEmptyCols: false,
    },
    {
      id: "wait_points_classrooms",
      name: "Wait points of classrooms",
      context: "summary",
      pages: [], rows: ["classroom"], cols: ["day","period"],
      cells: "count-placed", fitWidth: true, fitHeight: true, hideEmptyCols: false,
    },

    // ── Timetable for each day — with table (Phase 9) ────────────────────
    {
      id: "timetable_for_each_day_with_table",
      name: "TimeTable for each day — with table",
      context: "day",
      pages: ["day"], rows: ["class"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
      extraCols: [
        { type: "subjects-count", header: "Subjects", width: 16 },
        { type: "sum-of-lessons", header: "Count",    width: 7 },
      ],
    },

    // ── Custom 1/2/3 — user-editable starting points ─────────────────────
    {
      id: "custom_1",
      name: "Custom 1",
      context: "class",
      pages: ["class"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "custom_2",
      name: "Custom 2",
      context: "teacher",
      pages: ["teacher"], rows: ["day"], cols: ["period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
    {
      id: "custom_3",
      name: "Custom 3",
      context: "summary",
      pages: [], rows: ["class"], cols: ["day","period"],
      cells: "draw-lessons", fitWidth: true, fitHeight: true,
    },
  ];

  function list() { return PRESETS.slice(); }

  function get(id) {
    return PRESETS.find(p => p.id === id) || null;
  }

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }

  function pickTeacherName(school, classRow) {
    const tid = classRow?._teacherId || classRow?.teacherId || classRow?.classTeacherId;
    if (!tid) return "";
    const t = (school.teachers || []).find(x => x.id === tid);
    return t?.name || t?.abbreviation || t?.shortName || "";
  }

  function pickHomeRoomName(school, classRow) {
    const rid = classRow?.homeRoomId || classRow?.classroomId || (classRow?._classroomIds || [])[0];
    if (!rid) return "";
    const r = (school.classrooms || []).find(x => x.id === rid);
    return r?.name || r?.abbreviation || r?.shortName || "";
  }

  function renderClassList(school) {
    const classes = school?.classes || [];
    const perPage = 28;
    const pages = [];
    for (let start = 0; start < Math.max(classes.length, 1); start += perPage) {
      const chunk = classes.slice(start, start + perPage);
      const p = el("div", {
        class: "chrx-preview-page chrx-print-page chrx-pivot-page",
        style: "background:#fff;color:#111;width:210mm;min-height:297mm;padding:16mm 14mm;box-sizing:border-box;font-family:system-ui",
      });
      const schoolName = school?.schoolName || school?.name || "";
      if (schoolName) p.appendChild(el("div", {
        style: "text-align:center;font-weight:600;font-size:13px;margin-bottom:3px",
      }, schoolName));
      p.appendChild(el("div", {
        style: "text-align:center;font-weight:700;font-size:22px;font-family:'Fraunces',serif;font-style:italic;margin-bottom:2px",
      }, "List of classes"));
      p.appendChild(el("div", {
        style: "font-size:10px;color:#555;border-bottom:1px solid #bbb;padding-bottom:5px;margin-bottom:8px",
      }, schoolName));

      const tbl = el("table", {
        class: "chrx-pivot-grid",
        style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px",
      });
      const head = el("tr");
      ["Class", "Class teacher", "Home classroom"].forEach((h, i) => {
        head.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:7px 8px;text-align:" + (i === 0 ? "left" : "center") + ";font-size:17px;font-weight:500",
        }, h));
      });
      tbl.appendChild(el("thead", null, head));
      const body = el("tbody");
      if (!chunk.length) {
        const tr = el("tr");
        tr.appendChild(el("td", { colspan: "3", style: "border:1px solid #ccc;padding:8px;color:#777;text-align:center" }, "No classes"));
        body.appendChild(tr);
      }
      chunk.forEach(cls => {
        const tr = el("tr");
        tr.appendChild(el("td", { style: "border:1px solid #ccc;padding:6px 8px;font-weight:600" }, cls.name || cls.id || ""));
        tr.appendChild(el("td", { style: "border:1px solid #ccc;padding:6px 8px" }, pickTeacherName(school, cls)));
        tr.appendChild(el("td", { style: "border:1px solid #ccc;padding:6px 8px" }, pickHomeRoomName(school, cls)));
        body.appendChild(tr);
      });
      tbl.appendChild(body);
      p.appendChild(tbl);
      p.appendChild(el("div", {
        style: "display:flex;justify-content:space-between;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace;border-top:1px solid #eee;padding-top:6px;margin-top:8px",
      }, el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
         el("span", null, "Chronexa Web")));
      pages.push(p);
    }
    return pages;
  }

  function classesForTeacher(school, teacherId) {
    const out = [];
    for (const cls of (school.classes || [])) {
      const tid = cls?._teacherId || cls?.teacherId || cls?.classTeacherId;
      if (tid === teacherId) out.push(cls.name || cls.abbreviation || cls.shortName || cls.id);
    }
    return out;
  }

  function renderTeacherList(school) {
    const teachers = (school?.teachers || []).slice().sort((a, b) =>
      (a.name || a.abbreviation || "").localeCompare(b.name || b.abbreviation || ""));
    const perPage = 30;
    const pages = [];
    for (let start = 0; start < Math.max(teachers.length, 1); start += perPage) {
      const chunk = teachers.slice(start, start + perPage);
      const p = el("div", {
        class: "chrx-preview-page chrx-print-page chrx-pivot-page",
        style: "background:#fff;color:#111;width:210mm;min-height:297mm;padding:16mm 14mm;box-sizing:border-box;font-family:system-ui",
      });
      const schoolName = school?.schoolName || school?.name || "";
      if (schoolName) p.appendChild(el("div", {
        style: "text-align:center;font-weight:600;font-size:13px;margin-bottom:3px",
      }, schoolName));
      p.appendChild(el("div", {
        style: "text-align:center;font-weight:700;font-size:22px;font-family:'Fraunces',serif;font-style:italic;margin-bottom:2px",
      }, "List of teachers"));
      p.appendChild(el("div", {
        style: "font-size:10px;color:#555;border-bottom:1px solid #bbb;padding-bottom:5px;margin-bottom:8px",
      }, schoolName));

      const tbl = el("table", {
        class: "chrx-pivot-grid",
        style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px",
      });
      const head = el("tr");
      ["Teacher", "Class teacher for the class"].forEach((h, i) => {
        head.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:7px 8px;text-align:" + (i === 0 ? "left" : "center") + ";font-size:17px;font-weight:500",
        }, h));
      });
      tbl.appendChild(el("thead", null, head));
      const body = el("tbody");
      if (!chunk.length) {
        const tr = el("tr");
        tr.appendChild(el("td", { colspan: "2", style: "border:1px solid #ccc;padding:8px;color:#777;text-align:center" }, "No teachers"));
        body.appendChild(tr);
      }
      chunk.forEach(t => {
        const classes = classesForTeacher(school, t.id);
        const tr = el("tr");
        tr.appendChild(el("td", { style: "border:1px solid #ccc;padding:6px 8px;font-weight:600" }, t.name || t.abbreviation || t.shortName || t.id || ""));
        tr.appendChild(el("td", { style: "border:1px solid #ccc;padding:6px 8px" }, classes.join(", ")));
        body.appendChild(tr);
      });
      tbl.appendChild(body);
      p.appendChild(tbl);
      p.appendChild(el("div", {
        style: "display:flex;justify-content:space-between;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace;border-top:1px solid #eee;padding-top:6px;margin-top:8px",
      }, el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
         el("span", null, "Chronexa Web")));
      pages.push(p);
    }
    return pages;
  }

  function lessonWeeklyCount(lesson) {
    const raw = lesson?.periodsPerWeek ?? lesson?.lessonsPerWeek ?? lesson?.weeklyCount ?? lesson?.count ?? 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function lessonCountForClassSubject(school, classId, subjectId) {
    let total = 0;
    for (const lesson of (school.lessons || [])) {
      if (lesson.subjectId !== subjectId) continue;
      if (!(lesson.classIds || []).includes(classId)) continue;
      total += lessonWeeklyCount(lesson);
    }
    return total;
  }

  function renderLessonGrid(school) {
    const classes = school?.classes || [];
    const subjects = school?.subjects || [];
    const perPage = 10;
    const pages = [];
    for (let start = 0; start < Math.max(classes.length, 1); start += perPage) {
      const chunk = classes.slice(start, start + perPage);
      const p = el("div", {
        class: "chrx-preview-page chrx-print-page chrx-pivot-page",
        style: "background:#fff;color:#111;width:297mm;min-height:210mm;padding:12mm;box-sizing:border-box;font-family:system-ui;display:flex;flex-direction:column;gap:6px",
      });
      const schoolName = school?.schoolName || school?.name || "";
      if (schoolName) p.appendChild(el("div", {
        style: "text-align:center;font-weight:600;font-size:12px",
      }, schoolName));
      p.appendChild(el("div", {
        style: "text-align:center;font-weight:700;font-size:18px;font-family:'Fraunces',serif;font-style:italic",
      }, "Lesson grid"));
      p.appendChild(el("div", {
        style: "font-size:10px;color:#555;border-bottom:1px solid #bbb;padding-bottom:4px",
      }, schoolName));

      const tbl = el("table", {
        class: "chrx-pivot-grid",
        style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;flex:1",
      });
      const head = el("tr");
      head.appendChild(el("th", {
        style: "border:1px solid #999;background:#fafafa;width:78px;padding:4px;text-align:center",
      }, ""));
      for (const subj of subjects) {
        head.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:4px 2px;text-align:center;font-size:17px;font-weight:500;overflow-wrap:anywhere",
        }, subj.abbreviation || subj.shortName || subj.name || subj.id || ""));
      }
      tbl.appendChild(el("thead", null, head));

      const body = el("tbody");
      if (!chunk.length) {
        const tr = el("tr");
        tr.appendChild(el("td", { colspan: String(subjects.length + 1), style: "border:1px solid #ccc;padding:8px;color:#777;text-align:center" }, "No classes"));
        body.appendChild(tr);
      }
      for (const cls of chunk) {
        const tr = el("tr");
        tr.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:4px 6px;text-align:center;font-size:16px;font-weight:500",
        }, cls.abbreviation || cls.shortName || cls.name || cls.id || ""));
        for (const subj of subjects) {
          const count = lessonCountForClassSubject(school, cls.id, subj.id);
          tr.appendChild(el("td", {
            style: "border:1px solid #bbb;padding:4px;text-align:right;vertical-align:middle;font-size:20px;line-height:1.15;color:" + (count > 0 ? "#111" : "#bbb"),
          }, count > 0 ? String(count) : ""));
        }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      p.appendChild(tbl);
      p.appendChild(el("div", {
        style: "display:flex;justify-content:space-between;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace;border-top:1px solid #eee;padding-top:6px",
      }, el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
         el("span", null, "Chronexa Web")));
      pages.push(p);
    }
    return pages;
  }

  function lessonCardsForClassroomSlot(school, roomId, day, period) {
    return (school.cards || []).map(card => {
      const roomIds = [card.classroomId, card.roomId].concat(card.roomIds || []).filter(Boolean);
      if (!roomIds.includes(roomId) || card.day !== day || card.period !== period) return null;
      const lesson = lessonForCard(school, card);
      const subj = (school.subjects || []).find(s => s.id === lesson?.subjectId);
      const teacher = teacherNameForLesson(school, lesson);
      return {
        subject: subj?.abbreviation || subj?.shortName || subj?.name || lesson?.subjectId || "",
        teacher,
      };
    }).filter(Boolean);
  }

  function dayPeriodSlots(school, periods) {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const days = Math.max(1, Math.min(6, school?.daysPerWeek || 6));
    const slots = [];
    for (let day = 0; day < days; day++) {
      for (const per of periods) {
        slots.push({ day, dayName: dayNames[day] || ("Day " + (day + 1)), period: per });
      }
    }
    return slots;
  }

  function renderPosterLessonCell(cards) {
    const cell = el("td", {
      style: "border:1px solid #bbb;padding:3px 2px;height:13mm;vertical-align:top;text-align:center;overflow:hidden",
    });
    if (!cards.length) return cell;
    const subjectText = cards.map(c => c.subject).filter(Boolean).join(", ");
    const teacherText = cards.map(c => c.teacher).filter(Boolean).join(", ");
    if (subjectText) cell.appendChild(el("div", {
      style: "font-size:10px;font-weight:700;line-height:1.05;overflow-wrap:anywhere",
    }, subjectText));
    if (teacherText) cell.appendChild(el("div", {
      style: "font-size:7px;line-height:1.05;margin-top:2px;overflow-wrap:anywhere",
    }, teacherText));
    return cell;
  }

  function renderWallPosterClassrooms(school, periodsArg) {
    const rooms = school?.classrooms || [];
    const periods = periodsArg || school?.bell?.periods || [];
    const slots = dayPeriodSlots(school, periods);
    const colsPerPage = 8;
    const pages = [];
    for (let start = 0; start < Math.max(slots.length, 1); start += colsPerPage) {
      const chunk = slots.slice(start, start + colsPerPage);
      const p = el("div", {
        class: "chrx-preview-page chrx-print-page chrx-pivot-page",
        style: "background:#fff;color:#111;width:297mm;min-height:210mm;padding:12mm;box-sizing:border-box;font-family:system-ui;display:flex;flex-direction:column;gap:6px",
      });
      const schoolName = school?.schoolName || school?.name || "";
      if (schoolName) p.appendChild(el("div", {
        style: "text-align:center;font-weight:600;font-size:12px",
      }, schoolName));
      p.appendChild(el("div", {
        style: "text-align:center;font-weight:700;font-size:18px;font-family:'Fraunces',serif;font-style:italic",
      }, "Wall poster of classrooms"));
      p.appendChild(el("div", {
        style: "font-size:10px;color:#555;border-bottom:1px solid #bbb;padding-bottom:4px",
      }, schoolName));

      const tbl = el("table", {
        class: "chrx-pivot-grid",
        style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px;flex:1",
      });
      const dayRow = el("tr");
      dayRow.appendChild(el("th", {
        rowspan: "2",
        style: "border:1px solid #999;background:#fafafa;width:78px;padding:4px;text-align:center",
      }, ""));
      for (let i = 0; i < chunk.length;) {
        const dayName = chunk[i].dayName;
        let span = 1;
        while (i + span < chunk.length && chunk[i + span].dayName === dayName) span++;
        dayRow.appendChild(el("th", {
          colspan: String(span),
          style: "border:1px solid #999;background:#fafafa;padding:3px;text-align:center;font-size:17px;font-weight:500",
        }, dayName));
        i += span;
      }
      const periodRow = el("tr");
      for (const slot of chunk) {
        const per = slot.period;
        const h = el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:2px;text-align:center;font-size:13px;font-weight:500",
        });
        h.appendChild(el("div", null, String(per.label || per.index)));
        if (per.startMin != null && per.endMin != null) {
          h.appendChild(el("div", { style: "font-size:7px;font-weight:400;color:#555" }, fmtMin(per.startMin) + "-" + fmtMin(per.endMin)));
        }
        periodRow.appendChild(h);
      }
      tbl.appendChild(el("thead", null, dayRow, periodRow));

      const body = el("tbody");
      if (!rooms.length) {
        const tr = el("tr");
        tr.appendChild(el("td", { colspan: String(chunk.length + 1), style: "border:1px solid #ccc;padding:8px;color:#777;text-align:center" }, "No classrooms"));
        body.appendChild(tr);
      }
      for (const room of rooms) {
        const tr = el("tr");
        tr.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:4px;text-align:center;font-size:13px;font-weight:500;overflow-wrap:anywhere",
        }, room.abbreviation || room.shortName || room.name || room.id || ""));
        for (const slot of chunk) {
          const cards = lessonCardsForClassroomSlot(school, room.id, slot.day, slot.period.index);
          tr.appendChild(renderPosterLessonCell(cards));
        }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      p.appendChild(tbl);
      p.appendChild(el("div", {
        style: "display:flex;justify-content:space-between;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace;border-top:1px solid #eee;padding-top:6px",
      }, el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
         el("span", null, "Chronexa Web")));
      pages.push(p);
    }
    return pages;
  }

  function teacherNameForLesson(school, lesson) {
    const names = [];
    for (const tid of (lesson?.teacherIds || [])) {
      const t = (school.teachers || []).find(x => x.id === tid);
      if (t) names.push(t.abbreviation || t.shortName || t.name || tid);
    }
    return names.join(", ");
  }

  function lessonForCard(school, card) {
    return (school.lessons || []).find(l => l.id === card?.lessonId) || null;
  }

  function cardsForClassDay(school, classId, day) {
    return (school.cards || []).map(card => {
      const lesson = lessonForCard(school, card);
      if (!lesson || !(lesson.classIds || []).includes(classId) || card.day !== day) return null;
      const subj = (school.subjects || []).find(s => s.id === lesson.subjectId);
      return {
        period: card.period,
        subject: subj?.abbreviation || subj?.shortName || subj?.name || lesson.subjectId || "",
        teacher: teacherNameForLesson(school, lesson),
      };
    }).filter(Boolean);
  }

  function classLabelsForLesson(school, lesson) {
    const labels = [];
    for (const cid of (lesson?.classIds || [])) {
      const cls = (school.classes || []).find(c => c.id === cid);
      labels.push(cls?.abbreviation || cls?.shortName || cls?.name || cid);
    }
    return labels.join(", ");
  }

  function cardsForTeacherDay(school, teacherId, day) {
    return (school.cards || []).map(card => {
      const lesson = lessonForCard(school, card);
      if (!lesson || !(lesson.teacherIds || []).includes(teacherId) || card.day !== day) return null;
      const subj = (school.subjects || []).find(s => s.id === lesson.subjectId);
      return {
        period: card.period,
        subject: subj?.abbreviation || subj?.shortName || subj?.name || lesson.subjectId || "",
        classes: classLabelsForLesson(school, lesson),
      };
    }).filter(Boolean);
  }

  function renderDailySlip(school, cls, day, periods) {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const slip = el("div", {
      style: "border:1px solid #999;display:flex;flex-direction:column;min-height:86mm;background:#fff;page-break-inside:avoid",
    });
    slip.appendChild(el("div", {
      style: "text-align:center;font-weight:600;font-size:11px;padding-top:4px",
    }, school?.schoolName || school?.name || ""));
    slip.appendChild(el("div", {
      style: "text-align:center;font-weight:700;font-size:22px;font-family:'Fraunces',serif;font-style:italic;line-height:1.1;padding-bottom:4px",
    }, (dayNames[day] || "Day") + " - " + (cls.name || cls.id || "")));

    const tbl = el("table", {
      class: "chrx-pivot-grid",
      style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px;flex:1",
    });
    const head = el("tr");
    head.appendChild(el("th", { style: "border:1px solid #999;background:#fafafa;width:34px;padding:2px" }, ""));
    for (const per of periods) {
      const h = el("th", {
        style: "border:1px solid #999;background:#fafafa;padding:2px;text-align:center;font-weight:700",
      });
      h.appendChild(el("div", null, String(per.label || per.index)));
      if (per.startMin != null && per.endMin != null) {
        h.appendChild(el("div", { style: "font-size:6.5px;font-weight:400;color:#555" }, fmtMin(per.startMin) + "-" + fmtMin(per.endMin)));
      }
      head.appendChild(h);
    }
    tbl.appendChild(el("thead", null, head));

    const body = el("tbody");
    const byPeriod = new Map(cardsForClassDay(school, cls.id, day).map(c => [c.period, c]));
    const lessonRow = el("tr");
    lessonRow.appendChild(el("td", {
      style: "border:1px solid #999;background:#fafafa;width:34px;padding:2px;text-align:center;font-weight:600;writing-mode:vertical-rl;transform:rotate(180deg)",
    }, "Timetable"));
    for (const per of periods) {
      const card = byPeriod.get(per.index);
      const cell = el("td", {
        style: "border:1px solid #bbb;padding:3px 2px;height:30mm;vertical-align:top;text-align:center;overflow:hidden",
      });
      if (card) {
        cell.appendChild(el("div", { style: "font-size:15px;font-weight:700;line-height:1.05;overflow-wrap:anywhere" }, card.subject));
        if (card.teacher) cell.appendChild(el("div", { style: "font-size:9px;line-height:1.1;margin-top:3px;overflow-wrap:anywhere" }, card.teacher));
      }
      lessonRow.appendChild(cell);
    }
    body.appendChild(lessonRow);
    const signRow = el("tr");
    signRow.appendChild(el("td", { style: "border:1px solid #999;background:#fafafa;padding:2px;text-align:center;font-size:8px" }, "Sign"));
    for (const per of periods) {
      signRow.appendChild(el("td", { style: "border:1px solid #bbb;height:12mm;padding:2px" }, ""));
    }
    body.appendChild(signRow);
    tbl.appendChild(body);
    slip.appendChild(tbl);
    slip.appendChild(el("div", { style: "display:flex;justify-content:space-between;font-size:8px;color:#666;padding:3px 5px" },
      el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
      el("span", null, "Chronexa Web")));
    return slip;
  }

  function renderTeacherSlip(school, teacher, periods, days) {
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const slip = el("div", {
      style: "border:1px solid #999;display:flex;flex-direction:column;min-height:86mm;background:#fff;page-break-inside:avoid",
    });
    slip.appendChild(el("div", {
      style: "text-align:center;font-weight:600;font-size:11px;padding-top:4px",
    }, school?.schoolName || school?.name || ""));
    slip.appendChild(el("div", {
      style: "text-align:center;font-weight:700;font-size:22px;font-family:'Fraunces',serif;font-style:italic;line-height:1.1;padding-bottom:4px",
    }, teacher.name || teacher.abbreviation || teacher.shortName || teacher.id || ""));

    const tbl = el("table", {
      class: "chrx-pivot-grid",
      style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px;flex:1",
    });
    const head = el("tr");
    head.appendChild(el("th", { style: "border:1px solid #999;background:#fafafa;width:52px;padding:2px" }, ""));
    for (const per of periods) {
      const h = el("th", {
        style: "border:1px solid #999;background:#fafafa;padding:2px;text-align:center;font-weight:700",
      });
      h.appendChild(el("div", null, String(per.label || per.index)));
      if (per.startMin != null && per.endMin != null) {
        h.appendChild(el("div", { style: "font-size:6.5px;font-weight:400;color:#555" }, fmtMin(per.startMin) + "-" + fmtMin(per.endMin)));
      }
      head.appendChild(h);
    }
    tbl.appendChild(el("thead", null, head));

    const body = el("tbody");
    for (let day = 0; day < days; day++) {
      const byPeriod = new Map(cardsForTeacherDay(school, teacher.id, day).map(c => [c.period, c]));
      const tr = el("tr");
      tr.appendChild(el("th", {
        style: "border:1px solid #999;background:#fafafa;padding:2px 4px;text-align:left;font-size:8px;font-weight:600",
      }, dayNames[day] || ("Day " + (day + 1))));
      for (const per of periods) {
        const card = byPeriod.get(per.index);
        const cell = el("td", {
          style: "border:1px solid #bbb;padding:3px 2px;height:12mm;vertical-align:top;text-align:center;overflow:hidden",
        });
        if (card) {
          cell.appendChild(el("div", { style: "font-size:12px;font-weight:700;line-height:1.05;overflow-wrap:anywhere" }, card.subject));
          if (card.classes) cell.appendChild(el("div", { style: "font-size:8px;line-height:1.1;margin-top:2px;overflow-wrap:anywhere" }, card.classes));
        }
        tr.appendChild(cell);
      }
      body.appendChild(tr);
    }
    tbl.appendChild(body);
    slip.appendChild(tbl);
    slip.appendChild(el("div", { style: "display:flex;justify-content:space-between;font-size:8px;color:#666;padding:3px 5px" },
      el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
      el("span", null, "Chronexa Web")));
    return slip;
  }

  function renderTeacherExtra(school, periodsArg) {
    const teachers = (school?.teachers || []).slice().sort((a, b) =>
      (a.name || a.abbreviation || "").localeCompare(b.name || b.abbreviation || ""));
    const periods = periodsArg || school?.bell?.periods || [];
    const days = Math.max(1, Math.min(6, school?.daysPerWeek || 6));
    const pages = [];
    for (let i = 0; i < Math.max(teachers.length, 1); i += 2) {
      const p = el("div", {
        class: "chrx-preview-page chrx-print-page chrx-pivot-page",
        style: "background:#fff;color:#111;width:297mm;min-height:210mm;padding:12mm;box-sizing:border-box;font-family:system-ui;display:grid;grid-template-columns:1fr;gap:8mm;align-content:start",
      });
      const chunk = teachers.slice(i, i + 2);
      if (!chunk.length) {
        p.appendChild(el("div", { style: "text-align:center;color:#777" }, "No teachers"));
      }
      for (const teacher of chunk) p.appendChild(renderTeacherSlip(school, teacher, periods, days));
      pages.push(p);
    }
    return pages;
  }

  function fmtMin(min) {
    if (min == null || min < 0) return "";
    return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0");
  }

  function renderDailyAttendance(school) {
    const classes = school?.classes || [];
    const periods = school?.bell?.periods || [];
    const days = Math.max(1, Math.min(6, school?.daysPerWeek || 6));
    const pages = [];
    for (let day = 0; day < days; day++) {
      for (let i = 0; i < Math.max(classes.length, 1); i += 2) {
        const p = el("div", {
          class: "chrx-preview-page chrx-print-page chrx-pivot-page",
          style: "background:#fff;color:#111;width:297mm;min-height:210mm;padding:12mm;box-sizing:border-box;font-family:system-ui;display:grid;grid-template-columns:1fr 1fr;gap:10mm;align-content:start",
        });
        const chunk = classes.slice(i, i + 2);
        if (!chunk.length) {
          p.appendChild(el("div", { style: "grid-column:1 / -1;text-align:center;color:#777" }, "No classes"));
        }
        for (const cls of chunk) p.appendChild(renderDailySlip(school, cls, day, periods));
        pages.push(p);
      }
    }
    return pages;
  }

  function classLabelsForTeacherSubject(school, teacherId, subjectId) {
    const labels = [];
    const seen = new Set();
    function add(id) {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const cls = (school.classes || []).find(c => c.id === id);
      labels.push(cls?.abbreviation || cls?.shortName || cls?.name || id);
    }
    for (const lesson of (school.lessons || [])) {
      if (lesson.subjectId !== subjectId) continue;
      if (!(lesson.teacherIds || []).includes(teacherId)) continue;
      for (const cid of (lesson.classIds || [])) add(cid);
    }
    return labels;
  }

  function renderContractOverview(school) {
    const teachers = (school?.teachers || []).slice().sort((a, b) =>
      (a.name || a.abbreviation || "").localeCompare(b.name || b.abbreviation || ""));
    const subjects = school?.subjects || [];
    const perPage = 10;
    const pages = [];
    for (let start = 0; start < Math.max(teachers.length, 1); start += perPage) {
      const chunk = teachers.slice(start, start + perPage);
      const p = el("div", {
        class: "chrx-preview-page chrx-print-page chrx-pivot-page",
        style: "background:#fff;color:#111;width:297mm;min-height:210mm;padding:12mm;box-sizing:border-box;font-family:system-ui;display:flex;flex-direction:column;gap:6px",
      });
      const schoolName = school?.schoolName || school?.name || "";
      if (schoolName) p.appendChild(el("div", {
        style: "text-align:center;font-weight:600;font-size:12px",
      }, schoolName));
      p.appendChild(el("div", {
        style: "text-align:center;font-weight:700;font-size:18px;font-family:'Fraunces',serif;font-style:italic",
      }, "Contract overview"));
      p.appendChild(el("div", {
        style: "font-size:10px;color:#555;border-bottom:1px solid #bbb;padding-bottom:4px",
      }, schoolName));

      const tbl = el("table", {
        class: "chrx-pivot-grid",
        style: "width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px;flex:1",
      });
      const head = el("tr");
      head.appendChild(el("th", {
        style: "border:1px solid #999;background:#fafafa;width:86px;padding:4px;text-align:left",
      }, ""));
      for (const subj of subjects) {
        head.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:4px 2px;text-align:center;font-weight:600;overflow-wrap:anywhere",
        }, subj.abbreviation || subj.shortName || subj.name || subj.id || ""));
      }
      tbl.appendChild(el("thead", null, head));

      const body = el("tbody");
      if (!chunk.length) {
        const tr = el("tr");
        tr.appendChild(el("td", { colspan: String(subjects.length + 1), style: "border:1px solid #ccc;padding:8px;color:#777;text-align:center" }, "No teachers"));
        body.appendChild(tr);
      }
      for (const teacher of chunk) {
        const tr = el("tr");
        tr.appendChild(el("th", {
          style: "border:1px solid #999;background:#fafafa;padding:4px 6px;text-align:left;font-size:14px;font-weight:500",
        }, teacher.name || teacher.abbreviation || teacher.shortName || teacher.id || ""));
        for (const subj of subjects) {
          const labels = classLabelsForTeacherSubject(school, teacher.id, subj.id);
          tr.appendChild(el("td", {
            style: "border:1px solid #bbb;padding:3px 4px;height:15mm;text-align:center;vertical-align:middle;font-size:8px;line-height:1.12;overflow-wrap:anywhere;color:" + (labels.length ? "#111" : "#bbb"),
          }, labels.length ? labels.join(", ") : ""));
        }
        body.appendChild(tr);
      }
      tbl.appendChild(body);
      p.appendChild(tbl);
      p.appendChild(el("div", {
        style: "display:flex;justify-content:space-between;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace;border-top:1px solid #eee;padding-top:6px",
      }, el("span", null, "Timetable generated: " + new Date().toLocaleDateString("en-GB")),
         el("span", null, "Chronexa Web")));
      pages.push(p);
    }
    return pages;
  }

  function registerAll() {
    if (!APP.printTemplates || typeof APP.printTemplates.register !== "function") return;
    if (!APP.PrintPivot || typeof APP.PrintPivot.renderPreset !== "function") {
      return;
    }
    for (const preset of PRESETS) {
      APP.printTemplates.register(preset.id, {
        name: preset.name,
        render: (school, periods) => {
          if (typeof preset.render === "function") return preset.render(school, periods);
          // If an active PrintReport exists for this preset (because the
          // user opened Modify-Structure and saved), render from it. Else
          // fall back to the static preset.
          const active = APP.activePrintReport;
          if (active && active._presetId === preset.id) {
            return APP.PrintPivot.renderReport(active, school, periods);
          }
          return APP.PrintPivot.renderPreset(preset.id, school, periods);
        },
        builtin: false,
      });
    }
  }

  APP.PrintPresets = { list, get, registerAll };

  registerAll();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerAll, { once: true });
  }
})();
