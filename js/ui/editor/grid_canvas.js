/**
 * Editor.render(rootEl) — writable timetable grid.
 * Rows = entities (class/teacher/room per APP.editor.perspective).
 * Cols = NUM_DAYS × bell.periods.
 * Pickup/place via mousedown (no HTML5 drag). See EDITOR.md (TBD).
 */
window.Editor = (function () {
  "use strict";

  const NUM_DAYS = 6;
  const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  /** Render into a host element. Re-render is safe (innerHTML replaced). */
  function render(rootEl) {
    if (!rootEl) return;
    ensureEditorState();
    const S = window.APP.school;
    if (!S) {
      rootEl.innerHTML = `<div class="chrx-editor-empty">Load a timetable to start editing.</div>`;
      return;
    }
    const perspective = window.APP.editor.perspective;
    const periods = S.bell.periods;
    const rows = rowsFor(S, perspective);
    const mobileDay = window.APP.day || 0;

    // Per-render index: { rowKey -> { "d_p" -> card } }. Cheaper than scanning S.cards per cell.
    const cardLookup = buildCardLookup(S, perspective);

    rootEl.classList.add("chrx-editor");
    rootEl.innerHTML = html(S, rows, periods, mobileDay, cardLookup);

    wire(rootEl);
    syncCardInHandClass();
    if (window.ConstraintExplainer && typeof window.ConstraintExplainer.attachTooltip === "function") {
      window.ConstraintExplainer.attachTooltip(rootEl);
    }
  }

  function buildCardLookup(S, perspective) {
    const lookup = Object.create(null);
    for (const c of (S.cards || [])) {
      const lesson = S._idx.lessonById[c.lessonId];
      if (!lesson) continue;
      const key = c.day + "_" + c.period;
      const keysForCard = rowKeysForCard(lesson, perspective, c);
      for (const rowKey of keysForCard) {
        if (!lookup[rowKey]) lookup[rowKey] = Object.create(null);
        // Multiple cards may collide on same slot post-edit; we just show first.
        if (!lookup[rowKey][key]) lookup[rowKey][key] = c;
      }
    }
    return lookup;
  }

  function rowKeysForCard(lesson, perspective, card) {
    if (perspective === "class") return lesson.classIds;
    if (perspective === "teacher") return lesson.teacherIds;
    if (perspective === "subject") return lesson.subjectId ? [lesson.subjectId] : [];
    if (perspective === "room") {
      const rid = card.classroomId || lesson.preferredRoomId;
      return rid ? [rid] : [];
    }
    return [];
  }

  /** Switch perspective and re-render. */
  function setPerspective(p, hostEl) {
    ensureEditorState();
    window.APP.editor.perspective = p;
    render(hostEl);
  }

  function ensureEditorState() {
    const A = window.APP;
    A.editor = A.editor || {};
    if (!A.editor.perspective) A.editor.perspective = "class";
    if (A.editor.cardInHand === undefined) A.editor.cardInHand = null;
  }

  function syncCardInHandClass() {
    document.body.classList.toggle(
      "chrx-card-in-hand",
      !!window.APP.editor.cardInHand
    );
  }

  function rowsFor(S, perspective) {
    if (perspective === "teacher") {
      return S.teachers.map(t => ({
        key: t.id,
        label: t.name,
        sub: t.abbr || "",
      }));
    }
    if (perspective === "room") {
      return S.classrooms.map(r => ({ key: r.id, label: r.name, sub: "" }));
    }
    if (perspective === "subject") {
      return (S.subjects || []).map(s => ({
        key: s.id,
        label: s.name,
        sub: s.abbr && s.abbr !== s.name ? s.abbr : "",
      }));
    }
    // default = class
    return S.classes.map(c => ({ key: c.id, label: c.name, sub: "" }));
  }

  function html(S, rows, periods, mobileDay, cardLookup) {
    const headerHtml = headerRowHtml(periods, mobileDay);
    const dayTabsHtml = dayTabsHtml_(mobileDay);

    const bodyHtml = rows.map(row => rowHtml(S, row, periods, mobileDay, cardLookup)).join("");

    return `
      ${dayTabsHtml}
      <div class="chrx-grid-scroll">
        <div class="chrx-grid">
          ${headerHtml}
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  function dayTabsHtml_(mobileDay) {
    const tabs = DAY_LABELS_EN.map((label, d) =>
      `<button class="chrx-day-tab ${d === mobileDay ? "active" : ""}" data-day="${d}" type="button">${esc(label)}</button>`
    ).join("");
    return `<div class="chrx-day-tabs" role="tablist">${tabs}</div>`;
  }

  function headerRowHtml(periods, mobileDay) {
    const dayBlocks = [];
    for (let d = 0; d < NUM_DAYS; d++) {
      const cells = periods.map(p =>
        `<div class="chrx-h chrx-h-period ${d !== mobileDay ? "mobile-hidden" : ""}" data-day="${d}">P${p.index}</div>`
      ).join("");
      dayBlocks.push(`
        <div class="chrx-h-day ${d !== mobileDay ? "mobile-hidden" : ""}" data-day="${d}">${esc(DAY_LABELS_EN[d])}</div>
        ${cells}
      `);
    }
    return `
      <div class="chrx-row chrx-row-head">
        <div class="chrx-rowlabel chrx-h">Row</div>
        ${dayBlocks.join("")}
      </div>
    `;
  }

  function rowHtml(S, row, periods, mobileDay, cardLookup) {
    const rowBucket = cardLookup[row.key] || null;
    const slots = [];
    for (let d = 0; d < NUM_DAYS; d++) {
      for (const p of periods) {
        const card = rowBucket ? rowBucket[d + "_" + p.index] : null;
        const hide = d !== mobileDay ? " mobile-hidden" : "";
        if (card) {
          slots.push(cardHtml(S, card, d, p.index, row.key, hide));
        } else {
          slots.push(
            `<div class="chrx-slot empty${hide}" data-day="${d}" data-period="${p.index}" data-row="${esc(row.key)}"></div>`
          );
        }
      }
    }
    return `
      <div class="chrx-row" data-row="${esc(row.key)}">
        <div class="chrx-rowlabel" title="${esc(row.label)}">
          <span class="chrx-rowlabel-main">${esc(row.label)}</span>
          ${row.sub ? `<span class="chrx-rowlabel-sub">${esc(row.sub)}</span>` : ""}
        </div>
        ${slots.join("")}
      </div>
    `;
  }

  function cardHtml(S, card, day, period, rowKey, mobileHidden) {
    const lesson = S._idx.lessonById[card.lessonId];
    const subject = lesson ? S._idx.subjectById[lesson.subjectId] : null;
    const subjShort = subject ? (subject.abbr || subject.name) : "?";
    const teacherShort = (lesson?.teacherIds || [])
      .map(tid => S._idx.teacherById[tid])
      .filter(Boolean)
      .map(t => t.abbr || t.name)
      .join(", ");
    const roomShort = (() => {
      const rid = card.classroomId || lesson?.preferredRoomId;
      const r = rid ? S._idx.classroomById[rid] : null;
      return r ? r.name : "";
    })();
    const classShort = (() => {
      if (window.APP.editor.perspective === "class") return ""; // already row
      return (lesson?.classIds || [])
        .map(cid => S._idx.classById[cid])
        .filter(Boolean)
        .map(c => c.name)
        .join(", ");
    })();

    const hue = cardHue(S, card, lesson, subject);
    const cardId = `placed_${card.lessonId}_${day}_${period}`;
    const locked = (lesson?.fixedDay != null || lesson?.fixedPeriod != null) ? " locked" : "";
    // line 2 differs by perspective: class → teacher, teacher → class, room → class
    const line2 = window.APP.editor.perspective === "teacher" ? classShort : teacherShort;
    const line3 = window.APP.editor.perspective === "class" ? roomShort
                : window.APP.editor.perspective === "teacher" ? roomShort
                : teacherShort;
    const compact = window.APP.editor.density === "compact";
    const densityClass = compact ? " chrx-vkarta--compact" : "";

    return `
      <div class="chrx-slot${mobileHidden}" data-day="${day}" data-period="${period}" data-row="${esc(rowKey)}">
        <div class="chrx-vkarta${locked}${densityClass}"
             data-card-id="${cardId}"
             data-lesson-id="${esc(card.lessonId)}"
             data-day="${day}"
             data-period="${period}"
             style="--chrx-card-hue:${hue}"
             title="${esc(subjShort + (teacherShort ? ' · ' + teacherShort : '') + (roomShort ? ' · ' + roomShort : ''))}">
          <div class="chrx-vk-line1">${esc(subjShort)}</div>
          ${compact ? "" : `<div class="chrx-vk-line2">${esc(line2)}</div>`}
          ${compact ? "" : `<div class="chrx-vk-line3">${esc(line3)}</div>`}
        </div>
      </div>
    `;
  }

  function wire(rootEl) {
    // mousedown delegation
    rootEl.addEventListener("mousedown", onMouseDown);
    // Day tabs (mobile)
    rootEl.querySelectorAll(".chrx-day-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        window.APP.day = parseInt(btn.dataset.day, 10) || 0;
        render(rootEl);
      });
    });
  }

  function onMouseDown(ev) {
    // Card pickup
    const vk = ev.target.closest(".chrx-vkarta");
    if (vk) {
      ev.preventDefault();
      if (vk.classList.contains("locked")) return;
      const cardId = vk.dataset.cardId;
      const lessonId = vk.dataset.lessonId;
      const day = parseInt(vk.dataset.day, 10);
      const period = parseInt(vk.dataset.period, 10);
      // Remove from data + DOM
      removeCardFromSchool(lessonId, day, period);
      const slot = vk.closest(".chrx-slot");
      if (slot) {
        slot.classList.add("empty");
        slot.removeAttribute("title");
        slot.innerHTML = "";
        slot.dataset.day = String(day);
        slot.dataset.period = String(period);
      }
      window.APP.editor.cardInHand = { cardId, lessonId, originDay: day, originPeriod: period };
      syncCardInHandClass();
      dispatch("editor:pickup", { cardId, lessonId, day, period });
      return;
    }
    // Empty-slot place (only when we have something in hand)
    const slot = ev.target.closest(".chrx-slot.empty");
    if (slot && window.APP.editor.cardInHand) {
      ev.preventDefault();
      const day = parseInt(slot.dataset.day, 10);
      const period = parseInt(slot.dataset.period, 10);
      const rowKey = slot.dataset.row;
      const inHand = window.APP.editor.cardInHand;
      // Mutate school cards + re-render the row to keep visual state honest
      placeCardOnSchool(inHand.lessonId, day, period);
      window.APP.editor.cardInHand = null;
      syncCardInHandClass();
      dispatch("editor:place", { cardId: inHand.cardId, lessonId: inHand.lessonId, day, period, rowKey });
      // Cheapest correct re-render: redraw whole grid. (Rows are few; perf ok.)
      const host = slot.closest(".chrx-editor");
      if (host) render(host);
    }
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // S.cards is the single source of truth.
  function removeCardFromSchool(lessonId, day, period) {
    const S = window.APP.school;
    if (!S) return;
    const i = S.cards.findIndex(c => c.lessonId === lessonId && c.day === day && c.period === period);
    if (i !== -1) S.cards.splice(i, 1);
  }

  function placeCardOnSchool(lessonId, day, period) {
    const S = window.APP.school;
    if (!S) return;
    const lesson = S._idx.lessonById[lessonId];
    const classroomId = lesson ? lesson.preferredRoomId : undefined;
    // Avoid a duplicate placement on the same {lessonId, day, period}
    if (S.cards.some(c => c.lessonId === lessonId && c.day === day && c.period === period)) return;
    S.cards.push({ lessonId, day, period, classroomId });
  }

  // Subject hue: known short codes match design tokens, else hash.
  const SHORT_HUES = {
    MA: 220, MAT: 220, MATH: 220, MATHS: 220,
    EN: 12,  ENG: 12,  ENGL: 12,
    HI: 32,  HIN: 32,  HINDI: 32,
    SC: 150, SCI: 150, SCIE: 150,
    SS: 50,  SST: 50,  SOC: 50,
    MU: 285, MUS: 285,
    AR: 330, ART: 330,
    PE: 110, PT: 110, PED: 110, SP: 110,
    IT: 250, CS: 250, COMP: 250,
    LIB: 200,
  };
  function subjectHue(subject) {
    if (!subject) return 210;
    const key = (subject.abbr || subject.name || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (SHORT_HUES[key] != null) return SHORT_HUES[key];
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff;
    return h % 360;
  }

  // Pick the colour of a placed card based on APP.editor.colorBy:
  //   "subject" (default) — use the legacy subject-hue palette
  //   "teacher" — use the first teacher's stored colour, hash-fallback
  //   "class"   — use the first class's stored colour, hash-fallback
  //   "room"    — use the resolved classroom's stored colour, hash-fallback
  // Entity dialogs already write a HEX `color` field on each entity; we
  // parse it to HSL hue when present so it composes with the existing
  // --chrx-card-hue CSS variable used by chrx-vkarta.
  function hashHue(key) {
    if (!key) return 210;
    let h = 0;
    const u = String(key).toUpperCase();
    for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) & 0xffff;
    return h % 360;
  }
  function hexHue(hex) {
    if (typeof hex !== "string") return null;
    const m = hex.replace("#", "");
    if (m.length !== 6) return null;
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    if ([r, g, b].some(v => Number.isNaN(v))) return null;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 210;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return Math.round(h);
  }
  function cardHue(S, card, lesson, subject) {
    const axis = (window.APP && window.APP.editor && window.APP.editor.colorBy) || "subject";
    if (axis === "subject") return subjectHue(subject);
    if (axis === "teacher") {
      const tid = (lesson && lesson.teacherIds && lesson.teacherIds[0]);
      const t = tid ? S._idx.teacherById[tid] : null;
      return (t && hexHue(t.color)) ?? hashHue(t && (t.abbr || t.name));
    }
    if (axis === "class") {
      const cid = (lesson && lesson.classIds && lesson.classIds[0]);
      const c = cid ? S._idx.classById[cid] : null;
      return (c && hexHue(c.color)) ?? hashHue(c && (c.short || c.name));
    }
    if (axis === "room") {
      const rid = (card && card.classroomId) || (lesson && lesson.preferredRoomId);
      const r = rid ? S._idx.classroomById[rid] : null;
      return (r && hexHue(r.color)) ?? hashHue(r && (r.short || r.name));
    }
    return subjectHue(subject);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  return { render, setPerspective };
})();
