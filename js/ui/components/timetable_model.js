// Landing v4 motion: the hero card field and the pinned scroll story.
// Illustrative only — it never reads or mutates the active school.

// One week for one class, seen three ways. Index = period * 5 + day; "" = free.
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
    "LAB", "101", "101", "204", "STU",
    "101", "204", "101", "",    "LAB",
    "101", "",    "STU", "101", "101",
    "204", "LAB", "101", "101", "",
    "GYM", "101", "",    "LAB", "204",
  ],
};
const HUE = { MAT: 215, ENG: 32, SCI: 160, HIN: 340, SST: 262, ART: 295, PE: 190 };
const CLASH_FROM = 12; // Wed P3 — where the second lesson lands
const CLASH_TO = 13;   // Thu P3 — the free period it is moved to

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const smooth = (t) => t * t * (3 - 2 * t);
const rand = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const chip = (label, hue, cls = "") => `<em class="lx-card ${cls}" style="--h:${hue}">${label}</em>`;

/* ── Hero: lesson cards drifting in depth around the headline ─────────── */
const FIELD = [
  // x%, y%, depth (0 far … 1 near), rotation, subject
  [6, 14, .9, -14, "MAT"], [18, 62, .45, 10, "SCI"], [3, 80, .7, 8, "ENG"],
  [26, 30, .25, -6, "HIN"], [14, 40, .15, 18, "ART"], [30, 84, .55, -12, "SST"],
  [88, 12, .8, 12, "ENG"], [76, 58, .4, -9, "MAT"], [94, 44, .6, -16, "PE"],
  [70, 26, .2, 7, "SCI"], [84, 82, .95, 6, "HIN"], [62, 88, .3, -4, "ART"],
  [48, 6, .12, 4, "SST"], [40, 94, .2, 11, "MAT"],
];

function mountField(field) {
  field.innerHTML = FIELD.map(([x, y, z, r, s], i) =>
    `<span class="lx-fcard" style="left:${x}%;top:${y}%;--z:${z};--r:${r}deg;--i:${i}">${chip(s, HUE[s])}</span>`
  ).join("");
}

/* ── Story: scattered cards → week grid → three layers → clash → solved ── */
function mountStory(story) {
  const sky = story.querySelector("#lx-sky");
  const hud = story.querySelector("#lx-hud");
  const caps = [...story.querySelectorAll(".lx-cap")];
  const rail = [...story.querySelectorAll(".lx-rail li")];
  const days = story.querySelector(".lx-days");

  const layer = (view, name) => `<div class="lx-layer lx-layer--${view}"><span class="lx-layer__tag">${name}</span>${
    VIEWS[view].map((l) => `<span class="lx-slot">${l ? `<b>${l}</b>` : ""}</span>`).join("")}</div>`;
  const lessons = VIEWS.classes.map((l, i) => [l, i]).filter(([l]) => l);
  sky.innerHTML = `<div class="lx-plane">
      ${layer("rooms", "Rooms")}${layer("teachers", "Teachers")}
      <div class="lx-layer lx-layer--classes"><span class="lx-layer__tag">Classes</span>${
        VIEWS.classes.map((_, i) => `<span class="lx-slot" data-slot="${i}"></span>`).join("")}</div>
      ${lessons.map(([l, i]) => chip(l, HUE[l], "lx-card--lesson")).join("")}
      ${chip("MAT", HUE.MAT, "lx-card--intruder")}
    </div>`;
  const plane = sky.firstElementChild;
  const cards = [...plane.querySelectorAll(".lx-card--lesson")];
  const intruder = plane.querySelector(".lx-card--intruder");
  const layerEls = {
    rooms: plane.querySelector(".lx-layer--rooms"),
    teachers: plane.querySelector(".lx-layer--teachers"),
    classes: plane.querySelector(".lx-layer--classes"),
  };
  const slotFrom = plane.querySelector(`[data-slot="${CLASH_FROM}"]`);
  const slotTo = plane.querySelector(`[data-slot="${CLASH_TO}"]`);

  let W = 0, H = 0, gap = 0, cw = 0, ch = 0;
  const measure = () => {
    W = sky.clientWidth; H = sky.clientHeight;
    gap = Math.max(4, W * 0.012);
    cw = (W - gap * 4) / 5; ch = (H - gap * 5) / 6;
    sky.style.setProperty("--cw", cw + "px");
    sky.style.setProperty("--ch", ch + "px");
    sky.style.setProperty("--g", gap + "px");
  };
  const cellXY = (i) => [(i % 5) * (cw + gap), Math.floor(i / 5) * (ch + gap)];

  let hudKey = "";
  const setHud = (key, text, tone) => {
    if (hudKey === key) return;
    hudKey = key;
    hud.dataset.tone = tone || "";
    hud.querySelector("span").textContent = text;
  };
  let capIdx = -1;

  function render(p) {
    // Scene timings along the pinned scroll (0 … 1).
    const aRaw = clamp(p / 0.26);
    const split = smooth(clamp((p - 0.30) / 0.10)) * (1 - smooth(clamp((p - 0.50) / 0.10)));
    const land = ease(clamp((p - 0.63) / 0.08));
    const move = ease(clamp((p - 0.79) / 0.09));

    // 1 — assemble: each card flies from its own scattered point.
    let placed = 0;
    cards.forEach((card, k) => {
      const delay = rand(k + 7) * 0.4;
      const t = ease(clamp((aRaw - delay) / 0.6));
      if (t > 0.98) placed++;
      const [tx, ty] = cellXY(lessons[k][1]);
      const sx = (rand(k) * 2.4 - 0.7) * W, sy = (rand(k + 50) * 2.2 - 0.6) * H;
      const sz = -900 + rand(k + 100) * 1300;
      const rx = (rand(k + 3) - 0.5) * 140 * (1 - t);
      const ry = (rand(k + 4) - 0.5) * 140 * (1 - t);
      const rz = (rand(k + 5) - 0.5) * 100 * (1 - t);
      const x = sx + (tx - sx) * t, y = sy + (ty - sy) * t, z = sz * (1 - t) + split * 160;
      card.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
      card.style.opacity = (0.15 + 0.85 * t).toFixed(3);
    });

    // 2 — layer: the plane tilts and the teacher/room timetables separate.
    plane.style.transform = `rotateX(${split * 56}deg) rotateZ(${-split * 30}deg) scale(${1 - split * (W < 600 ? 0.34 : 0.12)})`;
    layerEls.classes.style.transform = `translateZ(${split * 160}px)`;
    layerEls.teachers.style.transform = `translateZ(${split * 20}px)`;
    layerEls.teachers.style.opacity = split.toFixed(3);
    layerEls.rooms.style.transform = `translateZ(${-split * 120}px)`;
    layerEls.rooms.style.opacity = split.toFixed(3);
    sky.classList.toggle("is-layered", split > 0.5);
    days.style.opacity = (aRaw * (1 - split)).toFixed(3);

    // 3 — detect: a second lesson drops onto Wed P3. 4 — resolve: it moves on.
    const [fx, fy] = cellXY(CLASH_FROM), [gx, gy] = cellXY(CLASH_TO);
    const ox = cw * 0.14 * (1 - move), oy = ch * 0.34 * (1 - move);
    const ix = fx + (gx - fx) * move + ox;
    const iy = (fy - H * 0.9) + (H * 0.9) * land + (gy - fy) * move + oy;
    const iz = 500 * (1 - land) + 30 * Math.sin(move * Math.PI);
    intruder.style.transform = `translate3d(${ix}px,${iy}px,${iz}px) rotateZ(${(1 - land) * 24}deg)`;
    intruder.style.opacity = land.toFixed(3);
    const clash = land > 0.95 && move < 0.05;
    const solved = move > 0.98;
    intruder.classList.toggle("is-clash", land > 0.6 && move < 0.6);
    slotFrom.classList.toggle("is-clash", clash);
    slotTo.classList.toggle("is-solved", solved);
    sky.classList.toggle("is-clash", clash);

    // Captions, rail and status.
    const idx = p < 0.28 ? 0 : p < 0.60 ? 1 : p < 0.76 ? 2 : 3;
    if (idx !== capIdx) {
      capIdx = idx;
      caps.forEach((c, i) => c.classList.toggle("is-on", i === idx));
      rail.forEach((r, i) => r.classList.toggle("is-on", i <= idx));
    }
    if (idx === 0) setHud("a" + placed, `Placing lessons · ${placed} of ${cards.length}`);
    else if (idx === 1) setHud("l", "Class · Teacher · Room — in sync");
    else if (idx === 2) setHud(clash ? "c" : "c0", clash ? "Clash · Wed P3 is double-booked" : "Adding a lesson…", clash ? "red" : "");
    else setHud(solved ? "s" : "m", solved ? "Solved · 0 clashes" : "Moving to Thu P3…", solved ? "green" : "");
  }

  return { measure, render };
}

