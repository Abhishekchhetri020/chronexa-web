/** PendingStrip.render(rootEl) — sticky bottom strip of un-placed cards. */
window.PendingStrip = (function () {
  "use strict";

  const GROUPS = {
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
    if (!S) {
      rootEl.innerHTML = `<div class="chrx-pending-empty">No timetable loaded.</div>`;
      return;
    }
    const placedCounts = countPlaced(S);
    const groups = buildGroups(S, placedCounts);

    rootEl.innerHTML = `
      ${toolbarHtml()}
      <div class="chrx-pending-scroll">
        ${groups.map(groupHtml).join("") || `<div class="chrx-pending-empty">All cards placed.</div>`}
      </div>
    `;
    wire(rootEl);
  }

  function toolbarHtml() {
    return `
      <div class="chrx-pending-toolbar">
        <input type="search" class="chrx-pending-search"
               placeholder="Search pending cards…"
               value="${esc(_state.filter)}">
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
    return `
      <div class="chrx-pending-group">
        <div class="chrx-pending-grouplabel">${esc(g.label)} <span class="chrx-pending-count">${g.cards.length}</span></div>
        <div class="chrx-pending-cards">
          ${g.cards.map(c => pendingCardHtml(c)).join("")}
        </div>
      </div>
    `;
  }

  function pendingCardHtml(p) {
    return `
      <div class="chrx-vkarta chrx-vk-pending"
           data-card-id="${esc(p.cardId)}"
           data-lesson-id="${esc(p.lessonId)}"
           style="--chrx-card-hue:${p.hue}"
           title="${esc(p.title)}">
        <div class="chrx-vk-line1">${esc(p.subjShort)}</div>
        <div class="chrx-vk-line2">${esc(p.classShort)}</div>
        <div class="chrx-vk-line3">${esc(p.teacherShort)}</div>
      </div>
    `;
  }

  function wire(rootEl) {
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
    rootEl.addEventListener("mousedown", (ev) => {
      const vk = ev.target.closest(".chrx-vk-pending");
      if (!vk) return;
      ev.preventDefault();
      const cardId = vk.dataset.cardId, lessonId = vk.dataset.lessonId;
      window.APP.editor = window.APP.editor || {};
      window.APP.editor.cardInHand = { cardId, lessonId, fromPending: true };
      document.body.classList.add("chrx-card-in-hand");
      vk.classList.add("chrx-vk-taken");
      document.dispatchEvent(new CustomEvent("editor:pickup", { detail: { cardId, lessonId, fromPending: true } }));
    });
    document.addEventListener("editor:place", () => render(rootEl));
  }

  function countPlaced(S) {
    const out = Object.create(null);
    for (const c of (S.cards || [])) out[c.lessonId] = (out[c.lessonId] || 0) + 1;
    return out;
  }

  function buildGroups(S, placedCounts) {
    const groupKeyFn = GROUPS[_state.groupBy].keyFn;
    const f = (_state.filter || "").trim();
    const groups = Object.create(null);

    for (const L of (S.lessons || [])) {
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
      const hue = hueOf(subjShort);

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

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  return { render };
})();
