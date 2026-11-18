// Landing hero board + landing motion. Illustrative only: it never reads or
// mutates the active school.
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// One week for one class, seen three ways. Index = period * 5 + day.
// "" is a free period. The clash cell and its destination are fixed below.
const VIEWS = {
  classes: [
    "MAT", "ENG", "SCI", "HIN", "MAT",
    "SCI", "MAT", "ENG", "SST", "ART",
    "ENG", "SST", "MAT", "",    "SCI",
    "HIN", "",    "ART", "MAT", "ENG",
    "SST", "SCI", "HIN", "ENG", "",
    "PE",  "HIN", "",    "SCI", "SST",
  ],
  teachers: [
    "AM", "JS", "RK", "NP", "AM",
    "RK", "AM", "JS", "SB", "LH",
    "JS", "SB", "AM", "",   "RK",
    "NP", "",   "LH", "AM", "JS",
    "SB", "RK", "NP", "JS", "",
    "DK", "NP", "",   "RK", "SB",
  ],
  rooms: [
    "101", "101", "LAB", "101", "101",
    "LAB", "101", "101", "204", "ART",
    "101", "204", "101", "",    "LAB",
    "101", "",    "ART", "101", "101",
    "204", "LAB", "101", "101", "",
    "GYM", "101", "",    "LAB", "204",
  ],
};
const HUE = {
  MAT: 220, ENG: 28, SCI: 160, HIN: 340, SST: 265, ART: 300, PE: 190,
  AM: 220, JS: 28, RK: 160, NP: 340, SB: 265, LH: 300, DK: 190,
  "101": 220, LAB: 160, "204": 265, ART_ROOM: 300, GYM: 190,
};
const CLASH_FROM = 12; // Wed P3 — the lesson that gets double-booked
const CLASH_TO = 13;   // Thu P3 — the free period it moves to

function hueOf(view, label) {
  if (view === "rooms" && label === "ART") return HUE.ART_ROOM;
  return HUE[label] ?? 220;
}

function boardHTML(view) {
  const cells = VIEWS[view];
  const head = `<span></span>${DAYS.map(d => `<b>${d}</b>`).join("")}`;
  let body = "";
  for (let p = 0; p < 6; p++) {
    body += `<small>P${p + 1}</small>`;
    for (let d = 0; d < 5; d++) {
      const i = p * 5 + d;
      const label = cells[i];
      let cls = "lx-cell";
      if (i === CLASH_FROM) cls += " is-clash-from";
      if (i === CLASH_TO) cls += " is-clash-to";
      const chipLabel = i === CLASH_TO ? cells[CLASH_FROM] : label;
      const chip = chipLabel
        ? `<em class="lx-chip" style="--h:${hueOf(view, chipLabel)};--i:${p + d}">${chipLabel}</em>`
        : "";
      body += `<span class="${cls}">${chip}</span>`;
    }
  }
  return `<div class="lx-grid">${head}${body}</div>`;
}

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function wireViews(device, board) {
  device.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      device.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      board.innerHTML = boardHTML(view);
      board.classList.remove("is-swapping");
      void board.offsetWidth; // restart the chip entrance
      board.classList.add("is-swapping");
      // The new board restarts the clash loop, so restart the floats with it.
      device.parentElement.querySelectorAll(".lx-float").forEach((f) => {
        f.style.animation = "none";
        void f.offsetWidth;
        f.style.animation = "";
      });
    });
  });
}

// Hero device flattens from a tilt as the visitor scrolls; floats follow the
// pointer a little. Both write CSS variables only.
function wireHeroMotion(hero) {
  if (reduced()) { hero.style.setProperty("--lx-p", "1"); return; }
  let ticking = false;
  const update = () => {
    ticking = false;
    if (!document.body.classList.contains("chrx-landing-active")) return;
    const h = hero.offsetHeight || 1;
    const p = Math.min(1, Math.max(0, window.scrollY / (h * 0.55)));
    hero.style.setProperty("--lx-p", p.toFixed(3));
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();

  if (window.matchMedia?.("(pointer: fine)").matches) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--lx-mx", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
      hero.style.setProperty("--lx-my", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
    });
    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--lx-mx", "0");
      hero.style.setProperty("--lx-my", "0");
    });
  }
}

// Sections rise in once as they enter the viewport.
function wireReveal(root) {
  const items = root.querySelectorAll("[data-reveal]");
  if (reduced() || !("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("is-in"));
    return;
  }
  root.classList.add("lx-js");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-in");
      io.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  items.forEach(el => io.observe(el));
}

export function mountTimetableModel() {
  const board = document.getElementById("studio-assembly");
  if (!board || board.childElementCount) return;
  board.innerHTML = boardHTML("classes");
  const device = board.closest(".lx-device");
  const hero = board.closest(".lx-hero");
  const landing = board.closest(".chrx-landing");
  if (device) wireViews(device, board);
  if (hero) wireHeroMotion(hero);
  if (landing) wireReveal(landing);
}
