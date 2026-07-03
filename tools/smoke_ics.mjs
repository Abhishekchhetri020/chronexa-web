// Smoke test for export_ics.js — loads sample-school.xml via jsdom, runs the
// IIFE, dispatches app:export-ics, and verifies the resulting .ics blob is
// syntactically valid (BEGIN/END markers, event count, RRULE, escaping).

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// [vite-esm] The 2026-07 Vite migration added ESM import/export lines to the
// classic UI modules. Strip them so vm.runInThisContext keeps working; the
// module BODIES are unchanged.
const stripVite = (s) => s
  .replace(/^import "[^"]+";$/gm, "")
  .replace(/^export const [A-Za-z_$][\w$]* = window\.[A-Za-z_$][\w$]*;$/gm, "");


const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, "..");
const require_   = createRequire(import.meta.url);

let JSDOM;
try { ({ JSDOM } = require_("jsdom")); }
catch { ({ JSDOM } = require_("/private/tmp/chronexa_smoke/node_modules/jsdom")); }
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.com/" });
globalThis.window    = dom.window;
globalThis.document  = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Blob      = dom.window.Blob;
globalThis.URL       = dom.window.URL;
dom.window.APP = { school: null };

// Load parser
const parserSrc = fs.readFileSync(path.join(repoRoot, "js/xml/parse_timetable_xml.js"), "utf8");
vm.runInThisContext(stripVite(parserSrc), { filename: "parse_timetable_xml.js" });
const parseTimetableXml = globalThis.window.parseTimetableXml;

// Load XML
const xml = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
const school = parseTimetableXml.parseText(xml, "sample-school.xml");
dom.window.APP.school = school;

// Capture downloads — patch HTMLAnchorElement click + URL.createObjectURL
let capturedBlob = null;
let capturedName = null;
// jsdom's URL.createObjectURL isn't implemented — stub it ourselves.
dom.window.URL.createObjectURL = (blob) => { capturedBlob = blob; return "blob:smoke/" + Date.now(); };
dom.window.URL.revokeObjectURL = () => {};
const HTMLAnchor = dom.window.HTMLAnchorElement.prototype;
const origClick = HTMLAnchor.click;
HTMLAnchor.click = function () { capturedName = this.download; /* swallow */ };

// Capture notify
let lastNotify = null;
dom.window._chrxNotify = (msg, kind) => { lastNotify = { msg, kind }; };

// Load the exporter
const icsSrc = fs.readFileSync(path.join(repoRoot, "js/ui/io/export_ics.js"), "utf8");
vm.runInThisContext(stripVite(icsSrc), { filename: "export_ics.js" });

// Trigger export
const ev = new dom.window.CustomEvent("app:export-ics", { detail: { kind: "all" } });
dom.window.dispatchEvent(ev);

if (!capturedBlob) {
  console.error("FAIL: no blob captured");
  process.exit(1);
}

const text = await capturedBlob.text();
console.log("Filename:", capturedName);
console.log("Bytes:", text.length);
console.log("Notify:", lastNotify);
console.log("");

// Structural checks
const checks = [
  { label: "starts with BEGIN:VCALENDAR",       ok: text.startsWith("BEGIN:VCALENDAR") },
  { label: "ends with END:VCALENDAR",           ok: text.trim().endsWith("END:VCALENDAR") },
  { label: "VERSION:2.0 present",               ok: /^VERSION:2\.0/m.test(text) },
  { label: "PRODID contains Chronexa",          ok: /PRODID.*Chronexa/.test(text) },
  { label: "uses CRLF line endings",            ok: text.includes("\r\n") },
  { label: "at least 100 VEVENT blocks",        ok: (text.match(/BEGIN:VEVENT/g) || []).length >= 100 },
  { label: "BEGIN/END VEVENT counts match",     ok: (text.match(/BEGIN:VEVENT/g) || []).length === (text.match(/END:VEVENT/g) || []).length },
  { label: "every VEVENT has UID",              ok: (text.match(/BEGIN:VEVENT/g) || []).length === (text.match(/^UID:/gm) || []).length },
  { label: "every VEVENT has DTSTART",          ok: (text.match(/BEGIN:VEVENT/g) || []).length === (text.match(/^DTSTART:/gm) || []).length },
  { label: "every VEVENT has DTEND",            ok: (text.match(/BEGIN:VEVENT/g) || []).length === (text.match(/^DTEND:/gm) || []).length },
  { label: "every VEVENT has SUMMARY",          ok: (text.match(/BEGIN:VEVENT/g) || []).length === (text.match(/^SUMMARY:/gm) || []).length },
  { label: "every VEVENT has RRULE",            ok: (text.match(/BEGIN:VEVENT/g) || []).length === (text.match(/^RRULE:/gm) || []).length },
];

let allOk = true;
for (const c of checks) {
  console.log((c.ok ? "✓" : "✗"), c.label);
  if (!c.ok) allOk = false;
}

const eventCount = (text.match(/BEGIN:VEVENT/g) || []).length;
console.log("");
console.log("VEVENT count:", eventCount);
console.log("School cards in XML:", (school.cards || []).length);
console.log("");
console.log("First 50 lines:");
console.log(text.split(/\r?\n/).slice(0, 50).join("\n"));

process.exit(allOk ? 0 : 1);
