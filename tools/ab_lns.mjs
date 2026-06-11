// A/B: does enabling LNS on the generate path lift placement on the dense
// demo school? Reports placed + gaps for LNS ON vs OFF across seeds.
//   node tools/ab_lns.mjs --time-sec 90 --seeds 42,7961,15880,23799,31718,39637

import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, "..");
const xml = path.join(repo, "docs/demo_sample-school.xml");

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

if (process.env.AB_CHILD) {
  const fs = await import("node:fs");
  const vm = await import("node:vm");
  const { createRequire } = await import("node:module");
  const { JSDOM } = createRequire("/private/tmp/chronexa_smoke/")("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.DOMParser = dom.window.DOMParser;
  vm.runInThisContext(fs.readFileSync(path.join(repo, "js/xml/parse_timetable_xml.js"), "utf8"));
  const school = window.parseTimetableXml.parseText(fs.readFileSync(xml, "utf8"), "demo.xml");
  const { solve } = await import(new URL("file://" + path.join(repo, "js/solver/csp_solver.js")).href);
  const opts = { timeLimitSec: Number(process.env.AB_TIME), seed: Number(process.env.AB_SEED), disableLearning: true };
  if (process.env.AB_LNS === "1") opts.useLNS = true;
  const res = solve(school, opts);
  const lessonById = Object.fromEntries((school.lessons || []).map(l => [l.id, l]));
  const occ = {};
  for (const a of res.assignment || []) {
    const l = lessonById[a.lessonId]; if (!l) continue;
    for (const cid of l.classIds || []) (occ[cid + "|" + a.day] = occ[cid + "|" + a.day] || new Set()).add(a.period);
  }
  let gaps = 0;
  for (const k in occ) { const ps = [...occ[k]].sort((x, y) => x - y); for (let p = ps[0]; p <= ps[ps.length - 1]; p++) if (!occ[k].has(p)) gaps++; }
  process.send({ seed: Number(process.env.AB_SEED), lns: process.env.AB_LNS === "1", placed: res.stats.placed, unplaced: res.stats.unplaced, gaps });
  process.exit(0);
}

const timeSec = Number(arg("--time-sec", "90"));
const seeds = arg("--seeds", "42,7961,15880,23799").split(",").map(Number);
const jobs = [], results = [];
for (const seed of seeds) for (const lns of [1, 0]) {
  const child = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, AB_CHILD: "1", AB_SEED: String(seed), AB_TIME: String(timeSec), AB_LNS: String(lns) } });
  child.on("message", (m) => results.push(m));
  jobs.push(new Promise((r) => child.on("exit", r)));
}
await Promise.all(jobs);
results.sort((a, b) => a.seed - b.seed || b.lns - a.lns);
console.log("seed     LNS  placed  unplaced  gaps");
for (const r of results) console.log(`${String(r.seed).padEnd(8)} ${(r.lns ? "ON " : "OFF").padEnd(4)} ${String(r.placed).padEnd(7)} ${String(r.unplaced).padEnd(9)} ${r.gaps}`);
for (const lns of [true, false]) {
  const rs = results.filter(r => r.lns === lns);
  const best = Math.max(...rs.map(r => r.placed));
  const avg = (rs.reduce((s, r) => s + r.placed, 0) / rs.length).toFixed(1);
  const avgGap = (rs.reduce((s, r) => s + r.gaps, 0) / rs.length).toFixed(1);
  console.log(`LNS=${lns ? "ON " : "OFF"}: best=${best} avg=${avg} avgGaps=${avgGap}`);
}
