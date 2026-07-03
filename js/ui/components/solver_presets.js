/* Solver presets — quick "Fast / Balanced / Best / Custom" picker.
 *
 * The existing prelaunch_dialog.js asks for Complexity + Conditions tiers.
 * Most school admins don't want to think about that — they want to choose
 * one of three: "Fast preview", "Balanced (recommended)", "Best".
 *
 * This module adds a top strip to the prelaunch dialog (when it opens)
 * with 4 preset cards. Picking one auto-sets complexity + conditions +
 * time limit; "Custom" reveals the existing controls.
 *
 * Mounts via MutationObserver — no edits to prelaunch_dialog.js needed.
 */
(function () {
  "use strict";

  const PRESETS = [
    { id: "fast",     label: "🏃 Fast preview",   sub: "30s · quick check",       timeLimitSec: 30,  complexity: "normal",  conditions: "draft" },
    { id: "balanced", label: "⚖️ Balanced",         sub: "90s · recommended",       timeLimitSec: 90,  complexity: "large",   conditions: "allow-relaxation", recommended: true },
    { id: "best",     label: "🏆 Best result",     sub: "5 min · for final timetable", timeLimitSec: 300, complexity: "huge",   conditions: "strict" },
    { id: "custom",   label: "⚙️ Custom",          sub: "Tune complexity / conditions", custom: true },
  ];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false)
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function applyPreset(preset, dialog) {
    if (!dialog || preset.custom) return;
    // Find the radio inputs in the dialog
    const radios = dialog.querySelectorAll('input[type="radio"]');
    radios.forEach(r => {
      if (r.name === "complexity" && r.value === preset.complexity) r.checked = true;
      if (r.name === "conditions" && r.value === preset.conditions) r.checked = true;
    });
    // Also try to override time limit if input exists
    const timeInput = dialog.querySelector('input[name="timeLimit"], input[type="number"]');
    if (timeInput) timeInput.value = String(preset.timeLimitSec);
    // Reveal the start button (might auto-click)
    flashApplied(dialog, preset);
  }

  function flashApplied(dialog, preset) {
    let pill = dialog.querySelector(".chrx-preset-applied");
    if (!pill) {
      pill = el("div", { class: "chrx-preset-applied" });
      dialog.appendChild(pill);
    }
    pill.textContent = `✓ Preset: ${preset.label.replace(/^\W+\s*/, "")}`;
    setTimeout(() => pill.classList.add("show"), 50);
    setTimeout(() => pill.classList.remove("show"), 2000);
  }

  function injectStrip(dialog) {
    if (dialog.querySelector(".chrx-preset-strip")) return;
    ensureStyles();
    const strip = el("div", { class: "chrx-preset-strip" });
    strip.appendChild(el("p", { class: "chrx-preset-title" }, "Quick presets"));
    const grid = el("div", { class: "chrx-preset-grid" });
    PRESETS.forEach(p => {
      const card = el("button", { class: "chrx-preset-card" + (p.recommended ? " chrx-preset-card--recommended" : ""),
        type: "button",
        onclick: () => applyPreset(p, dialog),
      },
        el("div", { class: "chrx-preset-label" }, p.label),
        el("div", { class: "chrx-preset-sub" }, p.sub),
      );
      if (p.recommended) card.appendChild(el("span", { class: "chrx-preset-badge" }, "Recommended"));
      grid.appendChild(card);
    });
    strip.appendChild(grid);
    // Insert at top of dialog
    const firstChild = dialog.firstElementChild;
    dialog.insertBefore(strip, firstChild);
  }

  function ensureStyles() {
    if (document.getElementById("chrx-preset-styles")) return;
    const s = document.createElement("style");
    s.id = "chrx-preset-styles";
    s.textContent = `
.chrx-preset-strip{margin:0 0 14px;padding:10px 14px;background:var(--chrx-bg-tile);border-radius:8px;border:1px solid var(--chrx-line)}
.chrx-preset-title{margin:0 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--chrx-fg-secondary);font-weight:600}
.chrx-preset-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.chrx-preset-card{background:var(--chrx-bg-elev);border:1px solid var(--chrx-line);color:var(--chrx-fg);padding:8px 10px;border-radius:6px;text-align:left;cursor:pointer;transition:border .15s ease,transform .15s ease;position:relative}
.chrx-preset-card:hover{border-color:var(--chrx-accent);transform:translateY(-1px)}
.chrx-preset-card--recommended{border-color:var(--chrx-green-border);background:linear-gradient(135deg,var(--chrx-bg-elev),var(--chrx-green-bg))}
.chrx-preset-label{font-weight:600;font-size:12px;margin-bottom:2px;color:var(--chrx-accent)}
.chrx-preset-sub{font-size:10px;color:var(--chrx-fg-secondary);line-height:1.3}
.chrx-preset-badge{position:absolute;top:-7px;right:6px;background:var(--chrx-green);color:var(--chrx-accent-on);font-size:9px;padding:2px 6px;border-radius:8px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.chrx-preset-applied{position:fixed;bottom:80px;right:24px;background:var(--chrx-green);color:var(--chrx-accent-on);padding:6px 12px;border-radius:6px;font-size:12px;opacity:0;transform:translateY(8px);transition:all .2s ease;z-index:10000;pointer-events:none}
.chrx-preset-applied.show{opacity:1;transform:translateY(0)}
@media (max-width:600px){.chrx-preset-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(s);
  }

  function watchForPrelaunch() {
    const seen = new WeakSet();
    const observer = new MutationObserver(records => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          // Look for the prelaunch dialog or generate-result dialog
          const dlg = n.matches?.(".csu-dialog") ? n : n.querySelector?.(".csu-dialog");
          if (dlg && !seen.has(dlg)) {
            seen.add(dlg);
            // Only attach to the "Run the solver" mode, not the result dialog
            const isPrelaunch = (dlg.textContent || "").includes("Run the solver") || (dlg.textContent || "").includes("Generate timetable");
            if (isPrelaunch) injectStrip(dlg);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchForPrelaunch);
  } else watchForPrelaunch();

  window.SolverPresets = { PRESETS, applyPreset, injectStrip };
})();

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const SolverPresets = window.SolverPresets;
