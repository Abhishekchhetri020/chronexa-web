/* Right-click context menu on placed cards (chrx-vkarta).
 *
 * Mirrors Classic Timetables' card right-click: Remove, Lock, Unlock,
 * Edit lesson, Find, Time off, Quick changes.
 *
 * Lock/Unlock sets or clears `card.locked` on the individual card
 * object (not the lesson), so locking one card doesn't affect other
 * cards of the same lesson on different days.
 */
(function () {
  "use strict";

  let menu = null;

  function close() {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function onOutside(e) { if (menu && !menu.contains(e.target)) close(); }
  function onKey(e)     { if (e.key === "Escape") { e.preventDefault(); close(); } }

  function notify(msg) {
    (window._chrxNotify || function (m) { console.log("[card-ctx]", m); })(msg);
  }
  function rerender() {
    const host = document.querySelector(".chrx-editor");
    if (host && window.Editor && typeof window.Editor.render === "function") {
      window.Editor.render(host);
    }
  }

  /* ─── Actions ─── */

  function removeCard(lessonId, day, period) {
    const S = window.APP && window.APP.school;
    if (!S || !S.cards) return;
    const idx = S.cards.findIndex(c =>
      c.lessonId === lessonId && c.day === day && c.period === period);
    if (idx === -1) return;
    const removed = S.cards.splice(idx, 1)[0];

    function doIt() {
      const i2 = S.cards.findIndex(c =>
        c.lessonId === lessonId && c.day === day && c.period === period);
      if (i2 !== -1) S.cards.splice(i2, 1);
      document.dispatchEvent(new CustomEvent("editor:unplace",
        { detail: { lessonId, day, period } }));
      rerender();
    }
    function undoIt() {
      S.cards.push(removed);
      document.dispatchEvent(new CustomEvent("editor:place",
        { detail: { lessonId, day, period } }));
      rerender();
    }
    // First removal already happened above, push back for undo-based commit
    S.cards.push(removed);
    if (window.APP && window.APP.audit && typeof window.APP.audit.commit === "function") {
      window.APP.audit.commit({ label: "Remove card", do: doIt, undo: undoIt });
    } else {
      doIt();
    }
  }

  function lockCard(lessonId, day, period) {
    const S = window.APP && window.APP.school;
    if (!S || !S.cards) return;
    const card = S.cards.find(c => c.lessonId === lessonId && c.day === day && c.period === period);
    if (card) card.locked = true;
    rerender();
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    notify("Locked: " + (lesson ? (lesson.subjectId || lessonId) : lessonId));
  }

  function unlockCard(lessonId, day, period) {
    const S = window.APP && window.APP.school;
    if (!S || !S.cards) return;
    const card = S.cards.find(c => c.lessonId === lessonId && c.day === day && c.period === period);
    if (card) delete card.locked;
    rerender();
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    notify("Unlocked: " + (lesson ? (lesson.subjectId || lessonId) : lessonId));
  }

  function editLesson(lessonId) {
    if (window.CardInHand && typeof window.CardInHand._cleanup === "function") {
      try { window.CardInHand._cleanup(); } catch {}
    }
    if (window.APP && window.APP.editor) window.APP.editor.cardInHand = null;
    window.dispatchEvent(new CustomEvent("app:open-entity",
      { detail: { kind: "lessons", focusLessonId: lessonId } }));
  }

  function findCard(lessonId) {
    const S = window.APP && window.APP.school;
    if (!S) return;
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    if (!lesson) return;
    // Activate FocusMode on the subject
    if (window.FocusMode && typeof window.FocusMode.activate === "function") {
      window.FocusMode.activate({ subjectId: lesson.subjectId });
    } else {
      notify("Focus mode not available.");
    }
  }

  function timeOff(lessonId) {
    const S = window.APP && window.APP.school;
    if (!S) return;
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    const teacherId = lesson && lesson.teacherIds && lesson.teacherIds[0];
    if (teacherId) {
      window.dispatchEvent(new CustomEvent("app:open-entity",
        { detail: { kind: "teachers", focusTimeoff: teacherId } }));
    } else {
      notify("No teacher assigned to this lesson.");
    }
  }

  function quickChanges(lessonId) {
    const S = window.APP && window.APP.school;
    if (!S) return;
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    if (lesson) {
      window.dispatchEvent(new CustomEvent("app:open-entity",
        { detail: { kind: "subjects" } }));
    }
  }

  /* ─── Menu Builder ─── */

  function buildLabel(S, lessonId) {
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    if (!lesson) return lessonId;
    const subj = S._idx.subjectById && S._idx.subjectById[lesson.subjectId];
    const subjName = subj ? (subj.abbr || subj.name) : lesson.subjectId;
    const classes = (lesson.classIds || [])
      .map(cid => S._idx.classById && S._idx.classById[cid])
      .filter(Boolean)
      .map(c => c.name)
      .join(", ");
    return subjName + (classes ? " (" + classes + ")" : "");
  }

  function open(lessonId, day, period, x, y) {
    close();
    const S = window.APP && window.APP.school;
    if (!S) return;
    const card = (S.cards || []).find(c => c.lessonId === lessonId && c.day === day && c.period === period);
    const lesson = S._idx && S._idx.lessonById && S._idx.lessonById[lessonId];
    const isLocked = (card && card.locked) || (lesson && (lesson.fixedDay != null || lesson.fixedPeriod != null));

    const items = [
      { icon: "🗑", label: "Remove",       run: () => removeCard(lessonId, day, period) },
      { sep: true },
      isLocked
        ? { icon: "🔓", label: "Unlock",   run: () => unlockCard(lessonId, day, period) }
        : { icon: "🔒", label: "Lock",     run: () => lockCard(lessonId, day, period) },
      { sep: true },
      { icon: "✎",  label: "Edit lesson", run: () => editLesson(lessonId) },
      { icon: "🔍", label: "Find",        run: () => findCard(lessonId) },
      { sep: true },
      { icon: "🚫", label: "Time off",     run: () => timeOff(lessonId) },
      { icon: "⚡", label: "Quick changes", run: () => quickChanges(lessonId) },
    ];

    menu = document.createElement("div");
    menu.id = "chrx-card-ctx";
    menu.style.cssText = "position:fixed;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 16px 40px rgba(15,23,42,.22);padding:6px 0;min-width:200px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#0f172a;z-index:10010";

    // Header
    const head = document.createElement("div");
    head.style.cssText = "padding:6px 14px;color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f1f5f9;margin-bottom:4px";
    head.textContent = buildLabel(S, lessonId);
    menu.appendChild(head);

    for (const it of items) {
      if (it.sep) {
        const sep = document.createElement("div");
        sep.style.cssText = "border-top:1px solid #f1f5f9;margin:4px 0";
        menu.appendChild(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.cssText = "display:flex;width:100%;align-items:center;gap:10px;padding:6px 14px;background:none;border:0;cursor:pointer;text-align:left;color:#0f172a";
      btn.onmouseenter = () => { btn.style.background = "#f1f5f9"; };
      btn.onmouseleave = () => { btn.style.background = "none"; };
      btn.innerHTML = '<span style="width:16px;text-align:center;font-size:13px">' + (it.icon || "") + '</span><span>' + it.label + '</span>';
      btn.onclick = () => { close(); try { it.run(); } catch (e) { console.error("[card-ctx]", e); } };
      menu.appendChild(btn);
    }

    // Position with viewport clamp
    document.body.appendChild(menu);
    const mr = menu.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    if (x + mr.width > vw) x = vw - mr.width - 8;
    if (y + mr.height > vh) y = vh - mr.height - 8;
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top  = Math.max(8, y) + "px";
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }

  /* ─── Event Listener ─── */

  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest) return;
    const vk = e.target.closest(".chrx-vkarta");
    if (!vk) return;
    const lessonId = vk.dataset.lessonId;
    if (!lessonId) return;
    e.preventDefault();
    const day = parseInt(vk.dataset.day, 10);
    const period = parseInt(vk.dataset.period, 10);
    open(lessonId, day, period, e.clientX, e.clientY);
  });

  window.CardContextMenu = { open, close };
})();
