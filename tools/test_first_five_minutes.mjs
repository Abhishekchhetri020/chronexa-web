// Regression tests for the "First 5 Minutes" onboarding surfaces.
// Usage: node tools/test_first_five_minutes.mjs

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom");
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.localStorage = dom.window.localStorage;
globalThis.confirm = () => true;
window.confirm = globalThis.confirm;
window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

function load(rel) {
  vm.runInThisContext(fs.readFileSync(path.join(repoRoot, rel), "utf8"), { filename: rel });
}

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log("  ✓ " + name);
    pass++;
  } else {
    console.log("  ✗ " + name + (detail ? " — " + detail : ""));
    fail++;
  }
}

load("js/ui/components/help_tooltip.js");
load("js/ui/components/landing_demo.js");
load("js/ui/components/first_card_coachmark.js");
load("js/ui/entities/dialog_shell.js");

{
  document.body.innerHTML = `
    <section class="chrx-landing-demo">
      <span data-landing-demo-status></span>
      <div id="landing-demo-mount"></div>
    </section>`;
  const mount = document.getElementById("landing-demo-mount");
  window.LandingDemo.mount(mount);
  check("landing demo renders a 5x5 grid", mount.querySelectorAll("[data-cell]").length === 25);
  check("reduced-motion landing demo renders solved cards", mount.querySelectorAll(".chrx-landing-demo__card").length === 25);
  check("landing demo exposes a solved status", document.querySelector("[data-landing-demo-status]").textContent === "Solved timetable");
}

{
  document.body.innerHTML = "";
  const field = window.EntityDialog.buildField(
    "Abbreviation",
    window.EntityDialog.el("input", { type: "text" }),
    "Short code shown on cards."
  );
  document.body.appendChild(field);
  const tip = field.querySelector(".chrx-help-tip");
  tip.dispatchEvent(new dom.window.Event("mouseenter"));
  tip.click();
  check("entity field help renders an accessible trigger", tip?.getAttribute("aria-label") === "Help for Abbreviation");
  check("clicking help pins its popover after hover", document.querySelector(".chrx-help-popover")?.textContent.includes("Short code shown on cards."));
  window.HelpTooltip.close();
}

{
  document.body.innerHTML = `
    <section id="step-6">
      <div id="editor-root"></div>
      <div id="pending-strip-root"></div>
      <span id="pending-count"></span>
      <div id="editor-banner"><span id="editor-banner-text"></span></div>
      <button id="cta-generate"></button>
    </section>`;
  window.APP = {
    school: {
      subjects: [{ id: "s1", name: "Math", abbr: "MTH" }],
      teachers: [],
      classes: [],
      classrooms: [],
      lessons: [],
      cards: [],
    },
    audit: { append() {} },
  };
  window.CreateNew = { refreshIndex() {}, ensureColors() {} };
  window.EntityDialog.uid = () => "t_quick";
  window.EntityDialog.autoPickColor = () => "#007AFF";
  load("js/ui/editor/activator.js");
  window.EditorActivator.activate();
  check("progress hero remains visible after a subject is added", document.querySelector('[data-kind="subjects"][data-completed="true"]') !== null);
  const quick = document.querySelector("[data-quick-add]");
  quick.elements.kind.value = "teachers";
  quick.elements.name.value = "Anita Sharma";
  quick.elements.abbr.value = "AS";
  quick.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  check("quick add creates a teacher inline", window.APP.school.teachers.length === 1 && window.APP.school.teachers[0].abbr === "AS");
}

{
  document.body.innerHTML = `
    <section id="step-6">
      <div id="editor-root"></div>
      <div id="pending-strip-root"></div>
      <span id="pending-count"></span>
      <div id="editor-banner"><span id="editor-banner-text"></span></div>
    </section>`;
  localStorage.removeItem("chronexa.coachmark.first-card.v1");
  window.APP.school.lessons = [{ id: "l1", periodsPerWeek: 1 }];
  window.APP.school.cards = [];
  window.FirstCardCoachmark.show();
  check("first-card coachmark shows for lessons with zero placements", document.querySelector(".chrx-coachmark-card") !== null);
  document.querySelector(".chrx-coachmark-card [data-show]").click();
  check("coachmark includes an inline show-me animation", !document.querySelector("[data-demo]").hidden);
  window.FirstCardCoachmark.dismiss();
}

{
  document.body.innerHTML = "";
  window.APP.school = {
    subjects: [{ id: "s1", name: "Math" }],
    teachers: [{ id: "t1", name: "Teacher" }],
    classes: [{ id: "c1", name: "7A" }],
    classrooms: [{ id: "r1", name: "Room" }],
    lessons: [{ id: "l1", subjectId: "s1", classIds: ["c1"], periodsPerWeek: 1 }],
    cards: [],
    _idx: { subjectById: { s1: { id: "s1", name: "Math" } } },
  };
  load("js/ui/wizard/wizard_walkthrough.js");
  window.WizardWalkthrough.start();
  for (let i = 0; i < 5; i++) {
    document.querySelector("#chrx-wizard-card > div:last-child button:last-child").click();
  }
  check("wizard finish renders the celebration summary", document.querySelector(".chrx-wiz-celebration") !== null);
  check("celebration reports lesson count", document.querySelector('.chrx-wiz-celebration__tile [data-target="1"]') !== null);
  document.querySelector("[data-action='add-more']").click();
  check("Add more details returns to the lesson step", document.querySelector("#chrx-wizard-card")?.textContent.includes("Step 5 of 5"));
  window.WizardWalkthrough.close();
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
