// Shared fixture: parse sample-school.xml (946 cards, the repo's canonical
// benchmark school) through the real XML parser. Requires the jsdom test
// environment (DOMParser). The parser is a window-global module.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import "../../../xml/parse_timetable_xml.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

let _school = null;
export function loadSampleSchool() {
  if (_school) return _school;
  const xml = fs.readFileSync(path.join(repoRoot, "sample-school.xml"), "utf8");
  _school = window.parseTimetableXml.parseText(xml, "sample-school.xml");
  return _school;
}
