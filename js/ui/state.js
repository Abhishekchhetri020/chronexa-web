/**
 * Global app state — single shared object so other modules don't have to import.
 *
 *   APP.lang      : "en" | "hi"
 *   APP.step      : 1..5
 *   APP.school    : SchoolData | null   (output of parseAscXml)
 *   APP.filter    : string               (search bar text, lowercased)
 *   APP.day       : 0..5                 (mobile single-day picker)
 *   APP.dirty     : Set<string>          (which views need re-render)
 *
 * Modules read/write APP directly. main.js owns navigation + listeners.
 */
window.APP = window.APP || {
  lang: "en",
  step: 1,
  school: null,
  filter: "",
  day: 0,                 // Monday default
  dirty: new Set(),
};
