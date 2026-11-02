// One place that knows what a printed entity is called.
//
// The bug that prompted this: a class report printed "INFORMATION TECHNOLOGY"
// where the subject's short form is "I.T". The XML importer stores the aSc
// attribute as `abbr` (`short` for classes), while the print renderer looked for
// `abbreviation` / `shortName` — so every imported subject fell through to the
// full name. Two vocabularies for the same field, and the fallback silently made
// the wrong text look intentional.
//
// Rule: when a short form exists under ANY spelling we write or import, use it.
// Only when none exists does the printed label fall back to the full name.

/** Short forms in priority order, across every importer we support. */
export function entityShort(ent) {
  if (!ent) return "";
  return String(
    ent.abbreviation ||
    ent.abbr ||
    ent.shortName ||
    ent.short ||
    ent.code ||
    ent.shortname ||
    ""
  ).trim();
}

/** Full form. */
export function entityFull(ent) {
  if (!ent) return "";
  return String(ent.name || ent.fullName || ent.fullname || ent.id || "").trim();
}

/**
 * @param {object} ent        the entity row
 * @param {"abbreviation"|"full"|"both"|undefined} fmt
 */
export function entityLabel(ent, fmt) {
  if (!ent) return "";
  const short = entityShort(ent);
  const full = entityFull(ent);
  if (fmt === "full") return full || short;
  if (fmt === "both") return short && full && short !== full ? full + " (" + short + ")" : (full || short);
  // default: the short form, whatever it is spelled like
  return short || full;
}

export default { entityShort, entityFull, entityLabel };
