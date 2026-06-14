/**
 * Editor.render(rootEl) — writable timetable grid.
 * Rows = entities (class/teacher/room per APP.editor.perspective).
 * Cols = Monday-Saturday × the school's configured bell periods.
 * Pickup/place via mousedown (no HTML5 drag). See EDITOR.md (TBD).
 */
window.Editor = (function () {
  "use strict";

  const NUM_DAYS = 6; // hard maximum; the school's daysPerWeek drives the real count
  const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // The school decides how many weekdays to show (set in School settings at
  // setup). Clamp to the 6 we have labels for; default to a full week.
  function dayCount(S) {
    const n = S && (S.daysPerWeek | 0);
    return Math.max(1, Math.min(NUM_DAYS, n || NUM_DAYS));
  }

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
    const periods = displayPeriods(S);
    const visiblePeriodSet = new Set(periods.map(p => p.index | 0));
    const rows = rowsFor(S, perspective);
    const mobileDay = window.APP.day || 0;

    // Per-render index: { rowKey -> { "d_p" -> card } }. Cheaper than scanning S.cards per cell.
    const cardLookup = buildCardLookup(S, perspective, visiblePeriodSet);

    rootEl.classList.add("chrx-editor");
    // Compact density → shorter rows (subject-only cards), so the taller
    // readable default rows don't cost vertical density when the user wants
    // to see more classes at once.
    rootEl.classList.toggle("chrx-editor--compact", (window.APP.editor.density || "compact") === "compact");

    // Preserve scroll position across the innerHTML rebuild. Without this, a
    // pickup/place re-render reset the grid to the top — picking a card from a
    // bottom class (X) bounced the view back to class I/II (reported bug).
    const prevScroll = rootEl.querySelector(".chrx-grid-scroll");
    const savedTop = prevScroll ? prevScroll.scrollTop : 0;
    const savedLeft = prevScroll ? prevScroll.scrollLeft : 0;

    rootEl.innerHTML = html(S, rows, periods, mobileDay, cardLookup);

    const newScroll = rootEl.querySelector(".chrx-grid-scroll");
    if (newScroll) { newScroll.scrollTop = savedTop; newScroll.scrollLeft = savedLeft; }

    wire(rootEl);
    syncCardInHandClass();
    autoFitRowLabels(rootEl);
    autoFitSubjectCodes(rootEl);
    syncUnplacedCount(S);
    updateClassPanel(S);
    if (window.ConstraintExplainer && typeof window.ConstraintExplainer.attachTooltip === "function") {
      window.ConstraintExplainer.attachTooltip(rootEl);
    }
  }

  function buildCardLookup(S, perspective, visiblePeriodSet) {
    const lookup = Object.create(null);
    for (const c of (S.cards || [])) {
      const day = parseInt(c.day, 10);
      const period = parseInt(c.period, 10);
      if (!Number.isFinite(day) || day < 0 || day >= dayCount(S)) continue;
      if (!visiblePeriodSet.has(period | 0)) continue;
      const lesson = S._idx.lessonById[c.lessonId];
      if (!lesson) continue;
      const key = day + "_" + period;
      const keysForCard = rowKeysForCard(lesson, perspective, c);
      for (const rowKey of keysForCard) {
        if (!lookup[rowKey]) lookup[rowKey] = Object.create(null);
        if (!lookup[rowKey][key]) lookup[rowKey][key] = [];
        lookup[rowKey][key].push(c);
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
    if (!A.editor.colorBy) A.editor.colorBy = "subject";
    if (A.editor.cardInHand === undefined) A.editor.cardInHand = null;
  }

  function displayPeriods(S) {
    const raw = (S && S.bell && Array.isArray(S.bell.periods)) ? S.bell.periods : [];
    const byIndex = Object.create(null);
    for (const p of raw) {
      const ix = p && Number.isFinite(p.index) ? p.index : parseInt(p && p.index, 10);
      if (!Number.isFinite(ix) || ix <= 0) continue;
      byIndex[ix] = {
        ...p,
        index: ix,
        label: p.label || ("P" + ix),
        synthetic: false,
      };
    }
    const out = Object.keys(byIndex)
      .map(k => byIndex[k])
      .sort((a, b) => (a.index | 0) - (b.index | 0));
    if (out.length) return out;

    const fallbackCount = Math.max(1, Math.min(30, (S && S.periodsPerDay | 0) || 8));
    return Array.from({ length: fallbackCount }, (_, i) => ({
      index: i + 1,
      label: "P" + (i + 1),
      isTeaching: false,
      synthetic: true,
    }));
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
    const numDays = dayCount(S);
    const headerHtml = headerRowHtml(periods, mobileDay, numDays);
    const dayTabsHtml = dayTabsHtml_(mobileDay, numDays);

    const bodyHtml = rows.map(row => rowHtml(S, row, periods, mobileDay, cardLookup, numDays)).join("");

    // The in-grid tools row was removed — it duplicated the step-6 header
    // buttons (perspective/color/density, wired in main.js) and cost the
    // grid a full row of height. The live unplaced count syncs into the
    // header's #editor-unplaced-count span instead (see render()).
    return `
      ${dayTabsHtml}
      <div class="chrx-grid-scroll">
        <div class="chrx-grid" style="--chrx-periods:${periods.length || 8}">
          ${headerHtml}
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  let _prevUnplaced = null;
  function syncUnplacedCount(S) {
    const elc = document.getElementById("editor-unplaced-count");
    const n = pendingCount(S);
    if (elc) {
      elc.textContent = n === 0 ? "All placed ✓" : n + " unplaced";
      elc.style.color = n === 0 ? "var(--chrx-green, #16a34a)" : "";
    }
    // Plan D: celebrate the moment everything first lands (a real >0 → 0
    // transition, not an already-complete load).
    if (_prevUnplaced != null && _prevUnplaced > 0 && n === 0) celebrateAllPlaced();
    _prevUnplaced = n;
  }

  // One-shot confetti burst. Pure canvas, no deps; honours reduced-motion and
  // won't stack if one is already running.
  function celebrateAllPlaced() {
    if (document.getElementById("chrx-confetti")) return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = document.createElement("canvas");
    cv.id = "chrx-confetti";
    cv.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:10020";
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    const colors = ["#0d4f54", "#b08a3e", "#9c4322", "#5b6e3d", "#4c6e91", "#d9466b"];
    const parts = Array.from({ length: 150 }, () => ({
      x: cv.width / 2 + (Math.random() - 0.5) * 160,
      y: cv.height / 3,
      vx: (Math.random() - 0.5) * 11,
      vy: Math.random() * -13 - 4,
      r: 4 + Math.random() * 5,
      c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    }));
    let frames = 0;
    (function frame() {
      frames++;
      ctx.clearRect(0, 0, cv.width, cv.height);
      let alive = false;
      for (const p of parts) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y < cv.height + 24) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
      }
      if (alive && frames < 240) requestAnimationFrame(frame);
      else cv.remove();
    })();
  }

  const PERSPECTIVES = ["class", "teacher", "room", "subject"];
  const PERSPECTIVE_LABEL = { class: "By Class", teacher: "By Teacher", room: "By Room", subject: "By Subject" };
  const COLOR_AXES = ["subject", "teacher", "class", "room"];
  const COLOR_LABEL = { subject: "Color: Subject", teacher: "Color: Teacher", class: "Color: Class", room: "Color: Room" };

  function pendingCount(S) {
    const placed = Object.create(null);
    for (const c of (S.cards || [])) placed[c.lessonId] = (placed[c.lessonId] || 0) + 1;
    let total = 0;
    for (const L of (S.lessons || [])) total += Math.max(0, Math.ceil(L.periodsPerWeek || 0) - (placed[L.id] || 0));
    return total;
  }

  function dayTabsHtml_(mobileDay, numDays) {
    const tabs = DAY_LABELS_EN.slice(0, numDays || NUM_DAYS).map((label, d) =>
      `<button class="chrx-day-tab ${d === mobileDay ? "active" : ""}" data-day="${d}" type="button">${esc(label)}</button>`
    ).join("");
    return `<div class="chrx-day-tabs" role="tablist">${tabs}</div>`;
  }

  function headerRowHtml(periods, mobileDay, numDays) {
    const dayBlocks = [];
    for (let d = 0; d < numDays; d++) {
      const cells = periods.map(p =>
        `<div class="chrx-h chrx-h-period${p.synthetic ? " is-synthetic" : ""}" data-day="${d}" data-period="${p.index}">${esc(p.label || ("P" + p.index))}</div>`
      ).join("");
      dayBlocks.push(`
        <div class="chrx-day-head-group ${d !== mobileDay ? "mobile-hidden" : ""}" data-day="${d}">
          <div class="chrx-h-day" data-day="${d}">${esc(DAY_LABELS_EN[d])}</div>
          <div class="chrx-period-head-row">${cells}</div>
        </div>
      `);
    }
    return `
      <div class="chrx-row chrx-row-head" data-row="head">
        <div class="chrx-rowlabel chrx-h">Row</div>
        ${dayBlocks.join("")}
      </div>
    `;
  }

  function rowHtml(S, row, periods, mobileDay, cardLookup, numDays) {
    const rowBucket = cardLookup[row.key] || null;
    const dayBlocks = [];
    const persp = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    const selected = persp === "class" && window.APP.editor && window.APP.editor.selectedClassId === row.key;
    let bellPeriodSet = null;
    if (persp === "class" && window.BellResolver) {
      const bell = window.BellResolver.forClass(S, row.key);
      if (bell && Array.isArray(bell.periods)) {
        bellPeriodSet = new Set(bell.periods.map(p => p.index | 0));
      }
    }
    for (let d = 0; d < numDays; d++) {
      const slots = [];
      for (let pi = 0; pi < periods.length; pi++) {
        const p = periods[pi];
        const cards = rowBucket ? rowBucket[d + "_" + p.index] : null;
        const outOfBell = p.synthetic || (bellPeriodSet && !bellPeriodSet.has(p.index | 0));
        if (cards && cards.length > 0) {
          const oob = outOfBell ? " out-of-bell" : "";
          const cardListHtml = cards.map(c => vkartaHtml(S, c, d, p.index, row.key)).join("");
          // Exactly two cards share a cell (a group-split, or a conflict in
          // teacher/room view) → render as a clean DIAGONAL split (aSc-style)
          // via chrx-slot--split2. Three or more fall back to the micro-card
          // grid (chrx-slot--split).
          const splitClass = cards.length === 2 ? " chrx-slot--split2"
                           : cards.length > 2  ? " chrx-slot--split" : "";
          // Lab-double / double-period lesson → span TWO period columns as one
          // wide block (aSc-style), instead of a single card + an empty cell.
          // Only when this is a single lab-double card, there's a next period
          // in this day, and that next cell is free for this row (the lesson
          // occupies it). Skip the consumed next period so the grid stays
          // column-aligned with the period header.
          const firstLesson = cards.length === 1 ? S._idx.lessonById[cards[0].lessonId] : null;
          const nextP = periods[pi + 1];
          const nextFree = nextP && !(rowBucket && rowBucket[d + "_" + nextP.index]);
          const isLab = !!(firstLesson && firstLesson.isLabDouble && nextFree);
          const spanClass = isLab ? " chrx-slot--span2" : "";
          slots.push(
            `<div class="chrx-slot${oob}${splitClass}${spanClass}" role="gridcell" data-day="${d}" data-period="${p.index}" data-row="${esc(row.key)}">${cardListHtml}</div>`
          );
          if (isLab) pi++; // the lesson covers the next period too
        } else {
          const oob = outOfBell ? " out-of-bell" : "";
          slots.push(
            `<div class="chrx-slot empty${oob}" role="gridcell" data-day="${d}" data-period="${p.index}" data-row="${esc(row.key)}"${outOfBell ? ' aria-hidden="true"' : ` aria-label="Empty, ${esc((DAY_LABELS_EN[d]||("Day "+(d+1))))} period ${p.index}"`}></div>`
          );
        }
      }
      dayBlocks.push(`
        <div class="chrx-day-body-group ${d !== mobileDay ? "mobile-hidden" : ""}" data-day="${d}">
          ${slots.join("")}
        </div>
      `);
    }
    return `
      <div class="chrx-row${selected ? " chrx-row--selected" : ""}" data-row="${esc(row.key)}">
        <div class="chrx-rowlabel" title="${esc(row.label)}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}">
          <span class="chrx-rowlabel-main">${esc(row.label)}</span>
          ${row.sub ? `<span class="chrx-rowlabel-sub">${esc(row.sub)}</span>` : ""}
        </div>
        ${dayBlocks.join("")}
      </div>
    `;
  }

  // A compact card code for the narrow By-Class cells. Prefer the school's own
  // short abbreviation; if it's missing or just equals the full name (so it
  // would wrap/clip in a ~30px cell), derive one: keep already-short names
  // as-is (GK, E.V.S, I.T), initial-ise multi-word names (Sports Meet
  // Practice → SMP), and take a 3-letter stem of a single long word
  // (Maths → Mat). The full name stays in the hover tooltip + card detail, so
  // nothing is lost — this only governs the at-a-glance text in the cell.
  function subjectCode(subject) {
    const name = (subject.name || subject.abbr || "?").trim();
    const abbr = (subject.abbr || "").trim();
    // Respect the school's own abbreviation whenever it's a real, distinct code
    // (the user asked to "use the abbreviations that are already there"). Only
    // when there's no real abbr — it's missing or just repeats the full name —
    // do we derive a tidy one so the card doesn't show a clipped full word.
    if (abbr && abbr !== name) return abbr;
    const bare = name.replace(/[.\s]/g, "");
    if (bare.length <= 4) return name;                  // already short: GK, E.V.S, S.S.T
    const words = name.split(/\s+/).filter(w => !/^(of|the|and|&|period|pd|a)$/i.test(w));
    if (words.length >= 2) return words.map(w => w[0].toUpperCase()).join("").slice(0, 4);
    return name[0].toUpperCase() + name.slice(1, 3).toLowerCase();   // Maths → Mat
  }

  // Candidate shorter forms of a subject label, most→least informative, used
  // when even the preferred code overflows the actual cell width.
  function codeCandidates(subject) {
    const name = (subject.name || subject.abbr || "?").trim();
    const words = name.split(/\s+/).filter(Boolean);
    const out = [];
    if (words.length >= 2) out.push(words.map(w => w[0].toUpperCase()).join("").slice(0, 4)); // SMP
    const w0 = (words[0] || name).replace(/[^A-Za-z0-9]/g, "");
    for (let len = 4; len >= 2; len--) out.push(w0.slice(0, len));      // Math, Mat, Ma
    return [...new Set(out.filter(Boolean))];
  }

  // Post-render pass: the school's abbreviation is preferred, but if it still
  // overflows the actual cell at the rendered font (e.g. abbr == full name like
  // "Sports Meet Practice"), swap in the largest candidate code that fits on one
  // line. Measured with canvas (accurate, reflow-free). By-Class only — other
  // perspectives carry class lists that legitimately wrap.
  function autoFitSubjectCodes(rootEl) {
    if (!rootEl || (window.APP.editor.perspective || "class") !== "class") return;
    const S = window.APP && window.APP.school;
    if (!S) return;
    const slot = rootEl.querySelector(".chrx-slot:not(.empty)");
    const lines = rootEl.querySelectorAll(".chrx-vk-line1");
    if (!slot || !lines.length) return;
    const cs = getComputedStyle(lines[0]);
    const fam = cs.fontFamily || "sans-serif";
    const weight = cs.fontWeight || "700";
    const fontPx = parseFloat(cs.fontSize) || 11.5;
    const avail = Math.max(10, slot.clientWidth - 7);   // minus border-left + padding
    const ctx = (autoFitSubjectCodes._c || (autoFitSubjectCodes._c = document.createElement("canvas").getContext("2d")));
    const wOf = t => { ctx.font = `${weight} ${fontPx}px ${fam}`; return ctx.measureText(t).width; };
    const cache = new Map();
    for (const el of lines) {
      if (wOf(el.textContent) <= avail) continue;       // fits on one line — keep
      const card = el.closest(".chrx-vkarta");
      const lesson = card && S._idx.lessonById[card.dataset.lessonId];
      const subject = lesson && S._idx.subjectById[lesson.subjectId];
      if (!subject) continue;
      let pick = cache.get(subject.id);
      if (pick === undefined) {
        pick = codeCandidates(subject).find(c => wOf(c) <= avail) || codeCandidates(subject).pop() || el.textContent;
        cache.set(subject.id, pick);
      }
      el.textContent = pick;
    }
  }

  function vkartaHtml(S, card, day, period, rowKey) {
    const lesson = S._idx.lessonById[card.lessonId];
    const subject = lesson ? S._idx.subjectById[lesson.subjectId] : null;
    const subjShort = subject ? (subject.abbr || subject.name) : "?";
    const subjCode = subject ? subjectCode(subject) : "?";
    // Full name for the PROMINENT line — wrapped to 2 lines it reads better
    // than a cramped abbr ("Sports Meet" vs "Spo Me"), aSc-style but breaking
    // on word boundaries rather than mid-word.
    const subjFull = subject ? (subject.name || subject.abbr) : "?";
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
    // In Color:Teacher mode a lesson with N teachers (Sci Lab = 3 teachers,
    // Activity = 6+) renders as N diagonal stripes, one band per teacher's
    // colour (aSc-style). Single-teacher cards stay a flat colour.
    let stripeBg = null;
    if ((window.APP.editor.colorBy || "subject") === "teacher" &&
        lesson && (lesson.teacherIds || []).length >= 2) {
      const hues = lesson.teacherIds.map(tid => {
        const t = S._idx.teacherById[tid];
        const h = t && hexHue(t.color);
        return h == null ? hashHue(t && (t.abbr || t.name || tid)) : h;
      });
      stripeBg = teacherStripes(hues);
    }
    const cardId = `placed_${card.lessonId}_${day}_${period}`;
    const locked = (card.locked || lesson?.fixedDay != null || lesson?.fixedPeriod != null) ? " locked" : "";
    const persp = window.APP.editor.perspective;
    // Prominent (line1) text is the field that VARIES within this row — the
    // row's own dimension is already known, so repeating it big is wasted
    // space (aSc does the same). In a teacher row every card is that teacher,
    // so the class is what matters; in a class row the subject varies; etc.
    //   class   row → subject (classes are fixed) | then teacher, room
    //   teacher row → class   (teacher is fixed)  | then subject, room
    //   room    row → subject + class             | then teacher
    //   subject row → class   (subject is fixed)  | then teacher, room
    // Cell shows the prominent (varying) field + ONE secondary line — aSc-clean.
    // The room/third field lives in the hover tooltip + card-detail panel, so
    // the cell isn't a clipped 3-line cram.
    let line1, line2;
    if (persp === "teacher") { line1 = classShort || subjShort; line2 = subjShort; }
    else if (persp === "subject") { line1 = classShort || teacherShort; line2 = teacherShort; }
    else if (persp === "room") { line1 = subjFull; line2 = classShort; }
    // By-Class: a compact subject CODE alone is enough (the class is the row,
    // colour already encodes subject/teacher). aSc uses short codes here for
    // exactly this reason — at ~30px-wide cells the full name can't fit
    // readably. subjectCode() uses the school's own abbr when it fits, else
    // derives a tidy code. Full name stays in the hover tooltip + card detail.
    else { line1 = subjCode; line2 = ""; } // class
    const compact = window.APP.editor.density === "compact";
    const densityClass = compact ? " chrx-vkarta--compact" : "";

    // No native title attribute — ConstraintExplainer renders the single
    // rich hover tooltip (info header + violations). A title here made the
    // browser's native tooltip overlap the explainer with duplicate text.
    const bgStyle = stripeBg ? `;background:${stripeBg} !important;border-left-color:transparent !important` : "";
    // Screen-reader label: the full human description regardless of how the cell
    // is abbreviated visually (Plan E a11y). e.g. "Maths, X A, Ms. Yachna —
    // Monday period 3, locked".
    const dayName = DAY_LABELS_EN[day] || ("Day " + (day + 1));
    const ariaLabel = [subjFull, classShort, teacherShort, roomShort]
      .filter(Boolean).join(", ") + ` — ${dayName} period ${period}` + (locked ? ", locked" : "");
    return `
      <div class="chrx-vkarta${locked}${densityClass}"
           data-card-id="${cardId}"
           data-lesson-id="${esc(card.lessonId)}"
           data-day="${day}"
           data-period="${period}"
           data-classroom-id="${esc(card.classroomId || "")}"
           role="button" tabindex="0" aria-label="${esc(ariaLabel)}"
           aria-roledescription="timetable card"
           style="--chrx-card-hue:${hue}${bgStyle}">
        <div class="chrx-vk-line1">${esc(line1)}</div>
        ${compact || !line2 ? "" : `<div class="chrx-vk-line2">${esc(line2)}</div>`}
      </div>
    `;
  }

  function wire(rootEl) {
    // mousedown delegation is wire-once: rootEl is the same node across
    // re-renders (only innerHTML is replaced — child listeners die, but
    // listeners on rootEl itself accumulate). Before this guard, every
    // pick/place re-render attached another mousedown handler, so a
    // normal edit session leaked hundreds of listeners until the tab froze.
    if (!rootEl._chrxWired) {
      rootEl.addEventListener("mousedown", onMouseDown);
      // Day-tab click delegation off rootEl too — survives innerHTML
      // replace without needing a re-bind every render.
      rootEl.addEventListener("click", onRootClick);
      rootEl.addEventListener("mouseover", onMouseOver);
      rootEl.addEventListener("focusin", onFocusIn);
      rootEl.addEventListener("mouseout", onMouseOut);
      rootEl._chrxWired = true;
    }
  }

  function onMouseOver(ev) {
    const vk = ev.target.closest(".chrx-vkarta");
    if (vk && vk.dataset.lessonId) {
      // While a card is in hand: show hover-target info as a tip inside the
      // inspector (Classic-style: bottom-left detail panel updates on hover).
      if (document.body.classList.contains("chrx-card-in-hand")) {
        showHoverTip(vk.dataset.lessonId, {
          day: parseInt(vk.dataset.day, 10),
          period: parseInt(vk.dataset.period, 10),
          classroomId: vk.dataset.classroomId || undefined,
          source: "target",
        });
        return;
      }
      showCardPanel(vk.dataset.lessonId, {
        day: parseInt(vk.dataset.day, 10),
        period: parseInt(vk.dataset.period, 10),
        classroomId: vk.dataset.classroomId || undefined,
        source: "placed",
      });
      return;
    }
    const label = ev.target.closest(".chrx-rowlabel");
    if (!label) return;
    const row = label.closest(".chrx-row");
    if (!row) return;
    const entityId = row.dataset.row;
    if (!entityId || entityId === "head") return;
    const perspective = window.APP.editor.perspective || "class";
    if (window.FocusMode && typeof window.FocusMode.enter === "function") {
      window.FocusMode.enter(perspective, entityId, true);
    }
  }

  // Classic-style hover tip: updates a dedicated panel inside the inspector
  // when hovering over any card, showing full subject·class·teacher·room detail.
  let hoverTipTimer = null;
  function showHoverTip(lessonId, opts) {
    const S = window.APP && window.APP.school;
    const L = S && S._idx ? S._idx.lessonById[lessonId] : null;
    if (!L) return;
    const host = document.getElementById("editor-inspector-root");
    if (!host) return;
    const subject = S._idx.subjectById[L.subjectId];
    const subjectAbbr = subject ? (subject.abbr || subject.name) : "?";
    const subjectFull = subject ? subject.name : "?";
    const classNames = (L.classIds || []).map(id => S._idx.classById[id]).filter(Boolean).map(c => c.name || c.id).join(", ");
    const teacherNames = (L.teacherIds || []).map(id => S._idx.teacherById[id]).filter(Boolean).map(t => t.name || t.abbr).join(", ");
    const roomId = (opts && opts.classroomId) ? opts.classroomId : L.preferredRoomId;
    const room = roomId ? S._idx.classroomById[roomId] : null;
    const slotLabel = (opts && Number.isFinite(opts.day) && Number.isFinite(opts.period))
      ? `${DAY_LABELS_EN[opts.day] || ("D" + opts.day)} · P${opts.period}`
      : "";
    const hue = subjectHueForId(L.subjectId, subject);
    let tip = document.getElementById("chrx-hover-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "chrx-hover-tip";
      tip.className = "chrx-hover-tip";
    }
    tip.style.setProperty("--chrx-tip-hue", hue);
    tip.innerHTML = `
      <div class="chrx-hover-tip__subject">
        <span class="chrx-hover-tip__dot"></span>
        <span class="chrx-hover-tip__subj-abbr">${esc(subjectAbbr)}</span>
        ${subjectAbbr !== subjectFull ? `<span class="chrx-hover-tip__subj-full">· ${esc(subjectFull)}</span>` : ""}
      </div>
      <div class="chrx-hover-tip__rows">
        ${classNames ? `<div class="chrx-hover-tip__row"><span class="chrx-hover-tip__label">Class</span><span class="chrx-hover-tip__value">${esc(classNames)}</span></div>` : ""}
        ${teacherNames ? `<div class="chrx-hover-tip__row"><span class="chrx-hover-tip__label">Teacher</span><span class="chrx-hover-tip__value">${esc(teacherNames)}</span></div>` : ""}
        ${room ? `<div class="chrx-hover-tip__row"><span class="chrx-hover-tip__label">Room</span><span class="chrx-hover-tip__value">${esc(room.name)}</span></div>` : ""}
        ${slotLabel ? `<div class="chrx-hover-tip__row"><span class="chrx-hover-tip__label">Slot</span><span class="chrx-hover-tip__value">${esc(slotLabel)}</span></div>` : ""}
      </div>
    `;
    if (tip.parentNode !== host) host.appendChild(tip);
  }

  function hideHoverTip() {
    const tip = document.getElementById("chrx-hover-tip");
    if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
  }

  function subjectHueForId(subjectId, subject) {
    const HUE = { MA:220, MAT:220, MATH:220, MATHS:220, EN:12, ENG:12, ENGL:12, HI:32, HIN:32,
      HINDI:32, SC:150, SCI:150, SS:50, SST:50, SOC:50, MU:285, MUS:285, AR:330, ART:330,
      PE:110, PT:110, PED:110, SP:110, IT:250, CS:250, COMP:250, LIB:200,
      EVS:130, HINDI:32, DRAW:300 };
    const k = (subject ? (subject.abbr || subject.name || "") : "").toUpperCase().replace(/[^A-Z]/g, "");
    if (HUE[k] != null) return HUE[k];
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) & 0xffff;
    return h % 360;
  }

  function onFocusIn(ev) {
    const vk = ev.target.closest(".chrx-vkarta");
    if (vk && vk.dataset.lessonId) {
      showCardPanel(vk.dataset.lessonId, {
        day: parseInt(vk.dataset.day, 10),
        period: parseInt(vk.dataset.period, 10),
        classroomId: vk.dataset.classroomId || undefined,
        source: "placed",
      });
    }
  }

  function onMouseOut(ev) {
    // Hide hover tip when mouse leaves a card (in normal, non-carry mode)
    if (!document.body.classList.contains("chrx-card-in-hand")) {
      const vk = ev.target.closest(".chrx-vkarta");
      if (vk) {
        hideHoverTip();
        return;
      }
    }
    // Also hide if leaving the target while carrying
    if (document.body.classList.contains("chrx-card-in-hand")) {
      const vk = ev.target.closest(".chrx-vkarta");
      if (vk) hideHoverTip();
    }
    const label = ev.target.closest(".chrx-rowlabel");
    if (!label) return;
    if (window.FocusMode && typeof window.FocusMode.exit === "function") {
      window.FocusMode.exit();
    }
  }

  function onRootClick(ev) {
    const tool = ev.target.closest("[data-editor-tool]");
    if (tool) {
      ev.preventDefault();
      handleEditorTool(tool.dataset.editorTool, tool.closest(".chrx-editor"));
      return;
    }
    const tab = ev.target.closest(".chrx-day-tab");
    if (tab) {
      window.APP.day = parseInt(tab.dataset.day, 10) || 0;
      render(tab.closest(".chrx-editor"));
      return;
    }
    const label = ev.target.closest(".chrx-rowlabel");
    if (!label) return;
    const row = label.closest(".chrx-row");
    const rowKey = row && row.dataset.row;
    if (!rowKey || rowKey === "head") return;
    if ((window.APP.editor.perspective || "class") !== "class") return;
    window.APP.editor.selectedClassId = window.APP.editor.selectedClassId === rowKey ? null : rowKey;
    render(label.closest(".chrx-editor"));
    const pend = document.querySelector(".chrx-pending-strip");
    if (pend && window.PendingStrip && window.PendingStrip.render) window.PendingStrip.render(pend);
  }

  function handleEditorTool(kind, host) {
    window.APP.editor = window.APP.editor || {};
    // A card held in hand is bound to the current perspective's row layout.
    // Releasing it before a perspective/colour/density change avoids a lingering
    // drag ghost and a validity heatmap painted against the wrong rows after the
    // grid is rebuilt. (BUG_REPORT_2026-06-13 S0.2.)
    if ((kind === "perspective" || kind === "color" || kind === "density") &&
        window.APP.editor.cardInHand &&
        window.CardInHand && typeof window.CardInHand.cancel === "function") {
      window.CardInHand.cancel();
    }
    if (kind === "perspective") {
      const cur = window.APP.editor.perspective || "class";
      const next = PERSPECTIVES[(PERSPECTIVES.indexOf(cur) + 1) % PERSPECTIVES.length];
      window.APP.editor.perspective = next;
      syncExternalButton("editor-perspective", PERSPECTIVE_LABEL[next]);
    } else if (kind === "color") {
      const cur = window.APP.editor.colorBy || "subject";
      const next = COLOR_AXES[(COLOR_AXES.indexOf(cur) + 1) % COLOR_AXES.length];
      window.APP.editor.colorBy = next;
      try { localStorage.setItem("chronexa.editor.colorBy", next); } catch (_e) {}
      syncExternalButton("editor-color-by", COLOR_LABEL[next]);
    } else if (kind === "density") {
      const next = (window.APP.editor.density || "compact") === "compact" ? "comfortable" : "compact";
      window.APP.editor.density = next;
      try { localStorage.setItem("chronexa.editor.density", next); } catch (_e) {}
      syncExternalButton("editor-density", next === "compact" ? "Compact" : "Comfortable");
    }
    if (host) render(host);
    const pend = document.querySelector(".chrx-pending-strip");
    if (pend && window.PendingStrip && window.PendingStrip.render) window.PendingStrip.render(pend);
  }

  function syncExternalButton(id, text) {
    const btn = document.getElementById(id);
    if (btn) btn.textContent = text;
  }

  function updateClassPanel(S) {
    const existing = document.getElementById("chrx-class-panel");
    const selectedId = window.APP && window.APP.editor && window.APP.editor.selectedClassId;
    const cls = selectedId && S && S._idx ? S._idx.classById[selectedId] : null;
    if (!cls) {
      if (existing) existing.remove();
      return;
    }
    const stats = classStats(S, selectedId);
    const panel = existing || document.createElement("aside");
    panel.id = "chrx-class-panel";
    panel.className = "chrx-class-panel";
    panel.innerHTML = `
      <div class="chrx-class-panel__eyebrow">Selected class</div>
      <div class="chrx-class-panel__title">${esc(cls.name || cls.id)}</div>
      <div class="chrx-class-panel__stats">
        <div><strong>${stats.placed}</strong><span>placed</span></div>
        <div><strong>${stats.pending}</strong><span>pending</span></div>
        <div><strong>${stats.conflicts}</strong><span>conflicts</span></div>
      </div>
      <div class="chrx-class-panel__meta">${esc(stats.teachers || "No teachers assigned")}</div>
      <div class="chrx-class-panel__actions">
        <button type="button" data-act="clear">Show all</button>
        <button type="button" data-act="lesson-grid">Lesson grid</button>
      </div>
    `;
    panel.querySelector('[data-act="clear"]').onclick = () => {
      window.APP.editor.selectedClassId = null;
      const host = document.querySelector(".chrx-editor");
      if (host) render(host);
      const pend = document.querySelector(".chrx-pending-strip");
      if (pend && window.PendingStrip && window.PendingStrip.render) window.PendingStrip.render(pend);
    };
    panel.querySelector('[data-act="lesson-grid"]').onclick = () => {
      if (window.LessonsGridMatrix && window.LessonsGridMatrix.open) window.LessonsGridMatrix.open(S);
    };
    attachInspectorPanel(panel);
  }

  function showCardPanel(lessonId, opts) {
    const S = window.APP && window.APP.school;
    const L = S && S._idx ? S._idx.lessonById[lessonId] : null;
    if (!L) return;
    const subject = S._idx.subjectById[L.subjectId];
    const subjectName = subject ? (subject.name || subject.abbr) : "Unknown";
    const classNames = (L.classIds || []).map(id => S._idx.classById[id]).filter(Boolean).map(c => c.name || c.id).join(", ");
    const teacherNames = (L.teacherIds || []).map(id => S._idx.teacherById[id]).filter(Boolean).map(t => t.abbr || t.name).join(", ");
    const roomId = opts && opts.classroomId ? opts.classroomId : L.preferredRoomId;
    const room = roomId ? S._idx.classroomById[roomId] : null;
    const need = Math.ceil(L.periodsPerWeek || 0);
    const placed = (S.cards || []).filter(c => c.lessonId === L.id).length;
    const position = opts && Number.isFinite(opts.day) && Number.isFinite(opts.period)
      ? `${DAY_LABELS_EN[opts.day] || ("D" + opts.day)} P${opts.period}`
      : "Unplaced";
    const status = placementStatus(L.id, opts);
    const panel = document.getElementById("chrx-card-panel") || document.createElement("aside");
    panel.id = "chrx-card-panel";
    panel.className = "chrx-card-panel";
    panel.innerHTML = `
      <div class="chrx-card-panel__eyebrow">${opts && opts.source === "pending" ? "Pending card" : "Card detail"}</div>
      <div class="chrx-card-panel__title">${esc(subjectName)}</div>
      <div class="chrx-card-panel__chips">
        <span class="chrx-card-panel__chip" title="Class">🏫 ${esc(classNames || "—")}</span>
        <span class="chrx-card-panel__chip" title="Teacher">👤 ${esc(teacherNames || "—")}</span>
        <span class="chrx-card-panel__chip" title="Room">📍 ${esc(room ? room.name : "—")}</span>
        <span class="chrx-card-panel__chip" title="Slot">📅 ${esc(position)}</span>
      </div>
      <div class="chrx-card-panel__progress"><span style="width:${Math.min(100, need ? placed / need * 100 : 0)}%"></span></div>
      <div class="chrx-card-panel__foot">${placed}/${need || 0} placed · ${esc(status.text)}</div>
    `;
    panel.dataset.state = status.state;
    attachInspectorPanel(panel);
  }

  function attachInspectorPanel(panel) {
    const host = document.getElementById("editor-inspector-root");
    if (host && panel.parentNode !== host) host.appendChild(panel);
    else if (!host && !panel.parentNode) document.body.appendChild(panel);
  }

  function placementStatus(lessonId, opts) {
    if (!opts || !Number.isFinite(opts.day) || !Number.isFinite(opts.period) || !window.Placement) {
      return { state: "idle", text: "ready to place" };
    }
    try {
      const v = window.Placement.classify(lessonId, opts.day, opts.period, opts.classroomId);
      if (v.validity === "red") return { state: "red", text: (v.reasons || ["hard conflict"])[0] };
      if (v.validity === "amber") return { state: "amber", text: (v.reasons || ["soft warning"])[0] };
      return { state: "green", text: "clean slot" };
    } catch (_e) {
      return { state: "idle", text: "ready to place" };
    }
  }

  function classStats(S, classId) {
    let pending = 0, placed = 0, conflicts = 0;
    const teacherNames = new Set();
    for (const L of (S.lessons || [])) {
      if (!(L.classIds || []).includes(classId)) continue;
      const need = Math.ceil(L.periodsPerWeek || 0);
      const have = (S.cards || []).filter(c => c.lessonId === L.id).length;
      pending += Math.max(0, need - have);
      placed += have;
      (L.teacherIds || []).forEach(tid => {
        const t = S._idx.teacherById[tid];
        if (t) teacherNames.add(t.abbr || t.name);
      });
    }
    const bySlot = Object.create(null);
    for (const c of (S.cards || [])) {
      const L = S._idx.lessonById[c.lessonId];
      if (!L || !(L.classIds || []).includes(classId)) continue;
      const key = c.day + "_" + c.period;
      bySlot[key] = (bySlot[key] || 0) + 1;
    }
    conflicts = Object.values(bySlot).filter(n => n > 1).length;
    return {
      pending,
      placed,
      conflicts,
      teachers: Array.from(teacherNames).slice(0, 6).join(", "),
    };
  }

  function handleCardClick(vk) {
    if (vk.classList.contains("locked")) return;
    const cardId = vk.dataset.cardId;
    const lessonId = vk.dataset.lessonId;
    const day = parseInt(vk.dataset.day, 10);
    const period = parseInt(vk.dataset.period, 10);
    const originClassroomId = vk.dataset.classroomId || undefined;
    const rowKey = vk.closest(".chrx-row")?.dataset.row;
    
    const held = window.APP.editor.cardInHand;
    if (held) {
      if (held.cardId === cardId) {
        // Clicked the selected card again: Deselect
        window.CardInHand.cancel();
        return;
      }
      window.CardInHand.cancel();
    }
    
    removeCardFromSchool(lessonId, day, period);
    window.APP.editor.cardInHand = { cardId, lessonId, originDay: day, originPeriod: period, originClassroomId, rowKey, mode: "click" };
    syncCardInHandClass();
    dispatch("editor:pickup", { cardId, lessonId, day, period, originClassroomId, rowKey, mode: "click" });
    
    const host = vk.closest(".chrx-editor");
    if (host) render(host);
  }

  function startDragPickup(vk, startX, startY) {
    const cardId = vk.dataset.cardId;
    const lessonId = vk.dataset.lessonId;
    const day = parseInt(vk.dataset.day, 10);
    const period = parseInt(vk.dataset.period, 10);
    const originClassroomId = vk.dataset.classroomId || undefined;
    
    const held = window.APP.editor.cardInHand;
    if (held) {
      placeCardOnSchool(held.lessonId, held.originDay, held.originPeriod);
      window.APP.editor.cardInHand = null;
      dispatch("editor:restore", { cardId: held.cardId, lessonId: held.lessonId,
        day: held.originDay, period: held.originPeriod, reason: "second-pickup" });
    }
    
    removeCardFromSchool(lessonId, day, period);
    const slot = vk.closest(".chrx-slot");
    if (slot) {
      slot.classList.add("empty");
      slot.removeAttribute("title");
      slot.innerHTML = "";
      slot.dataset.day = String(day);
      slot.dataset.period = String(period);
    }
    window.APP.editor.cardInHand = { cardId, lessonId, originDay: day, originPeriod: period, originClassroomId, mode: "drag" };
    syncCardInHandClass();
    dispatch("editor:pickup", { cardId, lessonId, day, period, originClassroomId, sourceX: startX, sourceY: startY, mode: "drag" });
    if (held) {
      const host = vk.closest(".chrx-editor");
      if (host) render(host);
    }
  }

  function onMouseDown(ev) {
    // If click-to-swap selection is active, intercept clicks on empty or occupied slots
    if (window.APP.editor.cardInHand && window.APP.editor.cardInHand.mode === "click") {
      const slot = ev.target.closest(".chrx-slot");
      if (slot) {
        ev.preventDefault();
        const d = parseInt(slot.dataset.day, 10);
        const p = parseInt(slot.dataset.period, 10);
        
        if (slot.classList.contains("chrx-slot--highlight-place") || slot.classList.contains("chrx-slot--highlight-swap")) {
          const occupants = slot.querySelectorAll(".chrx-vkarta");
          if (occupants.length) {
            // Swap: the picked card takes this slot and the card sitting here
            // moves to the cursor. swap() refuses (and opens the collision
            // menu) if the picked card would be a hard conflict here once the
            // displaced card is removed — e.g. its teacher is busy elsewhere.
            const targetVk = ev.target.closest(".chrx-vkarta");
            window.CardInHand.swap(d, p, slot, targetVk ? targetVk.dataset.lessonId : null);
          } else {
            window.CardInHand.commit(d, p, slot);
          }
          return;
        } else {
          // If they click another card in a different row, cancel selection and select the clicked one instead!
          const targetVk = ev.target.closest(".chrx-vkarta");
          window.CardInHand.cancel();
          if (targetVk && targetVk.dataset.cardId !== window.APP.editor.cardInHand?.cardId) {
            handleCardClick(targetVk);
            return;
          }
        }
      }
    }

    // Card pickup / Click-to-select duality
    const vk = ev.target.closest(".chrx-vkarta");
    if (vk) {
      if (vk.classList.contains("locked")) return;
      ev.preventDefault();
      
      const startX = ev.clientX;
      const startY = ev.clientY;
      let dragTriggered = false;

      function onMouseMove(moveEv) {
        if (dragTriggered) return;
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          dragTriggered = true;
          cleanup();
          startDragPickup(vk, startX, startY);
        }
      }

      function onMouseUp(upEv) {
        cleanup();
        if (!dragTriggered) {
          handleCardClick(vk);
        }
      }

      function cleanup() {
        document.removeEventListener("mousemove", onMouseMove, true);
        document.removeEventListener("mouseup", onMouseUp, true);
      }

      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("mouseup", onMouseUp, true);
      return;
    }

    // Empty-slot place (only when we have something in hand)
    const slot = ev.target.closest(".chrx-slot.empty");
    if (slot && window.APP.editor.cardInHand) {
      ev.preventDefault();
      return;
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
    const classroomId = arguments.length >= 4 ? arguments[3] : (lesson ? lesson.preferredRoomId : undefined);
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
  // Diagonal N-colour stripes (one band per teacher) for a co-taught card.
  function teacherStripes(hues) {
    const n = hues.length;
    if (n < 2) return null;
    const step = 100 / n;
    const stops = hues.map((h, i) =>
      `hsl(${h} 70% 47%) ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`
    ).join(", ");
    return `linear-gradient(135deg, ${stops})`;
  }
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

  /**
   * Auto-size row-label column width + scale individual labels.
   *
   * 1. Temporarily remove width constraint so we can measure natural text width.
   * 2. Find the widest label (clamped to 32–120 px).
   * 3. Set --chrx-rowlabel-w on the grid so all rows get the same width.
   * 4. Any label still wider than the column gets scaleX() compression.
   */
  function autoFitRowLabels(rootEl) {
    const grid = rootEl.querySelector(".chrx-grid");
    if (!grid) return;
    const mains = grid.querySelectorAll(".chrx-rowlabel-main");
    if (!mains.length) return;

    // Step 1 — reset transforms and temporarily let labels be auto-width
    // so we can measure their natural text width
    for (const m of mains) m.style.transform = "none";
    grid.style.setProperty("--chrx-rowlabel-w", "auto");

    // Step 2 — find the widest label's natural text width
    let maxW = 0;
    for (const m of mains) {
      const w = m.scrollWidth;
      if (w > maxW) maxW = w;
    }

    // Step 3 — compute optimal column width (text + 6px padding), clamped
    const PAD = 8; // 3px padding each side + 2px safety
    const MIN_W = 32;
    const MAX_W = 120;
    const optimalW = Math.min(MAX_W, Math.max(MIN_W, maxW + PAD));
    grid.style.setProperty("--chrx-rowlabel-w", optimalW + "px");

    // Step 4 — scaleX any labels that are wider than the column
    const usable = optimalW - PAD;
    for (const m of mains) {
      const textW = m.scrollWidth;
      if (textW > usable) {
        const scale = usable / textW;
        m.style.transform = "scaleX(" + Math.max(0.5, scale).toFixed(3) + ")";
      }
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  window.EditorCardInspector = {
    show: showCardPanel,
    clear() {
      const p = document.getElementById("chrx-card-panel");
      if (p) p.remove();
    },
  };

  document.addEventListener("editor:focusCard", function(e) {
    const detail = e.detail;
    if (!detail || !detail.cardId) return;
    
    const cardEl = document.querySelector(`.chrx-vkarta[data-card-id="${detail.cardId}"]`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      
      const rowEl = cardEl.closest(".chrx-row");
      if (rowEl) {
        rowEl.style.backgroundColor = "var(--chrx-slate-100)";
        setTimeout(() => rowEl.style.backgroundColor = "", 2000);
      }
      
      const oldBoxShadow = cardEl.style.boxShadow;
      cardEl.style.boxShadow = "0 0 0 4px var(--chrx-red)";
      setTimeout(() => cardEl.style.boxShadow = oldBoxShadow, 2000);
      
      const lessonId = cardEl.dataset.lessonId;
      if (lessonId && typeof showCardPanel === "function") {
        showCardPanel(lessonId, { source: cardEl.closest('.chrx-pending-strip') ? "pending" : "grid" });
      }
    }
  });

  return { render, setPerspective };
})();
