// Simulate the UI's "Generate" on the demo XML exactly as the browser runs
// it: N parallel branches (seeds 42 + i*7919), cold solve, fixed budget,
// best-placed branch wins (multi_branch.js semantics).
//
// Usage:
//   NODE_PATH=/private/tmp/chronexa_smoke/node_modules node tools/sim_ui_generate.mjs \
//     --repo /path/to/checkout --time-sec 120 --branches 8 [--stagnation-ms 0] [--xml PATH]
//
// Runs branches as child processes so they contend for cores like real
// Web Workers do.

import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

if (process.env.CHRONEXA_SIM_CHILD) {
  // ── child: parse XML, solve one branch, report ──────────────────────────
  const repo = process.env.CHRONEXA_SIM_REPO;
  const xml = process.env.CHRONEXA_SIM_XML;
  const seed = Number(process.env.CHRONEXA_SIM_SEED);
  const timeSec = Number(process.env.CHRONEXA_SIM_TIME);
  const stagnationMs = process.env.CHRONEXA_SIM_STAG !== "" ? Number(process.env.CHRONEXA_SIM_STAG) : null;

  const fs = await import("node:fs");
  const vm = await import("node:vm");
  // ESM import ignores NODE_PATH — resolve jsdom from the smoke dir directly.
  const { createRequire } = await import("node:module");
  const requireSmoke = createRequire("/private/tmp/chronexa_smoke/");
  const { JSDOM } = requireSmoke("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.DOMParser = dom.window.DOMParser;
  const parserSrc = fs.readFileSync(path.join(repo, "js/xml/parse_timetable_xml.js"), "utf8");
  vm.runInThisContext(parserSrc, { filename: "parse_timetable_xml.js" });
  const parseTimetableXml = globalThis.window.parseTimetableXml;
  const xmlText = fs.readFileSync(xml, "utf8");
  const school = parseTimetableXml.parseText(xmlText, path.basename(xml));

  const { solve } = await import(new URL("file://" + path.join(repo, "js/solver/csp_solver.js")).href);
  const opts = { timeLimitSec: timeSec, seed, disableLearning: true };
  if (stagnationMs != null) opts.stagnationMs = stagnationMs;
  const res = solve(school, opts);
  // Count class mid-day gaps in the result: per (class, day), a gap is an
  // empty teaching slot between two occupied ones (the visual holes the user
  // sees). Lower is better; aSc's curated grid has zero.
  const ppd = Math.max(...(school.bell?.periods || [{index:8}]).map(p => p.index | 0));
  const lessonById = Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
  const occ = {}; // classId|day -> Set(period)
  for (const a of res.assignment || []) {
    const l = lessonById[a.lessonId]; if (!l) continue;
    for (const cid of l.classIds || []) {
      const k = cid + "|" + a.day;
      (occ[k] = occ[k] || new Set()).add(a.period);
    }
  }
  let gaps = 0;
  for (const k in occ) {
    const ps = [...occ[k]].sort((x, y) => x - y);
    if (ps.length < 2) continue;
    for (let p = ps[0]; p <= ps[ps.length - 1]; p++) if (!occ[k].has(p)) gaps++;
  }
  process.send({ seed, placed: res.stats.placed, unplaced: res.stats.unplaced, soft: res.stats.softScore, status: res.status, ms: res.stats.durationMs, gaps });
  process.exit(0);
}

// ── parent ────────────────────────────────────────────────────────────────
const repo = path.resolve(arg("--repo", path.resolve(__dirname, "..")));
const xml = path.resolve(arg("--xml", path.join(path.resolve(__dirname, ".."), "docs/demo_sample-school.xml")));
const timeSec = Number(arg("--time-sec", "120"));
const branches = Number(arg("--branches", "8"));
const stagnationMs = arg("--stagnation-ms", "");

const children = [];
const results = [];
for (let i = 0; i < branches; i++) {
  const seed = 42 + i * 7919;
  const child = fork(fileURLToPath(import.meta.url), [], {
    env: {
      ...process.env,
      CHRONEXA_SIM_CHILD: "1",
      CHRONEXA_SIM_REPO: repo,
      CHRONEXA_SIM_XML: xml,
      CHRONEXA_SIM_SEED: String(seed),
      CHRONEXA_SIM_TIME: String(timeSec),
      CHRONEXA_SIM_STAG: stagnationMs,
    },
  });
  child.on("message", (m) => results.push(m));
  children.push(new Promise((res) => child.on("exit", res)));
}
await Promise.all(children);
results.sort((a, b) => a.seed - b.seed);
for (const r of results) {
  console.log(`seed=${String(r.seed).padEnd(6)} placed=${r.placed} unplaced=${r.unplaced} gaps=${r.gaps ?? "?"} soft=${r.soft} ${r.status}`);
}
const best = results.reduce((a, b) => (b.placed > a.placed || (b.placed === a.placed && b.soft > a.soft) ? b : a));
console.log(`BEST (UI would show): placed=${best.placed} unplaced=${best.unplaced} gaps=${best.gaps ?? "?"} (seed ${best.seed})`);
