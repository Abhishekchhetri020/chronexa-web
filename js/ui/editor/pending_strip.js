/** PendingStrip.render(rootEl) — sticky bottom strip of un-placed cards. */
window.PendingStrip = (function () {
  "use strict";

  const GROUPS = {
    all:       { label: "All",       keyFn: () => "all" },
    subject:   { label: "Subject",   keyFn: (S,L)=>keyOf(S._idx.subjectById[L.subjectId]) },
    class:     { label: "Class",     keyFn: (S,L)=>keyOf(S._idx.classById[L.classIds[0]]) },
    teacher:   { label: "Teacher",   keyFn: (S,L)=>keyOf(S._idx.teacherById[L.teacherIds[0]]) },
    classroom: { label: "Classroom", keyFn: (S,L)=>keyOf(S._idx.classroomById[L.preferredRoomId]) },
  };

  let _state = { groupBy: "subject", filter: "" };

  function render(rootEl) {
    if (!rootEl) return;
    const S = window.APP.school;
    rootEl.classList.add("chrx-pending-strip");
    applyTrayHeight(rootEl);
    if (!S) {
      rootEl.innerHTML = `<div class="chrx-pending-empty">No timetable loaded.</div>`;
      return;
    }
    const placedCounts = countPlaced(S);
    const groups = buildGroups(S, placedCounts);

    rootEl.innerHTML = `
      <div class="chrx-pending-resize" title="Drag to resize pending cards"></div>
      ${toolbarHtml()}
      <div class="chrx-pending-scroll">
        ${groups.map(groupHtml).join("") || `<div class="chrx-pending-empty">All cards placed.</div>`}
      </div>
    `;
    wire(rootEl);
  }

  function toolbarHtml() {
    const cls = selectedClass();
    return `
      <div class="chrx-pending-toolbar">
        <input type="search" class="chrx-pending-search"
               placeholder="Search pending cards…"
               value="${esc(_state.filter)}">
        ${cls ? `<button type="button" class="chrx-pending-class-filter" data-clear-class-filter="1" title="Show all pending cards">${esc(cls.name || cls.id)} ×</button>` : ""}
        <div class="chrx-pending-groupby" role="tablist">
          ${Object.entries(GROUPS).map(([k, v]) =>
            `<button class="chrx-pending-tab ${_state.groupBy === k ? "active" : ""}" data-group="${k}">${esc(v.label)}</button>`
          ).join("")}
        </div>
      </div>
    `;
  }

  function groupHtml(g) {
    if (!g.cards.length) return "";
    // Stack same-lesson cards into piles: e.g. 3 Maths for V B = one pile with "×3" badge.
    const stacks = stackByLesson(g.cards);
    return `
      <div class="chrx-pending-group">
        <div class="chrx-pending-grouplabel">${esc(g.label)} <span class="chrx-pending-count">${g.cards.length}</span></div>
        <div class="chrx-pending-cards">
          ${stacks.map(s => stackHtml(s)).join("")}
        </div>
      </div>
    `;
  }

  /** Group an array of cards by lessonId, preserving order of first appearance. */
  function stackByLesson(cards) {
    const byLesson = Object.create(null);
    const order = [];
    for (const c of cards) {
      if (!byLesson[c.lessonId]) {
        byLesson[c.lessonId] = [];
        order.push(c.lessonId);
      }
      byLesson[c.lessonId].push(c);
    }
    return order.map(lid => byLesson[lid]);
  }

  /** Render a stack of same-lesson cards as a single pile with a count badge. */
  function stackHtml(cards) {
    const top = cards[0];
    const count = cards.length;
    const depth = Math.min(count - 1, 3); // visual stack depth caps at 3 shadow layers
    const stackClass = count > 1 ? " chrx-vk-stack" : "";
    const badge = count > 1 ? `<span class="chrx-vk-badge">×${count}</span>` : "";
    // Store all card IDs so the click handler can pick them off one by one.
    const allIds = cards.map(c => c.cardId).join(",");
    return `
      <div class="chrx-vkarta chrx-vk-pending${stackClass}"
           data-card-id="${esc(top.cardId)}"
           data-lesson-id="${esc(top.lessonId)}"
           data-stack-ids="${esc(allIds)}"
           data-stack-depth="${depth}"
           style="--chrx-card-hue:${top.hue};--chrx-stack-depth:${depth}"
           title="${esc(top.title)}">
        <div class="chrx-vk-line1">${esc(top.subjShort)}</div>
        <div class="chrx-vk-line2">${esc(top.classShort)}</div>
        <div class="chrx-vk-line3">${esc(top.teacherShort)}</div>
        ${badge}
      </div>
    `;
  }

  function wire(rootEl) {
    // Search + tab handlers are bound to elements created by innerHTML, so
    // they die with each re-render — no leak. But the rootEl-level
    // mousedown + the document-level editor:place subscription survive
    // every render and accumulated one listener per render. Gate them
    // wire-once via `_chrxWired`.
    rootEl.querySelector(".chrx-pending-search")?.addEventListener("input", (e) => {
      _state.filter = e.target.value.toLowerCase();
      render(rootEl);
    });
    rootEl.querySelectorAll(".chrx-pending-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        _state.groupBy = btn.dataset.group || "subject";
        render(rootEl);
      });
    });
    rootEl.querySelector("[data-clear-class-filter]")?.addEventListener("click", () => {
      if (window.APP && window.APP.editor) window.APP.editor.selectedClassId = null;
      render(rootEl);
      const editor = document.querySelector(".chrx-editor");
      if (editor && window.Editor && window.Editor.render) window.Editor.render(editor);
    });
    rootEl.querySelector(".chrx-pending-resize")?.addEventListener("pointerdown", (ev) => startResize(ev, rootEl));
    if (rootEl._chrxPendingWired) return;
    rootEl.addEventListener("mouseover", (ev) => {
      const vk = ev.target.closest(".chrx-vk-pending");
      if (!vk || !window.EditorCardInspector) return;
      window.EditorCardInspector.show(vk.dataset.lessonId, { source: "pending" });
    });
    rootEl.addEventListener("focusin", (ev) => {
      const vk = ev.target.closest(".chrx-vk-pending");
      if (!vk || !window.EditorCardInspector) return;
      window.EditorCardInspector.show(vk.dataset.lessonId, { source: "pending" });
    });
    rootEl.addEventListener("mousedown", (ev) => {
      const vk = ev.target.closest(".chrx-vk-pending");
      if (!vk) return;
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
          startPendingDrag(vk, startX, startY);
        }
      }

      function onMouseUp(upEv) {
        cleanup();
        if (!dragTriggered) {
          handlePendingClick(vk);
        }
      }

      function cleanup() {
        document.removeEventListener("mousemove", onMouseMove, true);
        document.removeEventListener("mouseup", onMouseUp, true);
      }

      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("mouseup", onMouseUp, true);
    });
    // Plan C: touch support — long-press a pending card to drag it onto the
    // grid (CardInHand's touch handlers take over once picked up); a quick tap
    // selects it for click-to-place.
    rootEl.addEventListener("touchstart", (ev) => {
      const vk = ev.target.closest(".chrx-vk-pending");
      if (!vk) return;
      const t = ev.touches[0]; if (!t) return;
      const sx = t.clientX, sy = t.clientY;
      let moved = false, fired = false;
      const lp = setTimeout(() => {
        if (moved) return;
        fired = true; cleanup();
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
        startPendingDrag(vk, sx, sy);
      }, 320);
      function tmove(e) {
        const tt = e.touches[0]; if (!tt) return;
        if (Math.hypot(tt.clientX - sx, tt.clientY - sy) > 10) { moved = true; clearTimeout(lp); cleanup(); }
      }
      function tend() { clearTimeout(lp); cleanup(); if (!fired && !moved) handlePendingClick(vk); }
      function cleanup() {
        document.removeEventListener("touchmove", tmove, true);
        document.removeEventListener("touchend", tend, true);
        document.removeEventListener("touchcancel", tend, true);
      }
      document.addEventListener("touchmove", tmove, true);
      document.addEventListener("touchend", tend, true);
      document.addEventListener("touchcancel", tend, true);
    }, { passive: true });
    document.addEventListener("editor:place", () => render(rootEl));
    rootEl._chrxPendingWired = true;
  }

  function startPendingDrag(vk, clientX, clientY) {
    const cardId = vk.dataset.cardId, lessonId = vk.dataset.lessonId;
    window.APP.editor = window.APP.editor || {};
    window.APP.editor.cardInHand = { cardId, lessonId, fromPending: true, mode: "drag" };
    document.body.classList.add("chrx-card-in-hand");
    vk.classList.add("chrx-vk-taken");
    document.dispatchEvent(new CustomEvent("editor:pickup", { detail: { cardId, lessonId, fromPending: true, sourceX: clientX, sourceY: clientY, mode: "drag" } }));
  }

  function handlePendingClick(vk) {
    const cardId = vk.dataset.cardId, lessonId = vk.dataset.lessonId;
    const held = window.APP.editor.cardInHand;
    if (held) {
      window.CardInHand.cancel();
      if (held.cardId === cardId) return;
    }
    
    window.APP.editor = window.APP.editor || {};
    window.APP.editor.cardInHand = { cardId, lessonId, fromPending: true, mode: "click" };
    document.body.classList.add("chrx-card-in-hand");
    
    document.dispatchEvent(new CustomEvent("editor:pickup", { detail: { cardId, lessonId, fromPending: true, mode: "click" } }));
    
    render(vk.closest(".chrx-pending-strip"));
  }

  function countPlaced(S) {
    const out = Object.create(null);
    for (const c of (S.cards || [])) out[c.lessonId] = (out[c.lessonId] || 0) + 1;
    
    const held = window.APP && window.APP.editor && window.APP.editor.cardInHand;
    if (held && held.lessonId) {
      out[held.lessonId] = (out[held.lessonId] || 0) + 1;
    }
    return out;
  }

  function buildGroups(S, placedCounts) {
    const groupKeyFn = GROUPS[_state.groupBy].keyFn;
    const f = (_state.filter || "").trim();
    const groups = Object.create(null);
    const classFilterId = window.APP && window.APP.editor && window.APP.editor.selectedClassId;

    for (const L of (S.lessons || [])) {
      if (classFilterId && !(L.classIds || []).includes(classFilterId)) continue;
      const ppw = Math.ceil(L.periodsPerWeek || 0);
      const placed = placedCounts[L.id] || 0;
      const missing = ppw - placed;
      if (missing <= 0) continue;

      const subj = S._idx.subjectById[L.subjectId];
      const subjShort = subj ? (subj.abbr || subj.name) : "?";
      const teacherShort = (L.teacherIds || []).map(t=>S._idx.teacherById[t])
        .filter(Boolean).map(t=>t.abbr||t.name).join(", ");
      const classShort = (L.classIds || []).map(c=>S._idx.classById[c])
        .filter(Boolean).map(c=>c.name).join(", ");
      const title = `${subjShort} · ${classShort}${teacherShort ? ' · ' + teacherShort : ''} — ${missing} more`;
      const hue = pendingHue(S, L, subj);

      // Filter
      const hay = `${subjShort} ${classShort} ${teacherShort}`.toLowerCase();
      if (f && !hay.includes(f)) continue;

      const gKey = groupKeyFn(S, L) || "—";
      groups[gKey] = groups[gKey] || { label: gKey, cards: [] };

      for (let i = 0; i < missing; i++) {
        groups[gKey].cards.push({
          cardId: `pending_${L.id}_${i}`,
          lessonId: L.id,
          subjShort, teacherShort, classShort, title, hue,
        });
      }
    }
    return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  }

  function keyOf(rec) { return rec ? (rec.name || rec.abbr || "—") : "—"; }

  function selectedClass() {
    const S = window.APP && window.APP.school;
    const id = window.APP && window.APP.editor && window.APP.editor.selectedClassId;
    return S && S._idx && id ? S._idx.classById[id] : null;
  }

  function applyTrayHeight(rootEl) {
    const h = window.APP && window.APP.editor && window.APP.editor.pendingTrayHeight;
    if (Number.isFinite(h)) rootEl.style.height = Math.max(72, Math.min(420, h)) + "px";
  }

  function startResize(ev, rootEl) {
    ev.preventDefault();
    rootEl.setPointerCapture?.(ev.pointerId);
    const startY = ev.clientY;
    const startH = rootEl.getBoundingClientRect().height || 96;
    rootEl.classList.add("is-resizing");
    document.body.classList.add("chrx-body--resizing");
    function move(e) {
      const next = Math.max(72, Math.min(Math.round(window.innerHeight * 0.55), startH + (startY - e.clientY)));
      rootEl.style.height = next + "px";
      window.APP.editor = window.APP.editor || {};
      window.APP.editor.pendingTrayHeight = next;
    }
    function up(e) {
      rootEl.releasePointerCapture?.(ev.pointerId);
      rootEl.classList.remove("is-resizing");
      document.body.classList.remove("chrx-body--resizing");
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    }
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  }

  // Hue mirror — synced with grid_canvas.
  const SHORT_HUES = {
    MA:220,MAT:220,MATH:220,MATHS:220,EN:12,ENG:12,ENGL:12,HI:32,HIN:32,HINDI:32,
    SC:150,SCI:150,SCIE:150,SS:50,SST:50,SOC:50,MU:285,MUS:285,AR:330,ART:330,
    PE:110,PT:110,PED:110,SP:110,IT:250,CS:250,COMP:250,LIB:200,
  };
  function hueOf(s) {
    const k = (s || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (SHORT_HUES[k] != null) return SHORT_HUES[k];
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) & 0xffff;
    return h % 360;
  }

  function pendingHue(S, lesson, subject) {
    const axis = (window.APP && window.APP.editor && window.APP.editor.colorBy) || "subject";
    if (axis === "subject") return hueOf(subject ? (subject.abbr || subject.name) : "");
    if (axis === "teacher") {
      const tid = lesson.teacherIds && lesson.teacherIds[0];
      const t = tid ? S._idx.teacherById[tid] : null;
      return (t && hexHue(t.color)) ?? hashHue(t && (t.abbr || t.name || t.id));
    }
    if (axis === "class") {
      const cid = lesson.classIds && lesson.classIds[0];
      const c = cid ? S._idx.classById[cid] : null;
      return (c && hexHue(c.color)) ?? hashHue(c && (c.short || c.name || c.id));
    }
    if (axis === "room") {
      const r = lesson.preferredRoomId ? S._idx.classroomById[lesson.preferredRoomId] : null;
      return (r && hexHue(r.color)) ?? hashHue(r && (r.short || r.name || r.id));
    }
    return hueOf(subject ? (subject.abbr || subject.name) : "");
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
    h *= 60;
    if (h < 0) h += 360;
    return Math.round(h);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  return { render };
})();
