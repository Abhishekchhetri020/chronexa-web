/**
 * CardInHand — cursor-following ghost overlay.
 * Listens for `editor:pickup`; spawns a position:fixed translucent ghost
 * that follows the cursor (transform, rAF batched). On mouseup over a valid
 * slot → mutates APP.school.cards + dispatches `editor:place`. Else snaps
 * back. Esc cancels. Tab / Enter give keyboard-only placement. See DRAG_UX.md.
 */
(function () {
  "use strict";

  let ghost = null, inHand = null, carryPanel = null, collisionMenu = null;
  let dx = 0, dy = 0, px = 0, py = 0;
  let rx = 0, ry = 0, renderInit = false;   // eased render position (ghost inertia)
  let rafId = 0, lastValidate = 0, lastSlot = null;
  const VALIDATE_MS = 16;
  const REDUCED_MOTION = typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = REDUCED_MOTION ? 1 : 0.28;   // 1 = snap (no inertia)

  const HUE = { MA:220,MAT:220,MATH:220,MATHS:220,EN:12,ENG:12,ENGL:12,HI:32,HIN:32,HINDI:32,
    SC:150,SCI:150,SCIE:150,SS:50,SST:50,SOC:50,MU:285,MUS:285,AR:330,ART:330,
    PE:110,PT:110,PED:110,SP:110,IT:250,CS:250,COMP:250,LIB:200 };
  function subjectHue(s) {
    if (!s) return 210;
    const k = (s.abbr || s.name || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (HUE[k] != null) return HUE[k];
    let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) & 0xffff;
    return h % 360;
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  function pickup(d) {
    const S = window.APP && window.APP.school;
    if (!S) return;
    const lesson = S._idx.lessonById[d.lessonId];
    if (!lesson) return;
    
    const mode = d.mode || "drag";
    inHand = { cardId: d.cardId, lessonId: d.lessonId,
               originDay: d.day, originPeriod: d.period,
               originClassroomId: d.originClassroomId,
               fromPending: !!d.fromPending,
               rowKey: d.rowKey,
               mode: mode };
               
    window.APP.editor = window.APP.editor || {};
    window.APP.editor.cardInHand = inHand;
    
    const subj = S._idx.subjectById[lesson.subjectId];
    const subjShort = subj ? (subj.abbr || subj.name) : "?";
    const teacherShort = (lesson.teacherIds || []).map(t => S._idx.teacherById[t])
      .filter(Boolean).map(t => t.abbr || t.name).join(", ");
    const classShort = (lesson.classIds || []).map(c => S._idx.classById[c])
      .filter(Boolean).map(c => c.name).join(", ");
      
    if (mode === "drag") {
      const hue = subjectHue(subj);
      ghost = document.createElement("div");
      ghost.className = "chrx-card-ghost";
      ghost.setAttribute("aria-hidden", "true");
      ghost.innerHTML = `<div class="chrx-vkarta" style="--chrx-card-hue:${hue}">
        <div class="chrx-vk-line1">${esc(subjShort)}</div>
        <div class="chrx-vk-line2">${esc(classShort)}</div>
        <div class="chrx-vk-line3">${esc(teacherShort)}</div></div>`;
      document.body.appendChild(ghost);
      document.body.classList.add("chrx-card-in-hand");
      showCarryPanel(S, lesson, subjShort, classShort, teacherShort);

      // Sticky banner so users see they're carrying a card.
      let banner = document.getElementById("chrx-carry-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "chrx-carry-banner";
        banner.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,.92);color:#fff;padding:8px 18px;border-radius:999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;font-weight:500;box-shadow:0 8px 24px rgba(15,23,42,.35);z-index:10001;pointer-events:none;display:flex;align-items:center;gap:8px;";
        document.body.appendChild(banner);
      }
      banner.innerHTML = `<span style="font-size:16px;line-height:1">✋</span><span><strong>${esc(subjShort)}</strong>${teacherShort ? ' · ' + esc(teacherShort) : ''}${classShort ? ' · ' + esc(classShort) : ''}</span><span style="opacity:.7;font-size:11px;margin-left:6px">click empty slot to place · Esc to cancel</span>`;

      // Pulse the origin card briefly so the user sees "I picked it up".
      if (!d.fromPending && d.day != null && d.period != null) {
        const origin = document.querySelector(`.chrx-editor .chrx-slot[data-day="${d.day}"][data-period="${d.period}"]`);
        if (origin) {
          origin.classList.add("chrx-slot-pickup-pulse");
          setTimeout(() => origin.classList.remove("chrx-slot-pickup-pulse"), 600);
        }
      }

      const w = ghost.offsetWidth || 60, h = ghost.offsetHeight || 24;
      dx = (w / 2) | 0; dy = (h / 2) | 0;
      // All callers pass sourceX/sourceY; the old `window.event` fallback was
      // non-standard (undefined in modern browsers) — drop to a plain 0 origin
      // (the first mousemove corrects it). BUG_REPORT_2026-06-13 S1.1.
      px = (typeof d.sourceX === "number") ? d.sourceX : 0;
      py = (typeof d.sourceY === "number") ? d.sourceY : 0;
      rx = px; ry = py; renderInit = true;   // start the eased ghost at the pickup point
      apply();
      paintAllSlots();
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
      document.addEventListener("touchmove", onMove, { capture: true, passive: false });
      document.addEventListener("touchend", onUp, true);
      document.addEventListener("touchcancel", onUp, true);
      document.addEventListener("keydown", onKey, true);
    } else {
      // Click mode!
      // Add selection style to the card element
      let cardEl = null;
      if (d.fromPending) {
        cardEl = document.querySelector(`.chrx-pending-strip .chrx-vkarta[data-card-id="${d.cardId}"]`);
      } else {
        cardEl = document.querySelector(`.chrx-editor .chrx-vkarta[data-card-id="${d.cardId}"]`);
      }
      
      if (cardEl) {
        cardEl.classList.add("chrx-vkarta--selected");
      }
      
      // Show hand chip in click mode (Classic-style — always visible in inspector)
      showHandChip(S, lesson, subjShort, classShort, teacherShort);
      
      // Paint highlights instantly!
      paintHighlightsForClickMode();
      
      document.addEventListener("keydown", onKey, true);
    }
  }

  // Heatmap-on-pickup (audit §5.3). For every slot in the grid, run
  // Placement.classify and set data-validity so green/amber/red slots show
  // at a glance — the user no longer has to drag-hover each slot to learn
  // where their card would land cleanly. Occupied slots are marked red and
  // open the collision menu. Out-of-bell slots already render
  // hatched and are skipped here.
  function paintAllSlots() {
    if (!inHand || !window.Placement || typeof window.Placement.classify !== "function") return;
    const S = window.APP && window.APP.school;
    if (!S) return;

    // Pre-group school cards by slot to make check O(1) inside loop
    const cardsBySlot = Object.create(null);
    for (const c of (S.cards || [])) {
      const key = c.day + "_" + c.period;
      if (!cardsBySlot[key]) cardsBySlot[key] = [];
      cardsBySlot[key].push(c);
    }

    const slots = document.querySelectorAll(".chrx-editor .chrx-slot:not(.out-of-bell)");
    for (const slot of slots) {
      const d = parseInt(slot.dataset.day, 10);
      const p = parseInt(slot.dataset.period, 10);
      if (Number.isNaN(d) || Number.isNaN(p)) continue;
      try {
        const slotKey = d + "_" + p;
        const prefilteredCards = cardsBySlot[slotKey] || [];
        const v = classifySlot(slot, prefilteredCards);
        if (v && v.validity) slot.setAttribute("data-validity", v.validity);
      } catch (_e) { /* ignore */ }
    }
  }

  let dragTooltipEl = null;

  function ensureDragTooltip() {
    if (dragTooltipEl && document.body.contains(dragTooltipEl)) return;
    dragTooltipEl = document.createElement("div");
    dragTooltipEl.className = "chrx-drag-tooltip";
    dragTooltipEl.style.cssText = [
      "position:fixed",
      "z-index:10002",
      "pointer-events:none",
      "max-width:280px",
      "min-width:180px",
      "background:rgba(26, 23, 20, 0.88)",
      "backdrop-filter:blur(16px) saturate(180%)",
      "-webkit-backdrop-filter:blur(16px) saturate(180%)",
      "color:#f6f1e6",
      "border:1px solid rgba(255, 255, 255, 0.12)",
      "border-radius:10px",
      "box-shadow:0 8px 32px rgba(26, 23, 20, 0.35)",
      "font-family:Inter Tight, -apple-system, sans-serif",
      "font-size:11.5px",
      "line-height:1.4",
      "padding:10px 12px",
      "opacity:0",
      "transition:opacity var(--chrx-duration-fast, 140ms) var(--chrx-ease, cubic-bezier(.2,.7,.2,1))",
      "display:none"
    ].join(";");
    document.body.appendChild(dragTooltipEl);
  }

  function showDragTooltip(reasons, validity, x, y) {
    ensureDragTooltip();
    if (!reasons || !reasons.length) {
      hideDragTooltip();
      return;
    }
    const color = validity === "red" ? "#ff453a" : "#ff9f0a";
    const title = validity === "red" ? "Hard conflict" : "Soft warning";
    
    const bullets = reasons.map(r => `
      <li style="margin:0;padding:2px 0 2px 14px;position:relative;text-align:left;">
        <span style="position:absolute;left:0;top:6px;width:5px;height:5px;border-radius:50%;background:${color};"></span>
        ${esc(r)}
      </li>
    `).join("");

    dragTooltipEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:${color}">
        <span>⚠️ ${title}</span>
      </div>
      <ul style="list-style:none;margin:0;padding:0">${bullets}</ul>
    `;
    
    dragTooltipEl.style.display = "block";
    positionDragTooltip(x, y);
    // Force reflow for fade-in transition
    dragTooltipEl.offsetHeight;
    dragTooltipEl.style.opacity = "1";
  }

  function positionDragTooltip(x, y) {
    if (!dragTooltipEl) return;
    const margin = 14;
    const w = dragTooltipEl.offsetWidth || 240;
    const h = dragTooltipEl.offsetHeight || 80;
    let nx = x + margin;
    let ny = y + margin;
    if (nx + w + 8 > window.innerWidth) nx = Math.max(8, x - w - margin);
    if (ny + h + 8 > window.innerHeight) ny = Math.max(8, y - h - margin);
    dragTooltipEl.style.left = nx + "px";
    dragTooltipEl.style.top  = ny + "px";
  }

  function hideDragTooltip() {
    if (dragTooltipEl) {
      dragTooltipEl.style.opacity = "0";
      dragTooltipEl.style.display = "none";
    }
  }

  // Pointer coords from either a mouse or a touch event (Plan C touch support).
  function evXY(e) {
    const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  }

  function onMove(e) {
    if (!ghost) return;
    if (e.type === "touchmove" && e.cancelable) e.preventDefault();  // stop page scroll while dragging
    const xy = evXY(e);
    px = xy.x; py = xy.y;
    if (!renderInit) { rx = px; ry = py; renderInit = true; }
    if (dragTooltipEl && dragTooltipEl.style.display !== "none") {
      positionDragTooltip(px, py);
    }
    if (!rafId) rafId = requestAnimationFrame(flush);
  }

  function flush() {
    rafId = 0;
    if (!ghost) return;
    // Ease the rendered position toward the cursor so the ghost trails with a
    // little weight (inertia), and keep animating until it settles — so it
    // glides to a stop after the pointer halts rather than snapping.
    rx += (px - rx) * EASE;
    ry += (py - ry) * EASE;
    apply();
    if (Math.abs(px - rx) > 0.4 || Math.abs(py - ry) > 0.4) {
      if (!rafId) rafId = requestAnimationFrame(flush);
    }
    const now = performance.now();
    if (now - lastValidate >= VALIDATE_MS) { lastValidate = now; paint(px, py); }
  }

  function apply() {
    // Velocity-based tilt (how far the cursor is ahead of the ghost) gives the
    // card a sense of mass as it swings to follow. Capped + disabled under
    // reduced-motion.
    const tilt = REDUCED_MOTION ? 0 : Math.max(-7, Math.min(7, (px - rx) * 0.5));
    ghost.style.transform = `translate(${rx - dx}px, ${ry - dy}px) rotate(${tilt}deg)`;
  }

  function slotAt(x, y) {
    ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(x, y);
    ghost.style.visibility = "";
    const slot = el && el.closest ? el.closest(".chrx-slot") : null;
    return slot && !slot.classList.contains("out-of-bell") ? slot : null;
  }

  // The specific card directly under the cursor (group-split aware), so a
  // drop onto a shared cell swaps the half-class card being pointed at — not
  // an arbitrary occupant. Hides the drag ghost first so elementFromPoint
  // reads the card underneath it.
  function vkartaAt(x, y) {
    if (ghost) ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(x, y);
    if (ghost) ghost.style.visibility = "";
    return el && el.closest ? el.closest(".chrx-vkarta") : null;
  }
  
  function paint(x, y) {
    const slot = slotAt(x, y);
    if (slot === lastSlot) return;
    if (lastSlot) { 
      lastSlot.removeAttribute("data-validity"); 
      lastSlot.removeAttribute("title"); 
      hideDragTooltip();
    }
    lastSlot = slot || null;
    if (!slot) return;
    const v = classifySlot(slot);
    slot.setAttribute("data-validity", v.validity);
    updateCarryPanel(slot, v);
    if (v.reasons && v.reasons.length) {
      slot.title = v.reasons.join(" · ");
      showDragTooltip(v.reasons, v.validity, x, y);
    } else {
      hideDragTooltip();
    }
  }

  // Is the point over the Pending Cards area (strip, its region, or header)?
  // Ghost is position:fixed over the cursor, so hide it before hit-testing.
  function overPending(x, y) {
    if (ghost) ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(x, y);
    if (ghost) ghost.style.visibility = "";
    return !!(el && el.closest && el.closest(".chrx-pending-strip, #pending-strip-root, .chrx-pending-region"));
  }

  // Drop a placed card onto the Pending area → unplace it (remove from grid;
  // it reappears in Pending). A card already from Pending dropped back there is
  // a no-op (just put the carry down).
  function unplaceToPending() {
    const S = window.APP && window.APP.school;
    if (S && inHand && !inHand.fromPending &&
        Number.isFinite(inHand.originDay) && Number.isFinite(inHand.originPeriod)) {
      const i = S.cards.findIndex(c =>
        c.lessonId === inHand.lessonId && c.day === inHand.originDay && c.period === inHand.originPeriod);
      if (i !== -1) S.cards.splice(i, 1);
      document.dispatchEvent(new CustomEvent("editor:place",
        { detail: { cardId: inHand.cardId, lessonId: inHand.lessonId, unplaced: true } }));
    }
    if (window.APP.editor) window.APP.editor.cardInHand = null;
    cleanup();
    rerender();
  }

  function onUp(e) {
    if (!ghost) return;
    if (e.target && e.target.closest && e.target.closest(".chrx-collision-menu")) return;
    const up = evXY(e);   // touch end reports via changedTouches
    if (overPending(up.x, up.y)) return unplaceToPending();
    const slot = slotAt(up.x, up.y);
    if (!slot) return cancel();
    const d = parseInt(slot.dataset.day, 10), p = parseInt(slot.dataset.period, 10);
    // Drop onto an occupied slot → swap: the dragged card takes the slot and
    // the displaced card attaches to the cursor so you can keep dragging it.
    // swap() falls back to the collision menu if the dragged card can't fit
    // cleanly here (a real conflict the user must resolve).
    if (targetCardsForSlot(slot).length) {
      const targetVk = vkartaAt(up.x, up.y);
      return swap(d, p, slot, targetVk ? targetVk.dataset.lessonId : null, { x: up.x, y: up.y });
    }
    const v = classifySlot(slot);
    if (v.validity === "red") return showCollisionMenu(slot, v, e.clientX, e.clientY);
    commit(d, p, slot);
  }
  function onKey(e) {
    if (!ghost) return;
    if (e.key === "Escape") { e.preventDefault(); return cancel(); }
    if (e.key === "Tab") { e.preventDefault(); return moveFocus(e.shiftKey ? -1 : 1); }
    if (e.key === "Enter") {
      const f = document.activeElement;
      if (f && f.classList && f.classList.contains("chrx-slot") && !f.classList.contains("out-of-bell")) {
        e.preventDefault();
        const d = parseInt(f.dataset.day, 10), p = parseInt(f.dataset.period, 10);
        const v = classifySlot(f);
        if (v.validity === "red" || targetCardsForSlot(f).length) showCollisionMenu(f, v); else commit(d, p, f);
      }
    }
  }
  function moveFocus(dir) {
    const slots = Array.from(document.querySelectorAll(".chrx-editor .chrx-slot:not(.out-of-bell)"));
    if (!slots.length) return;
    slots.forEach(s => { if (!s.hasAttribute("tabindex")) s.setAttribute("tabindex", "-1"); });
    const i = slots.indexOf(document.activeElement);
    (slots[(i + dir + slots.length) % slots.length] || slots[0]).focus({ preventScroll: false });
  }

  function commit(day, period, slot, options) {
    closeCollisionMenu();
    const S = window.APP && window.APP.school;
    const cardId  = inHand.cardId;
    const lessonId = inHand.lessonId;
    const fromPending = !!inHand.fromPending;
    const originDay = inHand.originDay;
    const originPeriod = inHand.originPeriod;
    const originClassroomId = inHand.originClassroomId;
    const isMove = !fromPending && Number.isFinite(originDay) && Number.isFinite(originPeriod);
    const forced = !!(options && options.force);
    const replace = !!(options && options.replace);
    const isSameSlot = isMove && originDay === day && originPeriod === period;
    const lesson = S && S._idx ? S._idx.lessonById[lessonId] : null;
    const cid = slot ? classroomForSlot(lessonId, slot) : (lesson ? lesson.preferredRoomId : undefined);

    if (!forced && slot) {
      const v = classifySlot(slot);
      const colliding = getCollidingCards(lessonId, day, period, slot);
      const occupants = targetCardsForSlot(slot);
      if (v.validity === "red" || colliding.length > 0 || occupants.length > 0) {
        showCollisionMenu(slot, v);
        return;
      }
    }

    const colliding = slot ? getCollidingCards(lessonId, day, period, slot) : [];
    const occupants = slot ? targetCardsForSlot(slot) : [];
    const allColliding = [...occupants];
    for (const c of colliding) {
      if (!allColliding.some(x => x.lessonId === c.lessonId && x.day === c.day && x.period === c.period)) {
        allColliding.push(c);
      }
    }
    const targetRemoved = replace ? allColliding.map(c => ({
      lessonId: c.lessonId,
      day: c.day,
      period: c.period,
      classroomId: c.classroomId,
    })) : [];


    function applyPlacement() {
      if (!S) return;
      if (isMove) {
        const oi = S.cards.findIndex(c => c.lessonId === lessonId && c.day === originDay && c.period === originPeriod);
        if (oi !== -1) S.cards.splice(oi, 1);
      }
      if (replace && targetRemoved.length) {
        for (const removed of targetRemoved) {
          const ri = S.cards.findIndex(c =>
            c.lessonId === removed.lessonId &&
            c.day === removed.day &&
            c.period === removed.period &&
            (c.classroomId || "") === (removed.classroomId || "")
          );
          if (ri !== -1) S.cards.splice(ri, 1);
        }
      }
      if (!S.cards.some(c => c.lessonId === lessonId && c.day === day && c.period === period))
        S.cards.push({ lessonId, day, period, classroomId: cid });
    }
    function revertPlacement() {
      if (!S) return;
      const ti = S.cards.findIndex(c => c.lessonId === lessonId && c.day === day && c.period === period);
      if (ti !== -1) S.cards.splice(ti, 1);
      for (const removed of targetRemoved) {
        if (!S.cards.some(c =>
          c.lessonId === removed.lessonId &&
          c.day === removed.day &&
          c.period === removed.period &&
          (c.classroomId || "") === (removed.classroomId || "")
        )) {
          S.cards.push({
            lessonId: removed.lessonId,
            day: removed.day,
            period: removed.period,
            classroomId: removed.classroomId,
          });
        }
      }
      if (isMove && !S.cards.some(c => c.lessonId === lessonId && c.day === originDay && c.period === originPeriod))
        S.cards.push({ lessonId, day: originDay, period: originPeriod, classroomId: originClassroomId || cid });
    }

    // Push onto undo stack so AI → Cleanup last card move can revert it.
    // Skip the stack for same-slot drops (round-trip is a no-op for the user).
    const auditCommit = window.APP && window.APP.audit && typeof window.APP.audit.commit === "function";
    if (auditCommit && !isSameSlot) {
      const label = fromPending ? "Place card" : "Move card";
      window.APP.audit.commit({
        label,
        do() {
          applyPlacement();
          document.dispatchEvent(new CustomEvent("editor:place", { detail: { cardId, lessonId, day, period, forced } }));
          rerender({ lessonId, day, period });
        },
        undo() {
          revertPlacement();
          document.dispatchEvent(new CustomEvent("editor:unplace", { detail: { cardId, lessonId, day, period, originDay, originPeriod, fromPending } }));
          rerender();
        },
      });
    } else {
      applyPlacement();
      document.dispatchEvent(new CustomEvent("editor:place",
        { detail: { cardId, lessonId, day, period, forced } }));
      rerender({ lessonId, day, period });
    }
    if (window.APP.editor) window.APP.editor.cardInHand = null;
    cleanup();
  }

  function bumpAndCancel(slot) {
    slot.classList.add("chrx-slot-bump");
    setTimeout(() => slot.classList.remove("chrx-slot-bump"), 200);
    cancel();
  }

  function showCollisionMenu(slot, validity, x, y) {
    if (!slot || !inHand) return cancel();
    closeCollisionMenu();
    
    slot.classList.add("chrx-slot-bump");
    setTimeout(() => slot.classList.remove("chrx-slot-bump"), 200);
    
    const d = parseInt(slot.dataset.day, 10), p = parseInt(slot.dataset.period, 10);
    
    // Find all colliding cards
    const occupants = targetCardsForSlot(slot);
    const otherColliding = getCollidingCards(inHand.lessonId, d, p, slot);
    const allColliding = [...occupants];
    for (const c of otherColliding) {
      if (!allColliding.some(x => x.lessonId === c.lessonId && x.day === c.day && x.period === c.period)) {
        allColliding.push(c);
      }
    }

    // Format labels
    const allCollidingLabels = [];
    // 1. The card being placed (inHand)
    allCollidingLabels.push(formatCardCollisionLabel(inHand, d, p));
    // 2. The other colliding cards
    for (const c of allColliding) {
      allCollidingLabels.push(formatCardCollisionLabel(c, c.day, c.period));
    }
    
    // Create Backdrop (transparent)
    const backdrop = document.createElement("div");
    backdrop.className = "chrx-modal-backdrop";
    backdrop.id = "chrx-collision-modal-backdrop";
    backdrop.style.background = "rgba(0, 0, 0, 0)"; // completely transparent
    backdrop.style.backdropFilter = "none";
    backdrop.style.webkitBackdropFilter = "none";
    
    backdrop.innerHTML = `
      <div class="chrx-collision-popup chrx-collision-menu">
        <div class="chrx-collision-popup__title">Collisions found</div>
        <div class="chrx-collision-popup__list">
          ${allCollidingLabels.map(label => `<div class="chrx-collision-popup__item">${esc(label)}</div>`).join("")}
        </div>
        <div class="chrx-collision-popup__divider"></div>
        <div class="chrx-collision-popup__options">
          <div class="chrx-collision-popup__option chrx-collision-popup__option--replace" data-act="replace">
            <span class="chrx-collision-popup__checkmark">✓</span>
            Remove collisions and place the card
          </div>
          <div class="chrx-collision-popup__option" data-act="cancel">
            Cancel
          </div>
          <div class="chrx-collision-popup__option" data-act="force">
            Ignore conflicts and place the card
          </div>
        </div>
      </div>
    `;
    
    backdrop.addEventListener("mousedown", e => e.stopPropagation(), true);
    backdrop.addEventListener("mouseup", e => e.stopPropagation(), true);
    
    backdrop.addEventListener("click", e => {
      const option = e.target.closest(".chrx-collision-popup__option");
      if (!option) {
        if (e.target === backdrop) {
          e.preventDefault();
          cancel();
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const act = option.dataset.act;
      if (act === "cancel") return cancel();
      if (act === "force") return commit(d, p, slot, { force: true });
      if (act === "replace") return commit(d, p, slot, { replace: true, force: true });
    });
    
    document.body.appendChild(backdrop);
    collisionMenu = backdrop; // reuse collisionMenu pointer
    updateCarryPanel(slot, validity);
  }


  function placeCollisionMenu(x, y) {
    if (!collisionMenu) return;
    const margin = 12;
    const w = collisionMenu.offsetWidth || 280;
    const h = collisionMenu.offsetHeight || 160;
    let left = x + margin;
    let top = y + margin;
    if (left + w + 8 > window.innerWidth) left = Math.max(8, x - w - margin);
    if (top + h + 8 > window.innerHeight) top = Math.max(8, y - h - margin);
    collisionMenu.style.left = left + "px";
    collisionMenu.style.top = top + "px";
  }

  function closeCollisionMenu() {
    if (collisionMenu && collisionMenu.parentNode) collisionMenu.parentNode.removeChild(collisionMenu);
    collisionMenu = null;
  }

  function focusFirstCleanSlot() {
    if (!inHand || !window.Placement) return;
    const slots = Array.from(document.querySelectorAll(".chrx-editor .chrx-slot:not(.out-of-bell)"));
    const clean = slots.find(slot => {
      const d = parseInt(slot.dataset.day, 10), p = parseInt(slot.dataset.period, 10);
      if (Number.isNaN(d) || Number.isNaN(p)) return false;
      if (targetCardsForSlot(slot).length) return false;
      const v = classifySlot(slot);
      return v.validity !== "red";
    });
    if (!clean) return;
    closeCollisionMenu();
    clean.scrollIntoView({ block: "center", inline: "center" });
    clean.classList.add("chrx-slot-suggested");
    clean.setAttribute("tabindex", "-1");
    clean.focus({ preventScroll: true });
    setTimeout(() => clean.classList.remove("chrx-slot-suggested"), 1200);
  }

  function cancel() {
    if (!inHand) return;
    if (!inHand.fromPending && Number.isFinite(inHand.originDay) && Number.isFinite(inHand.originPeriod)) {
      const S = window.APP && window.APP.school;
      if (S) {
        const lesson = S._idx.lessonById[inHand.lessonId];
        const cid = inHand.originClassroomId || (lesson ? lesson.preferredRoomId : undefined);
        if (!S.cards.some(c => c.lessonId === inHand.lessonId && c.day === inHand.originDay && c.period === inHand.originPeriod))
          S.cards.push({ lessonId: inHand.lessonId, day: inHand.originDay, period: inHand.originPeriod, classroomId: cid });
      }
    }
    if (ghost) {
      const target = !inHand.fromPending ? document.querySelector(
        `.chrx-editor .chrx-slot[data-day="${inHand.originDay}"][data-period="${inHand.originPeriod}"]`) : null;
      if (target) {
        const r = target.getBoundingClientRect();
        ghost.classList.add("chrx-card-ghost-snap");
        ghost.style.transform = `translate(${r.left}px, ${r.top}px)`;
        setTimeout(finalise, 180);
      } else {
        ghost.classList.add("chrx-card-ghost-fade");
        setTimeout(finalise, 160);
      }
    } else {
      finalise();
    }
    function finalise() {
      if (window.APP.editor) window.APP.editor.cardInHand = null;
      cleanup(); rerender();
    }
  }

  function rerender(landed) {
    const host = document.querySelector(".chrx-editor");
    if (host && window.Editor && window.Editor.render) window.Editor.render(host);
    const pend = document.querySelector(".chrx-pending-strip");
    if (pend && window.PendingStrip && window.PendingStrip.render) window.PendingStrip.render(pend);
    // Plan D: snap-flash the freshly placed card so the eye lands on it.
    if (landed) {
      const card = document.querySelector(
        `.chrx-editor .chrx-vkarta[data-card-id="placed_${landed.lessonId}_${landed.day}_${landed.period}"]`);
      if (card) {
        card.classList.add("chrx-vkarta--landed");
        setTimeout(() => card.classList.remove("chrx-vkarta--landed"), 360);
      }
    }
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
    document.removeEventListener("touchmove", onMove, { capture: true });
    document.removeEventListener("touchend", onUp, true);
    document.removeEventListener("touchcancel", onUp, true);
    document.removeEventListener("keydown", onKey, true);
    if (lastSlot) { lastSlot.removeAttribute("data-validity"); lastSlot.removeAttribute("title"); }
    lastSlot = null;
    hideDragTooltip();
    closeCollisionMenu();
    if (dragTooltipEl && dragTooltipEl.parentNode) {
      dragTooltipEl.parentNode.removeChild(dragTooltipEl);
      dragTooltipEl = null;
    }
    if (carryPanel && carryPanel.parentNode) {
      carryPanel.parentNode.removeChild(carryPanel);
      carryPanel = null;
    }
    // Remove Classic-style hand chip and hover tip
    const handChip = document.getElementById("chrx-hand-chip");
    if (handChip && handChip.parentNode) handChip.parentNode.removeChild(handChip);
    const hoverTip = document.getElementById("chrx-hover-tip");
    if (hoverTip && hoverTip.parentNode) hoverTip.parentNode.removeChild(hoverTip);
    
    // Clear click mode highlights
    document.querySelectorAll(".chrx-vkarta--selected").forEach(el => el.classList.remove("chrx-vkarta--selected"));
    document.querySelectorAll(".chrx-slot--highlight-place").forEach(el => {
      el.classList.remove("chrx-slot--highlight-place");
      el.removeAttribute("data-validity-highlight");
    });
    document.querySelectorAll(".chrx-slot--highlight-swap").forEach(el => el.classList.remove("chrx-slot--highlight-swap"));
    document.querySelectorAll(".chrx-vkarta--highlight-swap-target").forEach(el => el.classList.remove("chrx-vkarta--highlight-swap-target"));
    
    // Clear the at-pickup heatmap painted by paintAllSlots().
    document.querySelectorAll(".chrx-editor .chrx-slot[data-validity]").forEach(
      s => s.removeAttribute("data-validity"));
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    renderInit = false;   // next pickup re-seeds the eased ghost position
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    const banner = document.getElementById("chrx-carry-banner");
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    ghost = null; inHand = null;
    document.body.classList.remove("chrx-card-in-hand");
  }

  document.addEventListener("editor:pickup", e => { if (ghost) cleanup(); pickup(e.detail || {}); });
  window.CardInHand = {
    _cleanup: cleanup,
    commit: commit,
    cancel: cancel,
    pickup: pickup,
    swap: swap
  };

  function rowPlacementCheck(lessonId, slot) {
    const S = window.APP && window.APP.school;
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    const rowKey = slot && slot.dataset.row;
    const lesson = S && S._idx ? S._idx.lessonById[lessonId] : null;
    if (!lesson || !rowKey) return { ok: true };
    if (perspective === "class" && !(lesson.classIds || []).includes(rowKey)) {
      const cls = S._idx.classById[rowKey];
      return { ok: false, reason: `Not a card for ${cls ? cls.name : rowKey}` };
    }
    if (perspective === "teacher" && !(lesson.teacherIds || []).includes(rowKey)) {
      const teacher = S._idx.teacherById[rowKey];
      return { ok: false, reason: `Not a card for ${teacher ? (teacher.abbr || teacher.name) : rowKey}` };
    }
    if (perspective === "subject" && lesson.subjectId !== rowKey) {
      const subject = S._idx.subjectById[rowKey];
      return { ok: false, reason: `Not a ${subject ? (subject.abbr || subject.name) : rowKey} card` };
    }
    return { ok: true };
  }

  function classifySlot(slot, prefilteredCards) {
    const d = parseInt(slot.dataset.day, 10);
    const p = parseInt(slot.dataset.period, 10);
    const occupants = targetCardsForSlot(slot, prefilteredCards);
    
    const S = window.APP && window.APP.school;
    const candidates = prefilteredCards || (S ? S.cards.filter(c => c.day === d && c.period === p) : []);
    const excludedLessonIds = new Set([inHand.lessonId, ...occupants.map(o => o.lessonId)]);
    const filteredSameSlot = candidates.filter(c => !excludedLessonIds.has(c.lessonId));
    
    const rowCheck = rowPlacementCheck(inHand.lessonId, slot);
    const base = rowCheck.ok
      ? (window.Placement ? window.Placement.classify(inHand.lessonId, d, p, classroomForSlot(inHand.lessonId, slot), filteredSameSlot) : { validity: "green", reasons: [] })
      : { validity: "red", reasons: [rowCheck.reason] };
      
    if (!occupants.length) return base;
    const reasons = (base.reasons || []).slice();
    const labels = occupants.map(c => cardLabel(c)).filter(Boolean);
    reasons.unshift(labels.length ? `slot occupied by ${labels.join(", ")}` : "slot occupied");
    return { validity: base.validity, reasons };
  }

  function getCollidingCards(lessonId, d, p, slot) {
    const S = window.APP && window.APP.school;
    if (!S) return [];
    const idx = S._idx;
    const lesson = idx.lessonById[lessonId];
    if (!lesson) return [];

    const myClasses = new Set(lesson.classIds || []);
    const myTeachers = new Set(lesson.teacherIds || []);
    const rid = classroomForSlot(lessonId, slot) || lesson.preferredRoomId;

    const colliding = [];

    // Find all cards in the system at (d, p) that conflict
    const sameSlot = (S.cards || []).filter(c => c.day === d && c.period === p);
    for (const c of sameSlot) {
      if (c.lessonId === lessonId) continue;
      const other = idx.lessonById[c.lessonId];
      if (!other) continue;

      let isConflict = false;

      // 1. Class conflict
      for (const cid of (other.classIds || [])) {
        if (myClasses.has(cid)) {
          isConflict = true;
          break;
        }
      }

      // 2. Teacher conflict
      if (!isConflict) {
        for (const tid of (other.teacherIds || [])) {
          if (myTeachers.has(tid)) {
            isConflict = true;
            break;
          }
        }
      }

      // 3. Room conflict
      if (!isConflict && rid) {
        const otherRid = c.classroomId || other.preferredRoomId;
        if (otherRid === rid) {
          isConflict = true;
        }
      }

      if (isConflict) {
        colliding.push(c);
      }
    }

    // 4. Lab double P+1 check
    if (lesson.isLabDouble) {
      const nextSlot = (S.cards || []).filter(c => c.day === d && c.period === p + 1);
      for (const c of nextSlot) {
        if (c.lessonId === lessonId) continue;
        const other = idx.lessonById[c.lessonId];
        if (!other) continue;

        let isConflict = false;

        // Class conflict at P+1
        for (const cid of (other.classIds || [])) {
          if (myClasses.has(cid)) {
            isConflict = true;
            break;
          }
        }

        // Teacher conflict at P+1
        if (!isConflict) {
          for (const tid of (other.teacherIds || [])) {
            if (myTeachers.has(tid)) {
              isConflict = true;
              break;
            }
          }
        }

        // Room conflict at P+1
        if (!isConflict && rid) {
          const otherRid = c.classroomId || other.preferredRoomId;
          if (otherRid === rid) {
            isConflict = true;
          }
        }

        if (isConflict) {
          colliding.push(c);
        }
      }
    }

    return colliding;
  }

  function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function getFullDayName(d) {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d] || ("Day " + d);
  }

  function formatCardCollisionLabel(card, day, period) {
    const S = window.APP && window.APP.school;
    const lesson = S && S._idx ? S._idx.lessonById[card.lessonId] : null;
    if (!lesson) return "";
    const subject = S._idx.subjectById[lesson.subjectId];
    const subjectName = subject ? (subject.name || subject.abbr) : card.lessonId;
    const classes = (lesson.classIds || [])
      .map(id => S._idx.classById[id])
      .filter(Boolean)
      .map(c => c.name || c.id)
      .join("/");
    const classPart = classes ? `(${classes})` : "";
    
    const dLabel = getFullDayName(day);
    const periodObj = (S.bell && S.bell.periods || []).find(p => p.index === period);
    const pLabel = periodObj ? (periodObj.label || getOrdinal(period)) : getOrdinal(period);
    
    return `${subjectName} ${classPart} - ${dLabel} ${pLabel}`;
  }


  function targetCardsForSlot(slot, prefilteredCards) {
    const S = window.APP && window.APP.school;
    if (!S || !slot) return [];
    const d = parseInt(slot.dataset.day, 10);
    const p = parseInt(slot.dataset.period, 10);
    if (!Number.isFinite(d) || !Number.isFinite(p)) return [];
    const rowKey = slot.dataset.row;
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";

    const candidates = prefilteredCards || (S.cards || []).filter(c => c.day === d && c.period === p);

    return candidates.filter(c => {
      if (!rowKey || rowKey === "head") return true;
      const lesson = S._idx.lessonById[c.lessonId];
      if (!lesson) return false;
      if (perspective === "class") return (lesson.classIds || []).includes(rowKey);
      if (perspective === "teacher") return (lesson.teacherIds || []).includes(rowKey);
      if (perspective === "subject") return lesson.subjectId === rowKey;
      if (perspective === "room") return (c.classroomId || lesson.preferredRoomId) === rowKey;
      return true;
    });
  }

  function cardLabel(card) {
    const S = window.APP && window.APP.school;
    const lesson = S && S._idx ? S._idx.lessonById[card.lessonId] : null;
    const subject = lesson ? S._idx.subjectById[lesson.subjectId] : null;
    const classes = lesson ? (lesson.classIds || [])
      .map(id => S._idx.classById[id])
      .filter(Boolean)
      .map(c => c.name || c.id)
      .join("/") : "";
    const subjectName = subject ? (subject.abbr || subject.name) : card.lessonId;
    return classes ? `${subjectName} ${classes}` : subjectName;
  }

  function classroomForSlot(lessonId, slot) {
    const S = window.APP && window.APP.school;
    const lesson = S && S._idx ? S._idx.lessonById[lessonId] : null;
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    const rowKey = slot && slot.dataset.row;
    if (perspective === "room" && rowKey) return rowKey;
    return lesson ? lesson.preferredRoomId : undefined;
  }

  function showCarryPanel(S, lesson, subjShort, classShort, teacherShort) {
    if (carryPanel && carryPanel.parentNode) carryPanel.parentNode.removeChild(carryPanel);
    const roomShort = (() => {
      const rid = lesson && lesson.preferredRoomId;
      const room = rid ? S._idx.classroomById[rid] : null;
      return room ? room.name : "No room";
    })();
    carryPanel = document.createElement("aside");
    carryPanel.className = "chrx-carry-panel";
    carryPanel.innerHTML = `
      <div class="chrx-carry-panel__eyebrow">Card in hand</div>
      <div class="chrx-carry-panel__title">${esc(subjShort)}</div>
      <dl class="chrx-carry-panel__facts">
        <div><dt>Class</dt><dd>${esc(classShort || "—")}</dd></div>
        <div><dt>Teacher</dt><dd>${esc(teacherShort || "—")}</dd></div>
        <div><dt>Room</dt><dd>${esc(roomShort)}</dd></div>
      </dl>
      <div class="chrx-carry-panel__status" data-state="idle">Choose a slot in the matching row.</div>
    `;
    const host = document.getElementById("editor-inspector-root");
    if (host) host.appendChild(carryPanel);
    else document.body.appendChild(carryPanel);
    // Also show the hand chip for consistent UX across both drag and click mode
    showHandChip(S, lesson, subjShort, classShort, teacherShort);
  }

  function showHandChip(S, lesson, subjShort, classShort, teacherShort) {
    // Remove any existing chip
    const existing = document.getElementById("chrx-hand-chip");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    const hue = subjectHue(S._idx ? S._idx.subjectById[lesson.subjectId] : null);
    const chip = document.createElement("div");
    chip.id = "chrx-hand-chip";
    chip.className = "chrx-hand-chip";
    chip.style.setProperty("--chrx-hand-hue", hue);
    chip.innerHTML = `
      <span class="chrx-hand-chip__dot"></span>
      <span class="chrx-hand-chip__label">Carrying</span>
      <span class="chrx-hand-chip__name">${esc(subjShort)}</span>
      <span class="chrx-hand-chip__meta">${[classShort, teacherShort].filter(Boolean).join(" · ")}</span>
    `;
    const host = document.getElementById("editor-inspector-root");
    if (host) host.insertBefore(chip, host.firstChild);
  }

  function updateCarryPanel(slot, validity) {
    if (!carryPanel) return;
    const status = carryPanel.querySelector(".chrx-carry-panel__status");
    if (!status) return;
    const d = slot ? parseInt(slot.dataset.day, 10) : NaN;
    const p = slot ? parseInt(slot.dataset.period, 10) : NaN;
    const label = Number.isFinite(d) && Number.isFinite(p)
      ? `${dayLabel(d)} P${p}`
      : "Choose a slot";
    status.dataset.state = validity.validity || "idle";
    status.textContent = validity.reasons && validity.reasons.length
      ? `${label}: ${validity.reasons.join(" · ")}`
      : `${label}: clean placement`;
  }

  function dayLabel(d) {
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] || "D" + d;
  }

  function paintHighlightsForClickMode() {
    if (!inHand || inHand.mode !== "click") return;
    const S = window.APP && window.APP.school;
    if (!S) return;
    
    const lesson = S._idx.lessonById[inHand.lessonId];
    if (!lesson) return;
    
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    let rowKey = inHand.rowKey;
    
    if (!rowKey) {
      if (!inHand.fromPending) {
        const cardEl = document.querySelector(`.chrx-editor .chrx-vkarta[data-card-id="${inHand.cardId}"]`);
        rowKey = cardEl?.closest(".chrx-row")?.dataset.row;
      } else {
        const keys = rowKeysForCard(lesson, perspective, inHand);
        if (keys && keys.length) rowKey = keys[0];
      }
    }
    
    if (!rowKey) return;
    
    const S2 = window.APP && window.APP.school;
    const slots = document.querySelectorAll(`.chrx-editor .chrx-row[data-row="${rowKey}"] .chrx-slot:not(.out-of-bell)`);
    for (const slot of slots) {
      const d = parseInt(slot.dataset.day, 10);
      const p = parseInt(slot.dataset.period, 10);
      if (Number.isNaN(d) || Number.isNaN(p)) continue;

      if (!inHand.fromPending && inHand.originDay === d && inHand.originPeriod === p) continue;

      const occupants = targetCardsForSlot(slot);
      if (occupants.length === 0) {
        // Empty slot — highlight only where the card can actually land. A
        // hard-conflict slot (e.g. the teacher is busy this period) is left
        // unmarked so the lit-up cells mean "you can place here".
        const v = classifySlot(slot);
        slot.setAttribute("data-validity-highlight", v.validity);
        if (v.validity !== "red") slot.classList.add("chrx-slot--highlight-place");
      } else {
        // Occupied slot — highlight as swappable only if the picked card fits
        // here once the occupant is removed (mirrors swap()'s feasibility).
        const cardB = occupants[0];
        const prefiltered = S2 ? S2.cards.filter(c =>
          c.day === d && c.period === p && c.lessonId !== cardB.lessonId) : [];
        const vA = window.Placement
          ? window.Placement.classify(inHand.lessonId, d, p, classroomForSlot(inHand.lessonId, slot), prefiltered)
          : { validity: "green" };
        slot.setAttribute("data-validity-highlight", vA.validity);
        if (vA.validity !== "red") {
          slot.classList.add("chrx-slot--highlight-swap");
          slot.querySelectorAll(".chrx-vkarta").forEach(vk => {
            vk.classList.add("chrx-vkarta--highlight-swap-target");
          });
        }
      }
    }
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

  // S.cards mutation helpers used by the swap/displacement path. (commit()
  // manipulates S.cards inline; executeDisplacement needs room-aware versions.
  // grid_canvas.js has its own same-named helpers in a separate IIFE scope —
  // these are this module's copies so executeDisplacement resolves them.)
  function removeCardFromSchool(lessonId, day, period) {
    const S = window.APP && window.APP.school;
    if (!S || !S.cards) return;
    const i = S.cards.findIndex(c => c.lessonId === lessonId && c.day === day && c.period === period);
    if (i !== -1) S.cards.splice(i, 1);
  }
  function placeCardOnSchool(lessonId, day, period, classroomId) {
    const S = window.APP && window.APP.school;
    if (!S) return;
    if (!S.cards) S.cards = [];
    if (S.cards.some(c => c.lessonId === lessonId && c.day === day && c.period === period)) return;
    const lesson = S._idx ? S._idx.lessonById[lessonId] : null;
    const cid = classroomId !== undefined ? classroomId : (lesson ? lesson.preferredRoomId : null);
    S.cards.push({ lessonId, day, period, classroomId: cid });
  }

  // Place the card in hand (cardA) onto an occupied slot, sending the card
  // there (cardB) to the cursor. `targetLessonId` selects which occupant to
  // displace on a group-split slot; `dropXY` carries the drop point so a drag
  // swap re-attaches the displaced card's ghost at the cursor.
  function swap(dayB, periodB, slotB, targetLessonId, dropXY) {
    if (!inHand || !slotB) return cancel();

    const S = window.APP && window.APP.school;
    if (!S) return cancel();

    const occupants = targetCardsForSlot(slotB);
    if (!occupants.length) {
      // No card here after all → a plain placement.
      return commit(dayB, periodB, slotB);
    }

    const cardA = inHand;
    // Displace the specific card the user dropped on; fall back to the first.
    let cardB = targetLessonId ? occupants.find(o => o.lessonId === targetLessonId) : null;
    if (!cardB) cardB = occupants[0];

    const classroomIdB = classroomForSlot(cardA.lessonId, slotB);

    // Is cardA feasible here once cardB is removed? Other occupants of a
    // group-split slot remain in `prefiltered`, so a swap that would still
    // collide with a co-tenant (or with cardA's own teacher being busy
    // elsewhere this period) classifies red and is refused.
    const prefiltered = S.cards.filter(c =>
      c.day === dayB && c.period === periodB && c.lessonId !== cardB.lessonId);
    const vA = window.Placement
      ? window.Placement.classify(cardA.lessonId, dayB, periodB, classroomIdB, prefiltered)
      : { validity: "green", reasons: [] };

    if (vA.validity === "red") {
      // Can't swap cleanly — surface the collision menu so the user can still
      // force/replace if they insist.
      return showCollisionMenu(slotB, vA);
    }

    executeDisplacement(cardA, dayB, periodB, classroomIdB, cardB, { dropXY });
  }

  function executeDisplacement(cardA, dayB, periodB, classroomIdB, cardB, options) {
    const S = window.APP && window.APP.school;
    if (!S) return;

    const lessonIdA = cardA.lessonId;
    const lessonIdB = cardB.lessonId;
    const dayA = cardA.originDay;
    const periodA = cardA.originPeriod;
    const classroomIdA = cardB.classroomId || classroomForSlot(lessonIdB, null);

    const isMoveA = !cardA.fromPending && Number.isFinite(dayA) && Number.isFinite(periodA);
    const forced = !!(options && options.force);
    // Carry the displaced card in the SAME interaction mode the user is in:
    // a drag swap re-attaches a ghost at the drop point so they keep dragging;
    // a click swap re-selects it (highlights light up) so they click to place.
    const reMode = cardA.mode || "click";
    const dropXY = options && options.dropXY;

    const slotBElement = document.querySelector(`.chrx-editor .chrx-slot[data-day="${dayB}"][data-period="${periodB}"]`);
    const rowKeyB = slotBElement?.dataset.row;

    function applyDisplacement() {
      if (isMoveA) {
        removeCardFromSchool(lessonIdA, dayA, periodA);
      }
      removeCardFromSchool(lessonIdB, dayB, periodB);
      placeCardOnSchool(lessonIdA, dayB, periodB, classroomIdB);
    }

    function revertDisplacement() {
      removeCardFromSchool(lessonIdA, dayB, periodB);
      placeCardOnSchool(lessonIdB, dayB, periodB, classroomIdA);
      if (isMoveA) {
        placeCardOnSchool(lessonIdA, dayA, periodA, cardA.originClassroomId);
      }
    }

    function pickUpDisplaced() {
      const detail = {
        cardId: `placed_${lessonIdB}_${dayB}_${periodB}`,
        lessonId: lessonIdB,
        day: dayB,
        period: periodB,
        originClassroomId: classroomIdA,
        rowKey: rowKeyB,
        mode: reMode,
      };
      if (reMode === "drag" && dropXY) { detail.sourceX = dropXY.x; detail.sourceY = dropXY.y; }
      // Tear down the picked card's in-hand visuals (old ghost / highlights /
      // listeners) before carrying the displaced one. cleanup() does not touch
      // school.cards — the swap was already committed by applyDisplacement().
      cleanup();
      pickup(detail);
    }

    const auditCommit = window.APP && window.APP.audit && typeof window.APP.audit.commit === "function";
    if (auditCommit) {
      window.APP.audit.commit({
        label: "Swap cards",
        do() {
          applyDisplacement();
          document.dispatchEvent(new CustomEvent("editor:place", { detail: { lessonId: lessonIdA, day: dayB, period: periodB, forced } }));
          rerender();
          pickUpDisplaced();
        },
        undo() {
          window.CardInHand._cleanup();
          revertDisplacement();
          document.dispatchEvent(new CustomEvent("editor:unplace", { detail: { lessonId: lessonIdA, day: dayA, period: periodA } }));
          rerender();
          if (cardA) {
            window.CardInHand.pickup(cardA);
          }
        }
      });
    } else {
      applyDisplacement();
      document.dispatchEvent(new CustomEvent("editor:place", { detail: { lessonId: lessonIdA, day: dayB, period: periodB, forced } }));
      rerender();
      pickUpDisplaced();
    }
  }

})();
