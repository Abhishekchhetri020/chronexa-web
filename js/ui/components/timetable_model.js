// The model is illustrative. It never reads or mutates the active school.
const layers = [
  { key: "rooms", title: "Rooms", code: "RM", rows: [
    ["101", "", "203", "", "LAB"], ["", "GYM", "", "104", ""], ["ART", "", "LAB", "", "201"]
  ] },
  { key: "teachers", title: "Teachers", code: "TC", rows: [
    ["AM", "", "JS", "RK", ""], ["", "LH", "", "AM", "SB"], ["RK", "SB", "JS", "", "LH"]
  ] },
  { key: "classes", title: "Classes", code: "CL", rows: [
    ["MAT", "ENG", "", "BIO", "ART"], ["", "BIO", "GEO", "MAT", ""], ["ENG", "", "ART", "", "PHY"]
  ] }
];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function plate({ key, title, code, rows }) {
  const columns = days.map(day => `<b>${day}</b>`).join("");
  const periods = rows.map((row, i) => `<small>P${i + 1}</small>${row.map(subject =>
    `<i class="${subject ? "model-tile" : "model-slot"}">${subject}</i>`).join("")}`).join("");
  return `<div class="model-plane plane-${key}"><div class="model-surface">
    <div class="model-plate-title"><strong>${title}</strong><span>${code} / WEEK</span></div>
    <div class="model-grid"><b></b>${columns}${periods}</div>
  </div></div>`;
}

export function mountTimetableModel() {
  const assembly = document.getElementById("studio-assembly");
  if (!assembly || assembly.childElementCount) return;
  assembly.innerHTML = `<div class="model-drawing" aria-hidden="true">
    <div class="model-shadow"></div>${layers.map(plate).join("")}
  </div>`;
  const model = assembly.closest(".studio-model");
  const toggle = model.querySelector("[data-model-toggle]");
  toggle.addEventListener("click", () => {
    const stacked = model.classList.toggle("is-stacked");
    toggle.setAttribute("aria-pressed", String(stacked));
  });
}
