window.StartScreen = (function () {
  "use strict";

  const AUTO_KEY = "chronexa.autosave.v1";
  const SNAP_KEY = "chronexa.snapshots.v1";
  const SWATCHES = [
    "var(--chrx-accent)",
    "var(--chrx-green)",
    "var(--chrx-orange)",
    "var(--chrx-purple)",
  ];

  function render() {
    wireOpenCard();
    wireSampleInfo();
    renderRecent();
    mountLandingDemo();
  }

  function mountLandingDemo() {
    const mount = document.getElementById("landing-demo-mount");
    if (!mount || !window.LandingDemo || typeof window.LandingDemo.mount !== "function") return;
    window.LandingDemo.mount(mount);
  }

  function wireOpenCard() {
    const card = document.getElementById("start-open-card");
    const input = document.getElementById("xml-file");
    if (!card || !input || card.dataset.startWired === "1") return;
    card.dataset.startWired = "1";
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Open XML or HAR file");

    card.addEventListener("click", (e) => {
      if (e.target === input) return;
      e.preventDefault();
      input.click();
    });

    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      input.click();
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragleave", () => card.classList.remove("is-dragging"));
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("is-dragging");
      if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function wireSampleInfo() {
    const btn = document.getElementById("start-sample-info");
    if (!btn || btn.dataset.startWired === "1") return;
    btn.dataset.startWired = "1";
    btn.addEventListener("click", openSampleInfo);
  }

  function renderRecent() {
    const section = document.getElementById("start-recent-section");
    const listEl = document.getElementById("start-recent-list");
    if (!section || !listEl) return;

    const entries = collectRecent().slice(0, 4);
    if (!entries.length) {
      section.classList.add("hidden");
      listEl.innerHTML = "";
      return;
    }

    section.classList.remove("hidden");
    listEl.innerHTML = "";
    entries.forEach((entry, idx) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "chrx-start-recent__row";
      row.innerHTML = `
        <span class="chrx-start-recent__swatch" aria-hidden="true"></span>
        <span class="chrx-start-recent__name"></span>
        <span class="chrx-start-recent__time"></span>
      `;
      row.querySelector(".chrx-start-recent__swatch").style.setProperty("--start-swatch", SWATCHES[idx % SWATCHES.length]);
      row.querySelector(".chrx-start-recent__name").textContent = entry.schoolName;
      row.querySelector(".chrx-start-recent__time").textContent = relativeTime(entry.timeMs);
      row.addEventListener("click", () => restoreRecent(entry));
      listEl.appendChild(row);
    });
  }

  function collectRecent() {
    const entries = [];
    const auto = readJSON(AUTO_KEY);
    if (auto && auto.payload) {
      entries.push(normalizeEntry({
        id: "autosave",
        source: "autosave",
        ts: auto.ts,
        schoolName: auto.schoolName,
        payload: auto.payload,
      }));
    }

    const snaps = readJSON(SNAP_KEY);
    if (Array.isArray(snaps)) {
      snaps.forEach((snap) => {
        if (!snap || !snap.payload) return;
        entries.push(normalizeEntry({
          id: snap.id || "snapshot-" + snap.ts,
          source: "snapshot",
          ts: snap.ts,
          schoolName: snap.school || snap.schoolName,
          payload: snap.payload,
        }));
      });
    }

    return entries
      .filter((entry) => entry && entry.payload && entry.timeMs)
      .sort((a, b) => b.timeMs - a.timeMs);
  }

  function normalizeEntry(entry) {
    const payload = entry.payload || {};
    return {
      id: entry.id,
      source: entry.source,
      timeMs: toMillis(entry.ts),
      schoolName: entry.schoolName || payload.schoolName || "(untitled)",
      payload,
    };
  }

  function restoreRecent(entry) {
    const restored = entry.source === "autosave" && window.AutoSave && window.AutoSave.restore
      ? (window.AutoSave.restore() || entry)
      : entry;
    if (!restored || !restored.payload) {
      setStatus("Could not restore that timetable.", "error");
      return;
    }

    const APP = window.APP || (window.APP = {});
    APP.school = clone(restored.payload);
    if (window.CreateNew && window.CreateNew.refreshIndex) window.CreateNew.refreshIndex();
    if (window.CreateNew && window.CreateNew.ensureColors) window.CreateNew.ensureColors();
    document.querySelectorAll(".needs-school").forEach((btn) => { btn.disabled = false; });

    const detail = { source: "start-recent" };
    window.dispatchEvent(new CustomEvent("app:school-loaded", { detail }));
    document.dispatchEvent(new CustomEvent("app:school-loaded", { detail }));
    setStatus(`Restored ${APP.school.schoolName || "timetable"}.`, "ok");
    renderRecent();
  }

  function openSampleInfo() {
    const title = "Sample school";
    const paragraphs = [
      "The bundled demo contains a realistic school setup with teachers, classes, rooms, subjects, lessons, bell periods, and placed timetable cards.",
      "It loads locally from this app, can be edited like any timetable, and is useful for trying the editor before opening your own file.",
    ];

    const D = window.EntityDialog;
    if (D && D.openSheet && D.el) {
      try {
        D.openSheet(D.el("div", { class: "chrx-start-info" },
          ...paragraphs.map((text) => D.el("p", null, text))
        ), { title });
        return;
      } catch (e) {
        // Fall through to the standalone modal.
      }
    }

    const modal = document.createElement("div");
    modal.className = "chrx-start-modal";
    modal.innerHTML = `
      <div class="chrx-start-modal__panel" role="dialog" aria-modal="true" aria-label="Sample school">
        <h3>Sample school</h3>
        <p>${escapeHtml(paragraphs[0])}</p>
        <p>${escapeHtml(paragraphs[1])}</p>
        <button type="button" class="chrx-btn chrx-btn--primary">Done</button>
      </div>
    `;
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector("button").addEventListener("click", () => modal.remove());
    document.body.appendChild(modal);
  }

  function setStatus(message, tone) {
    const status = document.getElementById("xml-status");
    if (!status) return;
    const cls = tone === "error" ? "text-rose-700" : "text-emerald-700";
    status.innerHTML = `<span class="${cls} font-semibold">${escapeHtml(message)}</span>`;
  }

  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function toMillis(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    const parsed = Date.parse(value || "");
    return isFinite(parsed) ? parsed : 0;
  }

  function relativeTime(timeMs) {
    const diff = Math.max(0, Date.now() - timeMs);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) return "just now";
    if (diff < hour) return Math.max(1, Math.round(diff / minute)) + " min ago";
    if (diff < day) return Math.max(1, Math.round(diff / hour)) + " hr ago";
    if (diff < 2 * day) return "yesterday";
    return Math.round(diff / day) + " days ago";
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }

  return { render, collectRecent, openSampleInfo };
})();