/* ── Scroll + pointer plumbing ─────────────────────────────────────────── */
function wireReveal(root) {
  const items = root.querySelectorAll("[data-reveal]");
  if (reduced() || !("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("is-in")); return; }
  root.classList.add("lx-js");
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("is-in");
    io.unobserve(e.target);
  }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
  items.forEach((el) => io.observe(el));
}

export function mountTimetableModel() {
  const landing = document.querySelector(".chrx-landing");
  const field = document.getElementById("lx-field");
  const story = document.getElementById("lx-story");
  if (!landing || !field || !story || field.childElementCount) return;
  const hero = landing.querySelector(".lx-hero");

  mountField(field);
  const scene = mountStory(story);
  wireReveal(landing);

  if (reduced()) {
    story.classList.add("is-static");
    scene.measure();
    scene.render(1);
    window.addEventListener("resize", () => { scene.measure(); scene.render(1); });
    return;
  }

  let queued = false;
  const frame = () => {
    queued = false;
    if (!document.body.classList.contains("chrx-landing-active")) return;
    const vh = window.innerHeight;
    hero.style.setProperty("--lx-p", clamp(window.scrollY / (hero.offsetHeight * 0.7)).toFixed(3));
    const r = story.getBoundingClientRect();
    if (r.bottom > -vh && r.top < vh * 2) scene.render(clamp(-r.top / (r.height - vh)));
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(frame); } };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", () => { scene.measure(); queue(); });
  scene.measure();
  frame();

  if (window.matchMedia?.("(pointer: fine)").matches) {
    // Feature tiles carry a soft spotlight that follows the cursor.
    landing.querySelectorAll(".lx-tile").forEach((tile) => tile.addEventListener("pointermove", (e) => {
      const r = tile.getBoundingClientRect();
      tile.style.setProperty("--tx", `${e.clientX - r.left}px`);
      tile.style.setProperty("--ty", `${e.clientY - r.top}px`);
    }));
    hero.addEventListener("pointermove", (e) => {
      hero.style.setProperty("--lx-mx", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      hero.style.setProperty("--lx-my", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    });
    hero.addEventListener("pointerleave", () => {
      hero.style.setProperty("--lx-mx", "0");
      hero.style.setProperty("--lx-my", "0");
    });
  }
}
