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
            name: periodLabel(p, i),
            abbr: periodLabel(p, i),
            _dim: "period",
            _startMin: (p && p.startMin != null) ? p.startMin : null,
            _endMin:   (p && p.endMin   != null) ? p.endMin   : null,
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

  function fmtMin(min) {
    if (min == null || min < 0) return "";
    return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0");
  }

  function timeToMin(timeStr) {
    if (!timeStr) return -1;
    const m = String(timeStr).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return -1;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function getPeriodEnt(combo) {
    for (const [, ent] of combo.entries()) {
      if (ent._dim === "period") return ent;
    }
    return null;
  }

  function breakAfterCol(cols, idx, school) {
    if (!school || !school.breaks || !school.breaks.length) return null;
    if (idx >= cols.length - 1) return null;
    const p1 = getPeriodEnt(cols[idx]);
    const p2 = getPeriodEnt(cols[idx + 1]);
    if (!p1 || !p2 || p1._endMin == null || p2._startMin == null) return null;
    const t1 = p1._endMin, t2 = p2._startMin;
    if (t2 <= t1) return null;
    for (const b of school.breaks) {
      const bs = timeToMin(b.starttime), be = timeToMin(b.endtime);
      if (bs !== -1 && be !== -1 && bs >= t1 - 5 && be <= t2 + 5) return b;
    }
    return null;
  }

  function summaryDayColumns(visibleCols, school) {
    const cols = [];
    for (let ci = 0; ci < visibleCols.length; ci++) {
      cols.push({ kind: "period", combo: visibleCols[ci] });
      const brk = breakAfterCol(visibleCols, ci, school);
      if (brk) cols.push({ kind: "break", breakItem: brk });
    }
    return cols;
  }

  function dayRunsForSummaryColumns(summaryCols) {
    const runs = [];
    for (const col of summaryCols) {
      if (col.kind === "break") {
        const last = runs[runs.length - 1];
        if (last) last.colCount++;
        continue;
      }
      const day = col.combo.get("day");
      if (!day) continue;
      const last = runs[runs.length - 1];
      if (last && last.key === day.id) {
        last.colCount++;
      } else {
        runs.push({ key: day.id, name: day.name, colCount: 1 });
      }
    }
    return runs;
  }

  function computeSummaryDayLayout(visibleRows, visibleCols, pageBindings, pageCards, denseRows, compactLevel, orientation, school, cells) {
    let maxCardsInCell = 0;
    for (const rc of visibleRows) {
      for (const cc of visibleCols) {
        const combined = new Map([...pageBindings, ...rc, ...cc]);
        maxCardsInCell = Math.max(maxCardsInCell, cardsMatching(pageCards, combined).length);
      }
    }

    const mmToPx = 3.779527559;
    const pageHeightPx = (orientation === "portrait" ? 297 : 210) * mmToPx;
    const paddingPx = 28 * mmToPx;
    const headerFooterReservePx = 72;
    const fitCellHeightPx = Math.max(20, Math.floor((pageHeightPx - paddingPx - headerFooterReservePx) / Math.max(1, denseRows)));
    const desiredHeightPx = maxCardsInCell * (compactLevel === 2 ? 8.4 : 9) + (compactLevel === 2 ? 7 : 9);
    const cellMinHeightPx = Math.max(20, Math.min(desiredHeightPx, fitCellHeightPx));
    const linePx = Math.max(7, Math.min(compactLevel === 2 ? 8.5 : 9.5, (cellMinHeightPx - 6) / Math.max(1, maxCardsInCell)));
    const fontPx = Math.max(5.8, Math.min(compactLevel === 2 ? 7.5 : 8.5, linePx - 1));

    const layout = {
      summaryDayMaxCards: maxCardsInCell,
      summaryDayCellMinHeightPx: cellMinHeightPx,
      summaryDayFontPx: fontPx,
      summaryDayLineHeightPx: linePx,
      summaryDayShowMeta: maxCardsInCell <= 8 && denseRows <= 20 && fontPx >= 6.8,
    };

    if (cells === "summary-class-day-period") {
      const summaryCols = summaryDayColumns(visibleCols, school);
      const runs = dayRunsForSummaryColumns(summaryCols);
      const pageWidthPx = (orientation === "portrait" ? 210 : 297) * mmToPx;
      const paddingWidthPx = 24 * mmToPx;
      const rowHeaderWidthPx = compactLevel === 2 ? 46 : compactLevel === 1 ? 58 : 80;
      const availableGridWidthPx = pageWidthPx - paddingWidthPx - rowHeaderWidthPx;
      const breakCount = summaryCols.filter(col => col.kind === "break").length;
      const teachingColCount = Math.max(1, summaryCols.filter(col => col.kind === "period").length);
      const minPeriodWidthPx = compactLevel === 2 ? 6 : compactLevel === 1 ? 7 : 8;
      let breakWidthPx = compactLevel === 2 ? 12 : compactLevel === 1 ? 14 : 16;
      let periodColWidthPx = (availableGridWidthPx - breakCount * breakWidthPx) / teachingColCount;
      if (periodColWidthPx < minPeriodWidthPx && breakCount > 0) {
        breakWidthPx = Math.max(4, (availableGridWidthPx - teachingColCount * minPeriodWidthPx) / breakCount);
        periodColWidthPx = Math.max(minPeriodWidthPx, (availableGridWidthPx - breakCount * breakWidthPx) / teachingColCount);
      }
      periodColWidthPx = Math.max(5, periodColWidthPx);
      const periodFontPx = Math.max(5.8, Math.min(compactLevel === 2 ? 7.2 : 8, periodColWidthPx * 0.48));
      layout.summaryDayColumns = summaryCols;
      layout.summaryDayRuns = runs;
      layout.summaryDayPeriodColWidthPx = periodColWidthPx;
      layout.summaryDayBreakColWidthPx = breakWidthPx;
      layout.summaryDayFontPx = Math.min(layout.summaryDayFontPx, periodFontPx);
      layout.summaryDayLineHeightPx = Math.max(6.8, Math.min(layout.summaryDayLineHeightPx, layout.summaryDayFontPx + 1.2));
      layout.summaryDayMaxLines = Math.max(1, Math.floor(layout.summaryDayCellMinHeightPx / layout.summaryDayLineHeightPx));
      layout.summaryDayShowMeta = false;
    }

    return layout;
  }

  function ordinal(n) {
    const suff = ["th","st","nd","rd"];
    const v = n % 100;
    return n + (suff[(v-20)%10] || suff[v] || suff[0]);
  }

  function periodLabel(p, i) {
    const label = (p && p.label) ? String(p.label) : ordinal(i + 1);
    return /^\d+$/.test(label) ? ordinal(Number(label)) : label;
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

  function appendSummaryDayPeriodHeader(thead, report) {
    const layout = report._layout || {};
    const periodColWidthPx = layout.summaryDayPeriodColWidthPx || 18;
    const breakColWidthPx = layout.summaryDayBreakColWidthPx || 16;
    const summaryCols = layout.summaryDayColumns || [];
    const runs = layout.summaryDayRuns || [];

    if (runs.length === 0) {
      const headerRow = el("tr");
      headerRow.appendChild(el("th", {
        style: "border:1px solid #999;padding:3px;background:#fafafa;width:" + layout.rowHeaderWidthPx + "px",
      }, ""));
      for (const col of summaryCols) {
        if (col.kind === "break") {
          headerRow.appendChild(el("th", {
            style: "border:1px solid #bbb;padding:2px;background:#efefeb;width:" + breakColWidthPx + "px;font-size:8px;text-align:center;color:#666",
          }, ""));
          continue;
        }
        const cc = col.combo;
        const labels = [];
        let startMin = null, endMin = null;
        for (const [dim, ent] of cc.entries()) {
          if (dim === "period") {
            labels.push(ent.abbr || ent.name);
            if (ent._startMin != null) startMin = ent._startMin;
            if (ent._endMin   != null) endMin   = ent._endMin;
          }
        }
        headerRow.appendChild(el("th", {
          style: "border:1px solid #999;padding:2px;background:#fafafa;font-weight:700;font-size:" + report._layout.headerFontPx + "px;text-align:center;font-family:system-ui;width:" + periodColWidthPx + "px",
        }, labels.join(" · ")));
      }
      thead.appendChild(headerRow);
      return;
    }

    const headerRow = el("tr");
    headerRow.appendChild(el("th", {
      rowspan: "2",
      style: "border:1px solid #999;padding:3px;background:#fafafa;width:" + layout.rowHeaderWidthPx + "px",
    }, ""));

    for (const run of runs) {
      headerRow.appendChild(el("th", {
        colspan: String(run.colCount || 0),
        style: "border:1px solid #999;padding:3px 2px;background:#fafafa;font-weight:700;font-size:" + report._layout.headerFontPx + "px;text-align:center;font-family:system-ui",
      }, run.name));
    }
    thead.appendChild(headerRow);

    const periodRow = el("tr");
    periodRow.appendChild(el("th", {
      style: "border:1px solid #999;padding:3px;background:#fafafa;width:" + layout.rowHeaderWidthPx + "px",
    }, ""));
    for (const col of summaryCols) {
      if (col.kind === "break") {
        periodRow.appendChild(el("th", {
          style: "border:1px solid #bbb;padding:2px;background:#efefeb;width:" + breakColWidthPx + "px;font-size:8px;text-align:center;color:#666",
        }, ""));
        continue;
      }
      const cc = col.combo;
      const labels = [];
      let startMin = null, endMin = null;
      for (const [dim, ent] of cc.entries()) {
        if (dim === "period") {
          labels.push(ent.abbr || ent.name);
          if (ent._startMin != null) startMin = ent._startMin;
          if (ent._endMin   != null) endMin   = ent._endMin;
        }
      }
      periodRow.appendChild(el("th", {
        style: "border:1px solid #999;padding:2px;background:#fafafa;font-weight:700;font-size:" + report._layout.headerFontPx + "px;text-align:center;font-family:system-ui;width:" + periodColWidthPx + "px",
      }, labels.join(" · ")));
    }
    thead.appendChild(periodRow);
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

    const denseCols = visibleCols.length;
    const denseRows = visibleRows.length;
    const compactLevel = denseCols > 34 || denseRows > 22 ? 2 : (denseCols > 16 || denseRows > 10 ? 1 : 0);
    const orientation = report.pageSetup?.orientation || (denseCols > 10 ? "landscape" : "portrait");
    const pageWidth = orientation === "portrait" ? "210mm" : "297mm";
    const pageHeight = orientation === "portrait" ? "297mm" : "210mm";
    const summaryDayLayout = report.cells === "summary-class-day" || report.cells === "summary-class-day-period"
      ? computeSummaryDayLayout(visibleRows, visibleCols, pageBindings, pageCards, denseRows, compactLevel, orientation, school, report.cells)
      : {};
    report._layout = {
      compactLevel,
      cellMinHeightPx: summaryDayLayout.summaryDayCellMinHeightPx || (compactLevel === 2 ? 22 : compactLevel === 1 ? 34 : 54),
      rowHeaderWidthPx: compactLevel === 2 ? 46 : compactLevel === 1 ? 58 : 80,
      bodyFontPx: compactLevel === 2 ? 8 : compactLevel === 1 ? 9.5 : 11,
      headerFontPx: compactLevel === 2 ? 8 : compactLevel === 1 ? 9.5 : 11,
      rowFontPx: compactLevel === 2 ? 10 : compactLevel === 1 ? 12 : 14,
      ...summaryDayLayout,
    };

    const page = el("div", {
      class: "chrx-preview-page chrx-print-page chrx-pivot-page",
      style: "background:#fff;color:#111;width:" + pageWidth + ";min-height:" + pageHeight + ";padding:14mm 12mm;box-sizing:border-box;display:flex;flex-direction:column;gap:6px;font-family:system-ui",
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
    // Sub-header: school name left + class teacher right (only for class-paged reports)
    const classEnt = pageBindings && pageBindings.get("class");
    if (classEnt) {
      const cls = (school.classes || []).find(c => c.id === classEnt.id);
      const tid = cls && (cls._teacherId || cls.teacherId || cls.classTeacherId);
      const tObj = tid && (school.teachers || []).find(t => t.id === tid);
      const ctName = tObj ? (tObj.name || tObj.abbreviation || "") : "";
      const rid = cls && (cls.homeRoomId || cls.classroomId || (cls._classroomIds || [])[0]);
      const rObj = rid && (school.classrooms || []).find(r => r.id === rid);
      const roomName = rObj ? (rObj.name || rObj.abbreviation || "") : "";
      const sub = el("div", {
        style: "display:flex;justify-content:space-between;font-size:9.5px;color:#555;border-bottom:1px solid #bbb;padding-bottom:4px;margin-bottom:2px",
      });
      sub.appendChild(el("span", null, schoolName));
      const meta = [];
      if (roomName) meta.push("Home classroom: " + roomName);
      if (ctName) meta.push("Class teacher: " + ctName);
      if (meta.length) sub.appendChild(el("span", null, meta.join(" · ")));
      page.appendChild(sub);
    }
    if (totalPages > 1) {
      page.appendChild(el("div", {
        style: "text-align:right;font-size:10px;color:#666;font-family:'JetBrains Mono',ui-monospace,monospace",
      }, "Page " + (pageIndex+1) + " of " + totalPages));
    }

    const tableWrap = el("div", { style: "flex:1;overflow:visible;display:flex;gap:6px" });
    const table = el("table", {
      class: "chrx-pivot-grid",
      style: "border-collapse:collapse;width:100%;table-layout:fixed;font-size:" + report._layout.bodyFontPx + "px",
    });

    const thead = el("thead");
    if (report.cells === "summary-class-day-period") {
      appendSummaryDayPeriodHeader(thead, report);
    } else {
      const headerRow = el("tr");
      headerRow.appendChild(el("th", {
        style: "border:1px solid #999;padding:3px;background:#fafafa;width:" + report._layout.rowHeaderWidthPx + "px",
      }, ""));
      for (let ci = 0; ci < visibleCols.length; ci++) {
        const cc = visibleCols[ci];
        const labels = [];
        let startMin = null, endMin = null;
        for (const [, ent] of cc.entries()) {
          labels.push(report.cells === "summary-class-day" && ent._dim === "day" ? ent.name : (ent.abbr || ent.name));
          if (ent._startMin != null) startMin = ent._startMin;
          if (ent._endMin   != null) endMin   = ent._endMin;
        }
        const th = el("th", {
          style: "border:1px solid #999;padding:3px 2px;background:#fafafa;font-weight:700;font-size:" + report._layout.headerFontPx + "px;text-align:center;font-family:system-ui",
        });
        th.appendChild(el("div", { style: "font-weight:700" }, labels.join(" · ")));
        if (startMin != null && endMin != null) {
          th.appendChild(el("div", { style: "font-size:8.5px;font-weight:400;color:#555;margin-top:1px" },
            fmtMin(startMin) + "–" + fmtMin(endMin)));
        }
        headerRow.appendChild(th);
        const brk = breakAfterCol(visibleCols, ci, school);
        if (brk) {
          headerRow.appendChild(el("th", {
            style: "border:1px solid #bbb;padding:2px;background:#efefeb;width:28px;font-size:8px;text-align:center;color:#666",
          }, ""));
        }
      }
      thead.appendChild(headerRow);
    }
    table.appendChild(thead);

    const tbody = el("tbody");
    for (let ri = 0; ri < visibleRows.length; ri++) {
      const rc = visibleRows[ri];
      const tr = el("tr");
      const rowLabels = [];
      for (const [, ent] of rc.entries()) rowLabels.push(ent.name || ent.abbr);
      tr.appendChild(el("td", {
        style: "border:1px solid #999;padding:4px 5px;background:#fafafa;font-weight:600;text-align:center;font-family:'Fraunces',serif;font-size:" + report._layout.rowFontPx + "px",
      }, rowLabels.join(" · ")));
      const summaryCols = report.cells === "summary-class-day-period"
        ? report._layout.summaryDayColumns
        : null;
      const colList = summaryCols || visibleCols;
      for (let ci = 0; ci < colList.length; ci++) {
        const col = colList[ci];
        if (summaryCols && col.kind === "break") {
          if (ri === 0) {
            const brkText = col.breakItem.printtext || col.breakItem.name || "BREAK";
            const brkTd = el("td", {
              rowspan: String(visibleRows.length),
              style: "border:1px solid #bbb;padding:2px;background:#efefeb;width:" + report._layout.summaryDayBreakColWidthPx + "px;vertical-align:middle;text-align:center",
            });
            const brkInner = el("div", {
              style: "writing-mode:vertical-lr;transform:rotate(180deg);font-weight:700;font-size:8.5px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin:0 auto",
            }, brkText);
            brkTd.appendChild(brkInner);
            tr.appendChild(brkTd);
          }
          continue;
        }
        const cc = col.combo || col;
        const combined = new Map([...pageBindings, ...rc, ...cc]);
        const cellCards = cardsMatching(pageCards, combined);
        const cellNode = el("td", {
          style: "border:1px solid #ccc;padding:0;vertical-align:top;height:" + report._layout.cellMinHeightPx + "px",
        });
        if (APP.PrintCellRenderer && typeof APP.PrintCellRenderer.renderCell === "function") {
          const kind = report.cells || "draw-lessons";
          const renderer = kind === "summary-class-day-period" || kind === "draw-lessons"
            ? APP.PrintCellRenderer.renderCell
            : kind === "summary-class-day"
              ? APP.PrintCellRenderer.renderSummaryClassDayCell
              : (APP.PrintCellRenderer.renderAggregateCell || APP.PrintCellRenderer.renderCell);
          cellNode.appendChild(renderer(cellCards, report, school));
        } else if (cellCards.length > 0) {
          const subj = cellCards[0]?.subjectId;
          const text = (school.subjects || []).find(s => s.id === subj)?.abbreviation || subj || "?";
          cellNode.appendChild(el("div", { style: "padding:4px;font-size:11px;text-align:center" }, text));
        }
        tr.appendChild(cellNode);
        // Non-summary path: mirror the header's break columns in the body so
        // the two stay column-aligned under table-layout:fixed. (The header
        // inserts a break <th> after each qualifying period via breakAfterCol;
        // without the matching body <td> every period cell shifts left into
        // the narrow break slot.)
        if (!summaryCols) {
          const brk = breakAfterCol(visibleCols, ci, school);
          if (brk && ri === 0) {
            const brkText = brk.printtext || brk.name || "BREAK";
            const brkTd = el("td", {
              rowspan: String(visibleRows.length),
              style: "border:1px solid #bbb;padding:2px;background:#efefeb;width:28px;vertical-align:middle;text-align:center",
            });
            const brkInner = el("div", {
              style: "writing-mode:vertical-lr;transform:rotate(180deg);font-weight:700;font-size:8.5px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin:0 auto",
            }, brkText);
            brkTd.appendChild(brkInner);
            tr.appendChild(brkTd);
          }
        }
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    if (report.extraCols && report.extraCols.length > 0) {
      const extraWidth = report.extraCols.reduce((sum, ec) => sum + ((ec.width || 10) * 5), 0);
      const extraPanel = el("table", {
        class: "chrx-pivot-extras",
        style: "border-collapse:collapse;width:" + extraWidth + "px;table-layout:fixed;font-size:11px",
      });
      const extHead = el("thead");
      const extHeadRow = el("tr");
      for (const ec of report.extraCols) {
        extHeadRow.appendChild(el("th", {
          style: "border:1px solid #999;padding:4px;background:#fafafa;font-weight:700;width:" + ((ec.width || 10) * 5) + "px",
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
    const resolvedPeriods = periods || PERIODS_DEFAULT;
    const joinedSchool = Object.assign({}, school, { cards: joinedCards, _printPeriods: resolvedPeriods });
    const pageCombos = axisCombinations(report.pages, joinedSchool, resolvedPeriods, report.filters);
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
