/* Pivot engine — Phase 1 of the print-system rewrite.
 *
 * Pure function: renderReport(report, school, periods) returns Array<HTMLElement>,
 * one A4 page per element. The existing print_preview.js mounts these into
 * the preview docShell and prints via window.print().
 *
 * Architecture:
 *   1. Determine which entities each axis dim resolves to (e.g., "class"
 *      → all 23 classes, "day" → 6 days, "period" → 8 periods).
 *   2. Loop the Page axis to produce N pages.
 *   3. Per page, build Row × Col grid by looping the Rows axis × Cols axis.
 *   4. Per (row, col) intersection, look up which cards belong there using
 *      the page's bound dimensions as additional filters.
 *   5. Call PrintCellRenderer.renderCell(cards, report, school) for the cell.
 *
 * Multi-card-per-cell: H1 from PRINT-MAP. When multiple cards fall in one
 * intersection (e.g., Summary report where columns are Day × Period), the
 * cell renderer joins each element-string with commas.
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const PERIODS_DEFAULT = 8;
  const DAYS_DEFAULT = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const DAYS_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat"];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }

  // ────────────────────────────────────────────────────────────────────
  // Dimension resolution
  // ────────────────────────────────────────────────────────────────────

  /** Return the entity list for a dim, e.g. all classes / all days. */
  function entitiesFor(dim, school, periods) {
    periods = periods || PERIODS_DEFAULT;
    switch (dim) {
      case "day": {
        // Honor school.daysPerWeek so 5-day schools don't get a phantom
        // Saturday column (or row) on every print. Previously this hardcoded
        // 6 days, masked only by `hideEmptyRows: true` presets — and printed
        // an empty Saturday for any preset that didn't opt in.
        const dpw = (school && (school.daysPerWeek | 0)) || DAYS_DEFAULT.length;
        const n = Math.max(1, Math.min(DAYS_DEFAULT.length, dpw));
        return DAYS_DEFAULT.slice(0, n).map((name, i) => ({
          id: i, name, abbr: DAYS_SHORT[i], _dim: "day",
        }));
      }
      case "period": {
        // When the caller passes the actual bell array (school.bell.periods),
        // honor each period's real index + label — schools with break
        // periods interleaved (e.g. P1 P2 BREAK P3) used to silently
        // mis-match because we generated sequential ids 1..N regardless.
        if (Array.isArray(periods) && periods.length > 0 && typeof periods[0] === "object") {
          return periods.map((p, i) => ({
            id: (p && p.index != null) ? (p.index | 0) : (i + 1),
            name: (p && p.label) ? p.label : ordinal(i + 1),
            abbr: (p && p.label) ? p.label : ordinal(i + 1),
            _dim: "period",
          }));
        }
        const n = (typeof periods === "number" && periods > 0) ? periods : PERIODS_DEFAULT;
        return Array.from({length: n}, (_, i) => ({
          id: i+1, name: ordinal(i+1), abbr: ordinal(i+1), _dim: "period",
        }));
      }
      case "week":
        return [{ id: "w1", name: "Week 1", abbr: "W1", _dim: "week" }];
      case "term":
        return [{ id: "t1", name: "Term 1", abbr: "T1", _dim: "term" }];
      case "class":
        return (school.classes || []).map(c => ({
          id: c.id, name: c.name || c.id, abbr: c.abbreviation || c.shortName || c.name || c.id, _dim: "class",
        }));
      case "teacher":
        return (school.teachers || []).map(t => ({
          id: t.id, name: pickName(t), abbr: t.abbreviation || t.shortName || pickName(t), _dim: "teacher", _color: t.color,
        }));
      case "subject":
        return (school.subjects || []).map(s => ({
          id: s.id, name: s.name || s.id, abbr: s.abbreviation || s.shortName || s.name || s.id, _dim: "subject", _color: s.color,
        }));
      case "classroom":
        return (school.classrooms || []).map(r => ({
          id: r.id, name: r.name || r.id, abbr: r.abbreviation || r.shortName || r.name || r.id, _dim: "classroom",
        }));
      case "student":
        return (school.students || []).map(s => ({
          id: s.id, name: s.name || s.id, abbr: s.abbreviation || s.shortName || s.name || s.id, _dim: "student",
        }));
      default:
        return [];
    }
  }

  function ordinal(n) {
    const suff = ["th","st","nd","rd"];
    const v = n % 100;
    return n + (suff[(v-20)%10] || suff[v] || suff[0]);
  }

  function pickName(t) {
    if (t.name) return t.name;
    const parts = [];
    if (t.firstName) parts.push(t.firstName);
    if (t.lastName)  parts.push(t.lastName);
    return parts.join(" ") || t.id;
  }

  // ────────────────────────────────────────────────────────────────────
  // Card matching
  // ────────────────────────────────────────────────────────────────────

  /** True if card matches an axis-dim's specific entity. */
  function cardMatches(card, dim, entity) {
    if (!card || !entity) return false;
    switch (dim) {
      case "day":       return card.day === entity.id;
      case "period":    return card.period === entity.id;
      case "class":     return Array.isArray(card.classIds) && card.classIds.includes(entity.id);
      case "teacher":   return Array.isArray(card.teacherIds) && card.teacherIds.includes(entity.id);
      case "subject":   return card.subjectId === entity.id;
      case "classroom": return (card.roomId === entity.id) || (Array.isArray(card.roomIds) && card.roomIds.includes(entity.id));
      case "student":   return Array.isArray(card.studentIds) && card.studentIds.includes(entity.id);
      case "week":      return true;
      case "term":      return true;
      default:          return false;
    }
  }

  /** Filter cards matching ALL bindings in `bindings` (Map of dim→entity). */
  function cardsMatching(cards, bindings) {
    return cards.filter(card => {
      for (const [dim, entity] of bindings.entries()) {
        if (!cardMatches(card, dim, entity)) return false;
      }
      return true;
    });
  }

  /** Apply report.filters to a list of entities for a dim. */
  function applyFilters(dim, entities, filters) {
    if (!filters) return entities;
    const key = {
      "class":"classes", "teacher":"teachers", "classroom":"rooms",
      "subject":"subjects", "period":"periods", "day":"days",
    }[dim];
    if (!key) return entities;
    const allow = filters[key];
    if (!allow || allow.length === 0) return entities;
    return entities.filter(e => allow.includes(e.id));
  }

  // ────────────────────────────────────────────────────────────────────
  // Page composition
  // ────────────────────────────────────────────────────────────────────

  /** Cross product of active dims on an axis → list of bindings. */
  function axisCombinations(dims, school, periods, filters) {
    const Schema = APP.PrintReportSchema;
    const active = Schema.activeDims(dims);
    if (active.length === 0) return [new Map()];
    let combos = [new Map()];
    for (const dim of active) {
      const ents = applyFilters(dim, entitiesFor(dim, school, periods), filters);
      const next = [];
      for (const combo of combos) {
        for (const ent of ents) {
          const m = new Map(combo);
          m.set(dim, ent);
          next.push(m);
        }
      }
      combos = next;
    }
    return combos;
  }

  function renderPage(report, school, periods, pageBindings, pageIndex, totalPages) {
    const allCards = school.cards || [];
    const pageCards = cardsMatching(allCards, pageBindings);

    let pageTitle = report.name || "";
    if (pageBindings.size > 0) {
      const titleParts = [];
      for (const [, ent] of pageBindings.entries()) titleParts.push(ent.name || ent.abbr);
      pageTitle = titleParts.join(" · ");
    }

    const rowCombos = axisCombinations(report.rows, school, periods, report.filters);
    const colCombos = axisCombinations(report.cols, school, periods, report.filters);

    let visibleRows = rowCombos;
    let visibleCols = colCombos;
    if (report.hideEmptyCols) {
      visibleCols = colCombos.filter(cc => {
        const combined = new Map([...pageBindings, ...cc]);
        return cardsMatching(pageCards, combined).length > 0;
      });
    }
    if (report.hideEmptyRows) {
      visibleRows = rowCombos.filter(rc => {
        const combined = new Map([...pageBindings, ...rc]);
        return cardsMatching(pageCards, combined).length > 0;
      });
    }

    const page = el("div", {
      class: "chrx-print-page chrx-pivot-page",
      style: "background:#fff;color:#111;width:100%;height:100%;padding:18mm 14mm;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;font-family:system-ui",
    });

    const schoolName = (school.schoolName || school.name || "");
    if (schoolName || report.design?.headerText) {
      page.appendChild(el("div", {
        style: "text-align:center;font-weight:600;font-size:14px;letter-spacing:.005em",
      }, report.design?.headerText || schoolName));
    }
    if (pageTitle) {
      page.appendChild(el("div", {
        style: "text-align:center;font-weight:700;font-size:18px;font-family:'Fraunces',serif;font-style:italic;letter-spacing:-.01em",
      }, pageTitle));
    }
    if (totalPages > 1) {
      page.appendChild(el("div", {
        style: "text-align:right;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace",
      }, "Page " + (pageIndex+1) + " of " + totalPages));
    }

    const tableWrap = el("div", { style: "flex:1;overflow:hidden;display:flex;gap:6px" });
    const table = el("table", {
      class: "chrx-pivot-grid",
      style: "border-collapse:collapse;width:100%;height:100%;table-layout:fixed;font-size:11px",
    });

    const thead = el("thead");
    const headerRow = el("tr");
    headerRow.appendChild(el("th", {
      style: "border:1px solid #999;padding:4px;background:#fafafa;width:80px",
    }, ""));
    for (const cc of visibleCols) {
      const labels = [];
      for (const [, ent] of cc.entries()) labels.push(ent.abbr || ent.name);
      headerRow.appendChild(el("th", {
        style: "border:1px solid #999;padding:4px 2px;background:#fafafa;font-weight:700;font-size:11px;text-align:center;font-family:system-ui",
      }, labels.join(" · ")));
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const rc of visibleRows) {
      const tr = el("tr");
      const rowLabels = [];
      for (const [, ent] of rc.entries()) rowLabels.push(ent.name || ent.abbr);
      tr.appendChild(el("td", {
        style: "border:1px solid #999;padding:6px 8px;background:#fafafa;font-weight:600;text-align:center;font-family:'Fraunces',serif;font-size:14px",
      }, rowLabels.join(" · ")));
      for (const cc of visibleCols) {
        const combined = new Map([...pageBindings, ...rc, ...cc]);
        const cellCards = cardsMatching(pageCards, combined);
        const cellNode = el("td", {
          style: "border:1px solid #ccc;padding:0;vertical-align:top;height:48px",
        });
        if (APP.PrintCellRenderer && typeof APP.PrintCellRenderer.renderCell === "function") {
          cellNode.appendChild(APP.PrintCellRenderer.renderCell(cellCards, report, school));
        } else if (cellCards.length > 0) {
          const subj = cellCards[0]?.subjectId;
          const text = (school.subjects || []).find(s => s.id === subj)?.abbreviation || subj || "?";
          cellNode.appendChild(el("div", { style: "padding:4px;font-size:11px;text-align:center" }, text));
        }
        tr.appendChild(cellNode);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    if (report.extraCols && report.extraCols.length > 0) {
      const extraPanel = el("table", {
        class: "chrx-pivot-extras",
        style: "border-collapse:collapse;width:" + (report.extraCols.length * 100) + "px;table-layout:fixed;font-size:11px",
      });
      const extHead = el("thead");
      const extHeadRow = el("tr");
      for (const ec of report.extraCols) {
        extHeadRow.appendChild(el("th", {
          style: "border:1px solid #999;padding:4px;background:#fafafa;font-weight:700",
        }, ec.header || ec.type));
      }
      extHead.appendChild(extHeadRow);
      extraPanel.appendChild(extHead);
      const extBody = el("tbody");
      const subjectsInPage = {};
      for (const card of pageCards) {
        const sid = card.subjectId;
        subjectsInPage[sid] = (subjectsInPage[sid] || 0) + 1;
      }
      const subjList = Object.keys(subjectsInPage).map(sid => {
        const subj = (school.subjects || []).find(s => s.id === sid);
        return { id: sid, name: subj?.name || sid, count: subjectsInPage[sid] };
      }).sort((a,b) => b.count - a.count);
      const totalLessons = subjList.reduce((s,x) => s+x.count, 0);
      const cellPattern = report.extraCols.map(ec => ec.type);
      // Helper: list distinct entities from this subject's cards
      function distinctTeachersForSubject(sid) {
        const set = new Set();
        for (const c of pageCards) {
          if (c.subjectId !== sid) continue;
          for (const tid of (c.teacherIds || [])) set.add(tid);
        }
        return Array.from(set).map(tid => {
          const t = (school.teachers || []).find(x => x.id === tid);
          return t?.abbreviation || t?.name || tid;
        }).join(", ");
      }
      function distinctRoomsForSubject(sid) {
        const set = new Set();
        for (const c of pageCards) {
          if (c.subjectId !== sid) continue;
          if (c.roomId) set.add(c.roomId);
          for (const rid of (c.roomIds || [])) set.add(rid);
        }
        return Array.from(set).map(rid => {
          const r = (school.classrooms || []).find(x => x.id === rid);
          return r?.abbreviation || r?.name || rid;
        }).join(", ");
      }
      for (const sub of subjList) {
        const tr = el("tr");
        for (let i = 0; i < cellPattern.length; i++) {
          const type = cellPattern[i];
          let text = "";
          if (type === "subjects-count")             text = sub.name;
          else if (type === "sum-of-lessons")        text = String(sub.count);
          else if (type === "teachers-of-lessons")   text = distinctTeachersForSubject(sub.id);
          else if (type === "classrooms-of-lessons") text = distinctRoomsForSubject(sub.id);
          else if (type === "sum-of-covered-lessons") text = "0";  // Chronexa substitution data not yet wired
          else if (type === "empty")                 text = "";
          else                                       text = sub.name;
          tr.appendChild(el("td", { style: "border:1px solid #ccc;padding:3px 6px;font-size:11px" }, text));
        }
        extBody.appendChild(tr);
      }
      const totalTr = el("tr");
      for (let i = 0; i < cellPattern.length; i++) {
        const type = cellPattern[i];
        let text = "";
        if (type === "subjects-count")          text = "Lessons/week";
        else if (type === "sum-of-lessons")     text = String(totalLessons);
        else if (type === "teachers-of-lessons") text = "";
        else if (type === "classrooms-of-lessons") text = "";
        totalTr.appendChild(el("td", {
          style: "border:1px solid #999;padding:3px 6px;font-weight:600;background:#fafafa;font-size:11px",
        }, text));
      }
      extBody.appendChild(totalTr);
      extraPanel.appendChild(extBody);
      tableWrap.appendChild(extraPanel);
    }

    page.appendChild(tableWrap);

    page.appendChild(el("div", {
      style: "display:flex;justify-content:space-between;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace;border-top:1px solid #eee;padding-top:6px",
    },
      el("span", null, "W.E.F " + new Date().toLocaleDateString("en-GB")),
      el("span", null, "Chronexa Web · " + (window.APP_VER || "dev"))));

    return page;
  }

  /** Join card.lessonId → lesson fields so the renderer can read
   *  classIds / teacherIds / subjectId / roomId / groupIds directly off
   *  each card. Chronexa stores these on the lesson, not the card. */
  /** Phase 6 — convert school.duties[] into card-like records that flow
   *  through the same pivot pipeline. Each duty becomes a card with
   *  subject="FD" (Floor Duty) + classroom=duty.locationName. */
  function dutiesAsCards(school) {
    const duties = school.duties || [];
    return duties.map(d => ({
      lessonId: "__duty_" + (d.id || Math.random()),
      day: d.day, period: d.period,
      classIds: [],
      teacherIds: d.teacherIds || (d.teacherId ? [d.teacherId] : []),
      subjectId: "__FD__",
      subjectLabel: d.code || "FD",
      groupIds: [],
      roomId: null,
      roomIds: [],
      roomLabel: d.locationName || d.location || "",
      _isDuty: true,
    }));
  }

  function joinCardsWithLessons(school) {
    const lessons = school.lessons || [];
    const lessonById = new Map(lessons.map(l => [l.id, l]));
    const lessonCards = (school.cards || []).map(card => {
      const l = lessonById.get(card.lessonId);
      if (!l) return card;
      // Card-level classroomId is the authoritative per-placement room;
      // the lesson's preferredRoomId is only a default for unrouted cards.
      // Without preferring card.classroomId first, room print reports
      // showed the lesson default for every card, hiding real overrides.
      const cardRoom = card.classroomId || (Array.isArray(card.roomIds) && card.roomIds[0]) || null;
      return {
        ...card,
        classIds:   l.classIds   || [],
        teacherIds: l.teacherIds || [],
        subjectId:  l.subjectId,
        groupIds:   l.groupIds   || [],
        roomId:     cardRoom || l.preferredRoomId || (Array.isArray(l.roomIds) && l.roomIds[0]) || null,
        roomIds:    l.roomIds || [],
        studentIds: l.studentIds || [],
      };
    });
    // Phase 6 — append floor-duty cards so they pivot like real lessons
    const dutyCards = dutiesAsCards(school);
    return lessonCards.concat(dutyCards);
  }

  function renderReport(report, school, periods) {
    if (!report || !school) return [];
    const joinedCards = joinCardsWithLessons(school);
    const joinedSchool = Object.assign({}, school, { cards: joinedCards });
    const pageCombos = axisCombinations(report.pages, joinedSchool, periods || PERIODS_DEFAULT, report.filters);
    const out = [];
    pageCombos.forEach((bindings, idx) => {
      out.push(renderPage(report, joinedSchool, periods || PERIODS_DEFAULT, bindings, idx, pageCombos.length));
    });
    return out;
  }

  function renderPreset(presetId, school, periods) {
    const Schema = APP.PrintReportSchema;
    const Presets = APP.PrintPresets;
    if (!Schema || !Presets) {
      console.warn("[pivot_engine] schema or presets not loaded");
      return [];
    }
    const preset = Presets.get(presetId);
    if (!preset) {
      console.warn("[pivot_engine] preset not found:", presetId);
      return [];
    }
    const report = Schema.create({ context: preset.context });
    Schema.applyPreset(report, preset);
    return renderReport(report, school, periods);
  }

  APP.PrintPivot = { renderReport, renderPreset, axisCombinations, entitiesFor };
})();
