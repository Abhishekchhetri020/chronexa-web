/* Per-cell renderer for the pivot engine.
 *
 * Given:
 *   cards    — array of card objects (can be empty, one, or many)
 *   report   — the active PrintReport (carries elementStyles[])
 *   school   — the school document (for entity name/abbr lookups)
 *
 * Returns a DOM node sized to fill the parent cell. Handles multi-card-
 * per-cell rendering by joining element strings with commas (H1).
 * Multi-class activity cards render the Class element with slashes (H6).
 *
 * Phase 1 scope: honour enabled / size / anchor / bold / italic / underline
 * per element. Defer Set-for-more, font-family override per element,
 * text-shrink-to-fit (Phase 7), and conditional toggles (Phase 2 polish).
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const ANCHOR_TO_FLEX = {
    "top-left":      { justify: "flex-start", align: "flex-start", text: "left" },
    "top-center":    { justify: "flex-start", align: "center",      text: "center" },
    "top-right":     { justify: "flex-start", align: "flex-end",   text: "right" },
    "middle-left":   { justify: "center",     align: "flex-start", text: "left" },
    "middle-center": { justify: "center",     align: "center",     text: "center" },
    "middle-right":  { justify: "center",     align: "flex-end",   text: "right" },
    "bottom-left":   { justify: "flex-end",   align: "flex-start", text: "left" },
    "bottom-center": { justify: "flex-end",   align: "center",     text: "center" },
    "bottom-right":  { justify: "flex-end",   align: "flex-end",   text: "right" },
  };

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

  function elementStyleFor(report, key) {
    const styles = report?.elementStyles || [];
    return styles.find(s => s.key === key) || { enabled: false };
  }

  function entityName(school, kind, id, fmt) {
    const list = {
      subject: school.subjects, teacher: school.teachers,
      class: school.classes, classroom: school.classrooms,
      group: school.groups, student: school.students,
    }[kind] || [];
    const ent = list.find(e => e.id === id);
    if (!ent) return id || "";
    if (fmt === "full") return ent.name || ent.id;
    return ent.abbreviation || ent.shortName || ent.name || ent.id;
  }

  function entityColor(school, kind, id) {
    const list = {
      subject: school.subjects, teacher: school.teachers,
      class: school.classes, classroom: school.classrooms,
    }[kind] || [];
    const ent = list.find(e => e.id === id);
    return ent?.color || null;
  }

  /** Multi-card label join: comma for most elements, slash for Class element
   *  when one card spans multiple classes (the H6 multi-class case).
   *  Honours style.labelOverride — when set, returns that fixed string. */
  function joinElementLabels(cards, key, school, style) {
    if (style.labelOverride && String(style.labelOverride).trim().length > 0 && cards.length > 0) {
      return String(style.labelOverride).trim();
    }
    const fmt = style.textFormat || "abbreviation";
    if (key === "subject") {
      const seen = new Set();
      const out = [];
      for (const c of cards) {
        if (!c.subjectId || seen.has(c.subjectId)) continue;
        seen.add(c.subjectId);
        out.push(entityName(school, "subject", c.subjectId, fmt));
      }
      return out.join(", ");
    }
    if (key === "teacher") {
      const seen = new Set();
      const out = [];
      for (const c of cards) {
        for (const tid of (c.teacherIds || [])) {
          if (seen.has(tid)) continue;
          seen.add(tid);
          out.push(entityName(school, "teacher", tid, fmt));
        }
      }
      const MAX_TEACHERS = 3;
      return out.length > MAX_TEACHERS
        ? out.slice(0, MAX_TEACHERS).join(" / ") + " …"
        : out.join(" / ");
    }
    if (key === "class") {
      // Per-card class lists join with slashes (multi-class activity),
      // then card-to-card joins with commas (multi-card-per-cell).
      const parts = [];
      for (const c of cards) {
        const ids = c.classIds || [];
        if (ids.length === 0) continue;
        const slashed = ids.map(id => entityName(school, "class", id, fmt)).join("/");
        parts.push(slashed);
      }
      // Dedupe by string
      return Array.from(new Set(parts)).join(", ");
    }
    if (key === "classroom") {
      const seen = new Set();
      const out = [];
      for (const c of cards) {
        const rid = c.roomId || (c.roomIds && c.roomIds[0]);
        if (!rid || seen.has(rid)) continue;
        seen.add(rid);
        const r = entityName(school, "classroom", rid, fmt);
        if (style.conditional?.doNotPrintIfHomeClassroom) {
          // Skip if this is the home classroom of any class on the card
          const classRooms = (c.classIds || []).map(cid => {
            const cls = (school.classes || []).find(cc => cc.id === cid);
            return cls?.homeRoomId;
          });
          if (classRooms.includes(rid)) continue;
        }
        out.push(r);
      }
      return out.join(", ");
    }
    if (key === "group") {
      const seen = new Set();
      const out = [];
      for (const c of cards) {
        for (const gid of (c.groupIds || [])) {
          if (seen.has(gid)) continue;
          seen.add(gid);
          // "Do not print if entire class" — skip group label when the
          // group represents the whole class
          if (style.conditional?.doNotPrintIfEntireClass) {
            const g = (school.groups || []).find(gg => gg.id === gid);
            if (g?.entireClass) continue;
          }
          out.push(entityName(school, "group", gid, fmt));
        }
      }
      return out.join(", ");
    }
    if (key === "count") {
      return String(cards.length);
    }
    if (key === "bellTimes") {
      const seen = new Set();
      const out = [];
      for (const c of cards) {
        const key = c.day + "_" + c.period;
        if (seen.has(key)) continue;
        seen.add(key);
        const t = lookupBellTime(school, c.period);
        if (t) out.push(t);
      }
      return out.join(", ");
    }
    return "";
  }

  function lookupBellTime(school, period) {
    const bell = school?.bell || school?.bells?.[0];
    if (!bell || !bell.periods) return "";
    const p = bell.periods[period - 1];
    if (!p) return "";
    return (p.start || "") + (p.end ? "–" + p.end : "");
  }

  function renderElement(text, style) {
    if (!text || !style.enabled) return null;
    const fontStyle = [];
    if (style.bold)      fontStyle.push("font-weight:700");
    if (style.italic)    fontStyle.push("font-style:italic");
    if (style.underline) fontStyle.push("text-decoration:underline");
    if (style.font && style.font !== "system-ui") fontStyle.push("font-family:'" + style.font + "', system-ui");
    // Phase 7 — text-shrink-to-fit. Use container-query units (cqi) for size
    // when supported, clamped between a 6px floor and the configured % as
    // the ceiling. Browsers that don't support container queries gracefully
    // fall back to the second clamp arg.
    const ceilingPx = Math.max(7, Math.round((style.size || 14) * 0.6));
    const floorPx = 6;
    fontStyle.push("font-size:clamp(" + floorPx + "px, " + Math.max(6, Math.round((style.size || 14) * 0.35)) + "cqi, " + ceilingPx + "px)");
    fontStyle.push("overflow-wrap:break-word");
    fontStyle.push("word-break:break-word");
    fontStyle.push("hyphens:auto");
    fontStyle.push("max-width:100%");
    return el("div", {
      style: "line-height:1.15;" + fontStyle.join(";"),
    }, text);
  }

  function getCardBgColor(cards, report, school) {
    if (!report.colors?.cardOn) return null;
    const key = report.colors.cardKey || "subject";
    if (cards.length === 0) return null;
    const card = cards[0];
    let id = null;
    if (key === "subject")   id = card.subjectId;
    else if (key === "teacher")   id = (card.teacherIds || [])[0];
    else if (key === "class")     id = (card.classIds || [])[0];
    else if (key === "classroom") id = card.roomId || (card.roomIds || [])[0];
    if (!id) return null;
    return entityColor(school, key, id);
  }

  function renderCell(cards, report, school) {
    cards = cards || [];
    const cell = el("div", {
      class: "chrx-pivot-cell",
      style: "width:100%;height:100%;min-height:48px;position:relative;container-type:inline-size",
    });
    if (cards.length === 0) return cell;

    const bg = getCardBgColor(cards, report, school);
    if (bg) cell.style.background = bg;

    // Collect enabled elements grouped by anchor key so that elements sharing
    // the same anchor (e.g. teacher + classroom) stack on separate lines in
    // one wrapper rather than each getting their own overlapping absolute div.
    const ELEMENT_KEYS = ["subject","teacher","class","group","classroom","count","bellTimes"];
    const byAnchor = new Map();
    for (const key of ELEMENT_KEYS) {
      const style = elementStyleFor(report, key);
      if (!style.enabled) continue;
      const text = joinElementLabels(cards, key, school, style);
      if (!text) continue;
      const anchorKey = style.anchor || "middle-center";
      if (!byAnchor.has(anchorKey)) byAnchor.set(anchorKey, []);
      byAnchor.get(anchorKey).push({ text, style });
    }

    for (const [anchorKey, items] of byAnchor) {
      const anchor = ANCHOR_TO_FLEX[anchorKey] || ANCHOR_TO_FLEX["middle-center"];
      const wrap = el("div", {
        style: "position:absolute;inset:0;display:flex;flex-direction:column;justify-content:" + anchor.justify +
          ";align-items:" + anchor.align +
          ";text-align:" + anchor.text +
          ";padding:2px 4px;pointer-events:none",
      });
      for (const { text, style } of items) {
        const elNode = renderElement(text, style);
        if (elNode) wrap.appendChild(elNode);
      }
      cell.appendChild(wrap);
    }

    return cell;
  }

  APP.PrintCellRenderer = { renderCell, joinElementLabels };
})();
