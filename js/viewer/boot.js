/**
 * W2-2 published-viewer: boot switch target for `index.html?view=published`.
 *
 * Snapshot source, in order (contract C2):
 *   1. inlined <script type="application/json" id="chronexa-snapshot">
 *      (the single-file offline viewer lane W2-3 produces),
 *   2. &src=<url> (CORS-permitting URL),
 *   3. a file picker (open a .json snapshot from disk).
 *
 * Anything else — bad JSON, failed fetch, failed validation — gets a clear
 * error screen. Never a blank page.
 */
import { render } from "./render.js";

function mountRoot() {
  // Viewer mode must never activate the landing: the class is baked into the
  // first-byte <body> in index.html and only removed by the editor's showStep.
  // The viewer boot early-returns before that, so drop it here.
  document.body.classList.remove("chrx-landing-active");
  document.body.classList.add("chrx-viewer-active");
  let mount = document.getElementById("viewer-root");
  if (!mount) {
    mount = document.createElement("div");
    mount.id = "viewer-root";
  }
  // shell_v3 auto-mounts (even in viewer mode) and reparents body children
  // into #chrx-shell. Re-append the mount as a direct body child so the
  // viewer is never trapped inside the hidden editor shell.
  document.body.appendChild(mount);
  return mount;
}

function showError(mount, messages, { picker = false } = {}) {
  mount.innerHTML =
    '<div class="chrx-pub chrx-pub-error" role="alert">' +
      "<h1>Could not open this published timetable</h1>" +
      "<ul>" + messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("") + "</ul>" +
      (picker ? pickerHtml() : "") +
    "</div>";
  if (picker) wirePicker(mount);
}

function showLoading(mount, text) {
  mount.innerHTML =
    `<div class="chrx-pub chrx-pub-loading" role="status">${escapeHtml(text)}</div>`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function pickerHtml() {
  return (
    '<div class="chrx-pub-picker">' +
      "<p>Open a published snapshot (.json) shared by your school:</p>" +
      '<label class="chrx-pub-filebtn">Choose snapshot file' +
      '<input type="file" class="chrx-pub-file" accept="application/json,.json" hidden>' +
      "</label>" +
    "</div>"
  );
}

function wirePicker(mount) {
  const input = mount.querySelector(".chrx-pub-file");
  if (!input) return;
  input.addEventListener("change", () => {
    const f = input.files && input.files[0];
    if (!f) return;
    showLoading(mount, `Reading ${f.name}…`);
    const reader = new FileReader();
    reader.onload = () => {
      let snap;
      try {
        snap = JSON.parse(String(reader.result));
      } catch (err) {
        showError(mount, [`${f.name} is not valid JSON: ${err.message}`], { picker: true });
        return;
      }
      const res = render(mount, snap);
      if (!res.ok) showError(mount, res.errors, { picker: true });
    };
    reader.onerror = () => showError(mount, [`Could not read ${f.name}.`], { picker: true });
    reader.readAsText(f);
  });
}

function readInline() {
  const el = document.getElementById("chronexa-snapshot");
  if (!el) return { present: false };
  try {
    return { present: true, snapshot: JSON.parse(el.textContent || "") };
  } catch (err) {
    return { present: true, error: `The embedded snapshot is not valid JSON: ${err.message}` };
  }
}

export async function bootPublishedViewer() {
  const mount = mountRoot();
  try { document.title = "Published timetable — Chronexa viewer"; } catch {}

  // 1. Inlined snapshot (offline single-file viewer).
  const inline = readInline();
  if (inline.present) {
    if (inline.error) {
      showError(mount, [inline.error]);
      return;
    }
    const res = render(mount, inline.snapshot);
    if (!res.ok) showError(mount, res.errors);
    return;
  }

  // 2. &src=<url>.
  let src = null;
  try { src = new URLSearchParams(window.location.search).get("src"); } catch {}
  if (src) {
    showLoading(mount, "Loading published timetable…");
    try {
      const resp = await fetch(src, { mode: "cors" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const snap = await resp.json();
      const res = render(mount, snap);
      if (!res.ok) showError(mount, res.errors);
    } catch (err) {
      showError(mount, [`Could not load the snapshot from ${src}: ${err.message}`]);
    }
    return;
  }

  // 3. File picker.
  mount.innerHTML = `<div class="chrx-pub chrx-pub-start">${pickerHtml()}</div>`;
  wirePicker(mount);
}
