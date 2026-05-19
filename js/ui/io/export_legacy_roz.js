/* Classic Timetable .roz binary exporter — PARTIAL.
 *
 * The .roz format is Classic's proprietary binary container.  Full fidelity
 * requires the closed-source Classic writer.  This module emits a syntactically
 * valid header so the file opens in Classic without an immediate parser error,
 * then writes a UTF-8 "FORMAT LIMITED" payload reminding the user to fall
 * back to Timetable XML for round-trip work.
 *
 * Header layout (16 bytes, little-endian):
 *   off  0   4  magic            = "aScR"            (0x61 0x53 0x63 0x52)
 *   off  4   2  format version   = 0x0001
 *   off  6   2  flags            = 0x0000
 *   off  8   4  payload length   = N (uint32 LE)
 *   off 12   4  checksum (xor)   = 0x00000000        (stub)
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  function buildHeader(payloadLen) {
    const h = new Uint8Array(16);
    h[0] = 0x61; h[1] = 0x53; h[2] = 0x63; h[3] = 0x52;   // "aScR"
    h[4] = 0x01; h[5] = 0x00;                              // version 1
    h[6] = 0x00; h[7] = 0x00;                              // flags
    const dv = new DataView(h.buffer);
    dv.setUint32(8, payloadLen, true);                     // payload length
    dv.setUint32(12, 0, true);                             // checksum stub
    return h;
  }

  function buildPayload(school) {
    const lines = [
      "CHRONEXA-ROZ-STUB v1",
      "FORMAT LIMITED — full .roz round-trip is unsupported.",
      "Use 'Export Timetable XML' for full fidelity.",
      "",
      "school:    " + (school.schoolName || ""),
      "teachers:  " + (school.teachers   || []).length,
      "classes:   " + (school.classes    || []).length,
      "subjects:  " + (school.subjects   || []).length,
      "rooms:     " + (school.classrooms || []).length,
      "lessons:   " + (school.lessons    || []).length,
      "cards:     " + (school.cards      || []).length,
      "",
      "Generated: " + new Date().toISOString(),
    ];
    return new TextEncoder().encode(lines.join("\n") + "\n");
  }

  function download(bytes, fname) {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function run(school) {
    school = school || APP.school;
    if (!school) { notify("Open a timetable first.", "error"); return; }
    const payload = buildPayload(school);
    const header  = buildHeader(payload.length);
    const out     = new Uint8Array(header.length + payload.length);
    out.set(header, 0);
    out.set(payload, header.length);
    const base = (school._meta?.sourceFilename || school.schoolName || "chronexa").replace(/\.\w+$/, "");
    download(out, base + "-stub.roz");
    notify("ROZ binary export is partial — use 'Timetable XML' for full fidelity", "warn");
  }

  window.ExportAscRoz = { run, buildHeader, buildPayload };
  window.addEventListener("app:export-legacy-roz", () => run());
})();
