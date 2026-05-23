/**
 * FocusMode — spotlight every editor card related to one entity, dim the rest.
 *
 * Ported from Swift's FocusModeSheet. Single-entity highlight; Esc or banner ✕
 * to exit. Survives editor re-renders by listening to editor:place / editor:pickup
 * and re-applying.
 *
 * Cards in grid_canvas.js carry `data-lesson-id` (only). Per spec, derive
 * teacher/class/room/subject from APP.school._idx.lessonById at apply time —
 * we don't modify grid_canvas.js.
 *
 *   window.FocusMode.enter("teacher" | "class" | "room" | "subject", entityId)
 *   window.FocusMode.exit()
 */
(function () {
  "use strict";

  const STATE = {
    kind: null,        // "teacher" | "class" | "room" | "subject"
    entityId: null,
    relatedLessonIds: null,   // Set<string>
    banner: null,             // DOM node
    boundKey: null,
    boundReapply: null,
  };

  function school() { return window.APP && window.APP.school || null; }

  /** Build the set of lessonIds whose card should stay lit. */
  function computeRelatedLessons(kind, entityId) {
    const S = school();
    if (!S || !S.lessons) return new Set();
    const out = new Set();
    for (const L of S.lessons) {
      let match = false;
      if (kind === "teacher") {
        match = (L.teacherIds || []).indexOf(entityId) !== -1;
      } else if (kind === "class") {
        match = (L.classIds || []).indexOf(entityId) !== -1;
      } else if (kind === "subject") {
        match = L.subjectId === entityId;
      } else if (kind === "room") {
        if (L.preferredRoomId === entityId) match = true;
        // Also include lessons whose placed cards live in this room.
        if (!match && S.cards) {
          for (const c of S.cards) {
            if (c.lessonId === L.id && c.classroomId === entityId) { match = true; break; }
          }
        }
      }
      if (match) out.add(L.id);
    }
    return out;
  }

  function entityLabel(kind, entityId) {
    const S = school();
    if (!S || !S._idx) return entityId;
    const m = ({
      teacher: S._idx.teacherById,
      class:   S._idx.classById,
      room:    S._idx.classroomById,
      subject: S._idx.subjectById,
    })[kind];
    if (!m) return entityId;
    const ent = m[entityId];
    if (!ent) return entityId;
    return ent.name || ent.abbr || entityId;
  }

  /** Walk every .chrx-vkarta and toggle dim/focus classes. */
  function applyClasses() {
    const root = document.querySelector(".chrx-editor");
    if (!root) return;
    const cards = root.querySelectorAll(".chrx-vkarta");
    if (!STATE.relatedLessonIds) {
      // Clear all marks (exit path)
      cards.forEach(el => {
        el.classList.remove("chrx-card--dimmed");
        el.classList.remove("chrx-card--focus");
      });
      return;
    }
    cards.forEach(el => {
      const lid = el.getAttribute("data-lesson-id");
      const hit = lid && STATE.relatedLessonIds.has(lid);
      el.classList.toggle("chrx-card--focus", !!hit);
      el.classList.toggle("chrx-card--dimmed", !hit);
    });
  }

  function buildBanner(kind, entityId) {
    const wrap = document.createElement("div");
    wrap.className = "chrx-focus-banner";
    wrap.setAttribute("role", "status");
    const label = document.createElement("span");
    label.className = "chrx-focus-banner__label";
    label.textContent = "🔦 Focus: " + entityLabel(kind, entityId) + "  ·  click";
    const x = document.createElement("button");
    x.type = "button";
    x.className = "chrx-focus-banner__close";
    x.setAttribute("aria-label", "Exit focus mode");
    x.textContent = "✕";
    x.addEventListener("click", function () { exit(); });
    const tail = document.createElement("span");
    tail.className = "chrx-focus-banner__tail";
    tail.textContent = " to exit (or press Esc)";
    wrap.appendChild(label);
    wrap.appendChild(x);
    wrap.appendChild(tail);
    return wrap;
  }

  function mountBanner(node) {
    // Prefer just-above the editor; else top of step-6; else body.
    const step6 = document.getElementById("step-6");
    const editor = document.getElementById("editor-root");
    if (step6 && editor) {
      step6.insertBefore(node, editor);
    } else if (step6) {
      step6.insertBefore(node, step6.firstChild);
    } else {
      document.body.appendChild(node);
    }
  }

  function onKey(ev) {
    if (ev.key === "Escape" && STATE.kind) exit();
  }

  function onReapply() {
    // Editor re-rendered (place/pickup); re-paint highlight classes.
    if (STATE.relatedLessonIds) applyClasses();
  }

  function enter(kind, entityId, isHover) {
    if (!kind || !entityId) return;
    if (STATE.kind) exit();   // re-enter cleanly
    STATE.kind = kind;
    STATE.entityId = entityId;
    STATE.relatedLessonIds = computeRelatedLessons(kind, entityId);
    if (!isHover) {
      STATE.banner = buildBanner(kind, entityId);
      mountBanner(STATE.banner);
      STATE.boundKey = onKey;
      document.addEventListener("keydown", STATE.boundKey);
    }
    applyClasses();
    STATE.boundReapply = onReapply;
    document.addEventListener("editor:place",  STATE.boundReapply);
    document.addEventListener("editor:pickup", STATE.boundReapply);
  }

  function exit() {
    if (!STATE.kind) return;
    if (STATE.boundKey) {
      document.removeEventListener("keydown", STATE.boundKey);
      STATE.boundKey = null;
    }
    if (STATE.boundReapply) {
      document.removeEventListener("editor:place",  STATE.boundReapply);
      document.removeEventListener("editor:pickup", STATE.boundReapply);
      STATE.boundReapply = null;
    }
    if (STATE.banner && STATE.banner.parentNode) {
      STATE.banner.parentNode.removeChild(STATE.banner);
    }
    STATE.kind = null;
    STATE.entityId = null;
    STATE.relatedLessonIds = null;
    STATE.banner = null;
    applyClasses();   // strip remaining classes
  }

  /** Convenience picker — used by the View → Focus mode menu entry. */
  function openPicker() {
    const S = school();
    if (!S) {
      if (window._chrxNotify) window._chrxNotify("Load a timetable first.");
      return;
    }
    const D = window.EntityDialog;
    if (!D || !D.openSheet) {
      // Fallback to prompt
      const k = (prompt("Focus on which kind? teacher / class / room / subject", "teacher") || "").trim();
      if (!k) return;
      const list = listFor(k);
      if (!list || !list.length) { alert("No " + k + "s loaded."); return; }
      const name = prompt(k + " name (exact or substring)?", list[0].name || "");
      if (!name) return;
      const hit = list.find(e => (e.name || "").toLowerCase().includes(name.toLowerCase()));
      if (!hit) { alert("No " + k + " matched."); return; }
      enter(k, hit.id);
      return;
    }
    // Sheet-based picker
    const root = document.createElement("div");
    root.style.cssText = "padding:14px;min-width:360px;max-width:480px;font-size:13px;color:var(--chrx-fg)";
    const h = document.createElement("div");
    h.style.cssText = "font-weight:600;margin-bottom:8px";
    h.textContent = "Focus mode — pick an entity to spotlight";
    root.appendChild(h);
    const tabs = document.createElement("div");
    tabs.style.cssText = "display:flex;gap:6px;margin-bottom:10px";
    const KINDS = [["teacher","Teachers"],["class","Classes"],["room","Rooms"],["subject","Subjects"]];
    const listBox = document.createElement("div");
    listBox.style.cssText = "max-height:320px;overflow:auto;border:1px solid var(--chrx-line);border-radius:6px;background:var(--chrx-bg-tile)";
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Filter…";
    search.style.cssText = "width:100%;padding:6px 8px;margin-bottom:8px;border:1px solid var(--chrx-line);border-radius:6px;background:var(--chrx-bg-input);color:var(--chrx-fg)";
    let activeKind = "teacher";
    function paintList() {
      const term = (search.value || "").toLowerCase();
      const items = (listFor(activeKind) || []).filter(e =>
        !term || (e.name || "").toLowerCase().includes(term) || (e.abbr || "").toLowerCase().includes(term)
      );
      listBox.innerHTML = "";
      if (!items.length) {
        const empty = document.createElement("div");
        empty.style.cssText = "padding:18px;text-align:center;color:var(--chrx-fg-tertiary)";
        empty.textContent = "No matches.";
        listBox.appendChild(empty);
        return;
      }
      for (const e of items) {
        const row = document.createElement("button");
        row.type = "button";
        row.style.cssText = "display:flex;justify-content:space-between;width:100%;padding:6px 10px;border:0;background:transparent;color:var(--chrx-fg);text-align:left;cursor:pointer;font-size:13px";
        row.addEventListener("mouseenter", () => row.style.background = "var(--chrx-accent-bg)");
        row.addEventListener("mouseleave", () => row.style.background = "transparent");
        const main = document.createElement("span");
        main.textContent = e.name || e.abbr || e.id;
        const sub = document.createElement("span");
        sub.style.cssText = "color:var(--chrx-fg-tertiary);font-size:11px";
        sub.textContent = e.abbr || "";
        row.appendChild(main); row.appendChild(sub);
        row.addEventListener("click", function () {
          window.EntityDialog.closeSheet && window.EntityDialog.closeSheet();
          enter(activeKind, e.id);
        });
        listBox.appendChild(row);
      }
    }
    function setKind(k) {
      activeKind = k;
      Array.from(tabs.children).forEach(b => {
        const on = b.getAttribute("data-kind") === k;
        b.style.background = on ? "var(--chrx-accent)" : "transparent";
        b.style.color = on ? "#fff" : "var(--chrx-fg)";
      });
      paintList();
    }
    for (const [k, lbl] of KINDS) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-kind", k);
      b.textContent = lbl;
      b.style.cssText = "padding:4px 10px;border:1px solid var(--chrx-line);border-radius:6px;cursor:pointer;font-size:12px";
      b.addEventListener("click", () => setKind(k));
      tabs.appendChild(b);
    }
    root.appendChild(tabs);
    root.appendChild(search);
    root.appendChild(listBox);
    search.addEventListener("input", paintList);
    D.openSheet(root, { title: "Focus mode" });
    setKind("teacher");
    setTimeout(() => search.focus(), 50);
  }

  function listFor(kind) {
    const S = school();
    if (!S) return [];
    if (kind === "teacher") return S.teachers || [];
    if (kind === "class")   return S.classes  || [];
    if (kind === "room")    return S.classrooms || [];
    if (kind === "subject") return S.subjects || [];
    return [];
  }

  window.FocusMode = { enter, exit, openPicker };
})();
