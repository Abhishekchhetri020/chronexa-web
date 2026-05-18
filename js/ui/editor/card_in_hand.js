/**
 * CardInHand — cursor-following ghost overlay.
 * Listens for `editor:pickup`; spawns a position:fixed translucent ghost
 * that follows the cursor (transform, rAF batched). On mouseup over a valid
 * slot → mutates APP.school.cards + dispatches `editor:place`. Else snaps
 * back. Esc cancels. Tab / Enter give keyboard-only placement. See DRAG_UX.md.
 */
(function () {
  "use strict";

  let ghost = null, inHand = null;
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
               originDay: d.day, originPeriod: d.period, fromPending: !!d.fromPending };
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
    const w = ghost.offsetWidth || 60, h = ghost.offsetHeight || 24;
    dx = (w / 2) | 0; dy = (h / 2) | 0;
    px = (typeof d.sourceX === "number") ? d.sourceX : (window.event ? window.event.clientX : 0);
    py = (typeof d.sourceY === "number") ? d.sourceY : (window.event ? window.event.clientY : 0);
    apply();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    document.addEventListener("keydown", onKey, true);
  }

  function onMove(e) {
    if (!ghost) return;
    px = e.clientX; py = e.clientY;
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
    return el && el.closest ? el.closest(".chrx-slot.empty") : null;
  }
  function paint(x, y) {
    const slot = slotAt(x, y);
    if (slot === lastSlot) return;
    if (lastSlot) { lastSlot.removeAttribute("data-validity"); lastSlot.removeAttribute("title"); }
    lastSlot = slot || null;
    if (!slot) return;
    const d = parseInt(slot.dataset.day, 10), p = parseInt(slot.dataset.period, 10);
    const v = window.Placement ? window.Placement.classify(inHand.lessonId, d, p) : { validity: "green", reasons: [] };
    slot.setAttribute("data-validity", v.validity);
    if (v.reasons && v.reasons.length) slot.title = v.reasons.join(" · ");
  }

  function onUp(e) {
    if (!ghost) return;
    const slot = slotAt(e.clientX, e.clientY);
    if (!slot) return cancel();
    const d = parseInt(slot.dataset.day, 10), p = parseInt(slot.dataset.period, 10);
    const v = window.Placement ? window.Placement.classify(inHand.lessonId, d, p) : { validity: "green", reasons: [] };
    if (v.validity === "red") return bumpAndCancel(slot);
    commit(d, p);
  }
  function onKey(e) {
    if (!ghost) return;
    if (e.key === "Escape") { e.preventDefault(); return cancel(); }
    if (e.key === "Tab") { e.preventDefault(); return moveFocus(e.shiftKey ? -1 : 1); }
    if (e.key === "Enter") {
      const f = document.activeElement;
      if (f && f.classList && f.classList.contains("chrx-slot") && f.classList.contains("empty")) {
        e.preventDefault();
        const d = parseInt(f.dataset.day, 10), p = parseInt(f.dataset.period, 10);
        const v = window.Placement ? window.Placement.classify(inHand.lessonId, d, p) : { validity: "green", reasons: [] };
        if (v.validity === "red") bumpAndCancel(f); else commit(d, p);
      }
    }
  }
  function moveFocus(dir) {
    const slots = Array.from(document.querySelectorAll(".chrx-editor .chrx-slot.empty"));
    if (!slots.length) return;
    slots.forEach(s => { if (!s.hasAttribute("tabindex")) s.setAttribute("tabindex", "-1"); });
    const i = slots.indexOf(document.activeElement);
    (slots[(i + dir + slots.length) % slots.length] || slots[0]).focus({ preventScroll: false });
  }

  function commit(day, period) {
    const S = window.APP && window.APP.school;
    if (S) {
      const lesson = S._idx.lessonById[inHand.lessonId];
      const cid = lesson ? lesson.preferredRoomId : undefined;
      if (!S.cards.some(c => c.lessonId === inHand.lessonId && c.day === day && c.period === period))
        S.cards.push({ lessonId: inHand.lessonId, day, period, classroomId: cid });
    }
    document.dispatchEvent(new CustomEvent("editor:place",
      { detail: { cardId: inHand.cardId, lessonId: inHand.lessonId, day, period } }));
    if (window.APP.editor) window.APP.editor.cardInHand = null;
    cleanup(); rerender();
  }

  function bumpAndCancel(slot) {
    slot.classList.add("chrx-slot-bump");
    setTimeout(() => slot.classList.remove("chrx-slot-bump"), 200);
    cancel();
  }

  function cancel() {
    if (!ghost) return;
    if (!inHand.fromPending && Number.isFinite(inHand.originDay) && Number.isFinite(inHand.originPeriod)) {
      const S = window.APP && window.APP.school;
      if (S) {
        const lesson = S._idx.lessonById[inHand.lessonId];
        const cid = lesson ? lesson.preferredRoomId : undefined;
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
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null; inHand = null;
    document.body.classList.remove("chrx-card-in-hand");
  }

  document.addEventListener("editor:pickup", e => { if (ghost) cleanup(); pickup(e.detail || {}); });
  window.CardInHand = { _cleanup: cleanup };
})();
