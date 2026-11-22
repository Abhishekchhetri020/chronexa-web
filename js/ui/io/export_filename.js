// Shared local-date + school-name filename helpers for all Chronexa exporters.
export function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function schoolSlug(school) {
  const raw = (school && school.schoolName || "").trim();
  const isPh = !raw || /^(classic timetable|asc timetables|untitled|\(school\))/i.test(raw);
  const name = isPh ? (school && school._isDemo ? "Sample-school" : "Chronexa-timetable") : raw;
  return name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "Chronexa-timetable";
}
