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
  let rafId = 0, lastValidate = 0, lastSlot = null;
  const VALIDATE_MS = 16;

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
    inHand = { cardId: d.cardId, lessonId: d.lessonId,
               originDay: d.day, originPeriod: d.period,
               originClassroomId: d.originClassroomId,
               fromPending: !!d.fromPending };
    const subj = S._idx.subjectById[lesson.subjectId];
    const subjShort = subj ? (subj.abbr || subj.name) : "?";
    const teacherShort = (lesson.teacherIds || []).map(t => S._idx.teacherById[t])
      .filter(Boolean).map(t => t.abbr || t.name).join(", ");
    const classShort = (lesson.classIds || []).map(c => S._idx.classById[c])
      .filter(Boolean).map(c => c.name).join(", ");
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
    px = (typeof d.sourceX === "number") ? d.sourceX : (window.event ? window.event.clientX : 0);
    py = (typeof d.sourceY === "number") ? d.sourceY : (window.event ? window.event.clientY : 0);
    apply();
    paintAllSlots();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("keydown", onKey, true);
  }

  // Heatmap-on-pickup (audit §5.3). For every slot in the grid, run
  // Placement.classify and set data-validity so green/amber/red slots show
  // at a glance — the user no longer has to drag-hover each slot to learn
  // where their card would land cleanly. Occupied slots are marked red and
  // open the collision menu. Out-of-bell slots already render
  // hatched and are skipped here.
  function paintAllSlots() {
    if (!inHand || !window.Placement || typeof window.Placement.classify !== "function") return;
    const slots = document.querySelectorAll(".chrx-editor .chrx-slot:not(.out-of-bell)");
    for (const slot of slots) {
      const d = parseInt(slot.dataset.day, 10);
      const p = parseInt(slot.dataset.period, 10);
      if (Number.isNaN(d) || Number.isNaN(p)) continue;
      try {
        const v = classifySlot(slot);
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

  function onMove(e) {
    if (!ghost) return;
    px = e.clientX; py = e.clientY;
    if (dragTooltipEl && dragTooltipEl.style.display !== "none") {
      positionDragTooltip(e.clientX, e.clientY);
    }
    if (!rafId) rafId = requestAnimationFrame(flush);
  }
  
  function flush() {
    rafId = 0;
    if (!ghost) return;
    apply();
    const now = performance.now();
    if (now - lastValidate >= VALIDATE_MS) { lastValidate = now; paint(px, py); }
  }
  
  function apply() { ghost.style.transform = `translate(${px - dx}px, ${py - dy}px)`; }

  function slotAt(x, y) {
    ghost.style.visibility = "hidden";
    const el = document.elementFromPoint(x, y);
    ghost.style.visibility = "";
    const slot = el && el.closest ? el.closest(".chrx-slot") : null;
    return slot && !slot.classList.contains("out-of-bell") ? slot : null;
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

  function onUp(e) {
    if (!ghost) return;
    if (e.target && e.target.closest && e.target.closest(".chrx-collision-menu")) return;
    const slot = slotAt(e.clientX, e.clientY);
    if (!slot) return cancel();
    const d = parseInt(slot.dataset.day, 10), p = parseInt(slot.dataset.period, 10);
    const v = classifySlot(slot);
    if (v.validity === "red" || targetCardsForSlot(slot).length) return showCollisionMenu(slot, v, e.clientX, e.clientY);
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
    const targetRemoved = replace ? targetCardsForSlot(slot).map(c => ({
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
          rerender();
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
      rerender();
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
    const occupants = targetCardsForSlot(slot);
    const reasons = validity && validity.reasons && validity.reasons.length
      ? validity.reasons
      : ["Placement conflicts with the current timetable"];
    const occupantNames = occupants.map(c => cardLabel(c)).filter(Boolean);
    collisionMenu = document.createElement("div");
    collisionMenu.className = "chrx-collision-menu";
    collisionMenu.innerHTML = `
      <div class="chrx-collision-menu__title">Collision at ${esc(dayLabel(d))} P${esc(p)}</div>
      <ul class="chrx-collision-menu__reasons">
        ${occupantNames.length ? `<li>slot already has ${esc(occupantNames.join(", "))}</li>` : ""}
        ${reasons.slice(0, 5).map(r => `<li>${esc(r)}</li>`).join("")}
      </ul>
      <div class="chrx-collision-menu__actions">
        <button type="button" data-act="return">Return</button>
        <button type="button" data-act="find">Find clean slot</button>
        ${occupants.length ? `<button type="button" data-act="replace">Replace slot</button>` : ""}
        <button type="button" data-act="force">${occupants.length ? "Add alongside" : "Place anyway"}</button>
      </div>
    `;
    collisionMenu.addEventListener("mousedown", e => e.stopPropagation(), true);
    collisionMenu.addEventListener("mouseup", e => e.stopPropagation(), true);
    collisionMenu.addEventListener("click", e => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === "return") return cancel();
      if (act === "force") return commit(d, p, slot, { force: true });
      if (act === "replace") return commit(d, p, slot, { replace: true, force: true });
      if (act === "find") return focusFirstCleanSlot();
    });
    document.body.appendChild(collisionMenu);
    const r = slot.getBoundingClientRect();
    const left = Number.isFinite(x) ? x : r.left + r.width;
    const top = Number.isFinite(y) ? y : r.top;
    placeCollisionMenu(left, top);
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
    if (!ghost) return;
    if (!inHand.fromPending && Number.isFinite(inHand.originDay) && Number.isFinite(inHand.originPeriod)) {
      const S = window.APP && window.APP.school;
      if (S) {
        const lesson = S._idx.lessonById[inHand.lessonId];
        const cid = inHand.originClassroomId || (lesson ? lesson.preferredRoomId : undefined);
        if (!S.cards.some(c => c.lessonId === inHand.lessonId && c.day === inHand.originDay && c.period === inHand.originPeriod))
          S.cards.push({ lessonId: inHand.lessonId, day: inHand.originDay, period: inHand.originPeriod, classroomId: cid });
      }
    }
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
    function finalise() {
      if (window.APP.editor) window.APP.editor.cardInHand = null;
      cleanup(); rerender();
    }
  }

  function rerender() {
    const host = document.querySelector(".chrx-editor");
    if (host && window.Editor && window.Editor.render) window.Editor.render(host);
    const pend = document.querySelector(".chrx-pending-strip");
    if (pend && window.PendingStrip && window.PendingStrip.render) window.PendingStrip.render(pend);
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("mouseup", onUp, true);
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
    // Clear the at-pickup heatmap painted by paintAllSlots().
    document.querySelectorAll(".chrx-editor .chrx-slot[data-validity]").forEach(
      s => s.removeAttribute("data-validity"));
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    const banner = document.getElementById("chrx-carry-banner");
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    ghost = null; inHand = null;
    document.body.classList.remove("chrx-card-in-hand");
  }

  document.addEventListener("editor:pickup", e => { if (ghost) cleanup(); pickup(e.detail || {}); });
  window.CardInHand = { _cleanup: cleanup };

  function rowPlacementCheck(lessonId, slot) {
    const S = window.APP && window.APP.school;
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    const rowKey = slot && (slot.dataset.row || slot.closest(".chrx-row")?.dataset.row);
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

  function classifySlot(slot) {
    const d = parseInt(slot.dataset.day, 10);
    const p = parseInt(slot.dataset.period, 10);
    const rowCheck = rowPlacementCheck(inHand.lessonId, slot);
    const base = rowCheck.ok
      ? (window.Placement ? window.Placement.classify(inHand.lessonId, d, p, classroomForSlot(inHand.lessonId, slot)) : { validity: "green", reasons: [] })
      : { validity: "red", reasons: [rowCheck.reason] };
    const occupants = targetCardsForSlot(slot);
    if (!occupants.length) return base;
    const reasons = (base.reasons || []).slice();
    const labels = occupants.map(c => cardLabel(c)).filter(Boolean);
    reasons.unshift(labels.length ? `slot occupied by ${labels.join(", ")}` : "slot occupied");
    return { validity: "red", reasons };
  }

  function targetCardsForSlot(slot) {
    const S = window.APP && window.APP.school;
    if (!S || !slot) return [];
    const d = parseInt(slot.dataset.day, 10);
    const p = parseInt(slot.dataset.period, 10);
    if (!Number.isFinite(d) || !Number.isFinite(p)) return [];
    const rowKey = slot.dataset.row || slot.closest(".chrx-row")?.dataset.row;
    const perspective = (window.APP && window.APP.editor && window.APP.editor.perspective) || "class";
    return (S.cards || []).filter(c => {
      if (c.day !== d || c.period !== p) return false;
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
    const rowKey = slot && (slot.dataset.row || slot.closest(".chrx-row")?.dataset.row);
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
    document.body.appendChild(carryPanel);
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
})();
