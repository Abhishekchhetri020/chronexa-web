/* Round-trip Classic Timetable XML export.
 *
 * Strategy:
 *  1. If APP.school._meta.sourceText exists (set by import_timetable_xml.js), we use
 *     it as the template and surgically replace the <cards> block with the
 *     current APP.school.cards. This preserves field order, IDs, daysdefs.
 *  2. If no source text, we synthesize a minimal Classic-shaped XML from the
 *     canonical SchoolData. Less faithful, but always works.
 *
 * Cards round-trip: parser emits {lessonId, day, period, classroomId?}.
 * Each CLASSIC <card days="100000"> bit position maps to dayIdx 0..5
 *   (0=Mon, 1=Tue, …, 5=Sat — same as DATA_SHAPES.md).
 * One CLASSIC card with multi-bit days becomes N entries on parse; we collapse
 * back here only when we have the original card lines (preserve identity);
 * otherwise we emit one <card days="bbbbbb"/> per (day,period) pair.
 */
(function () {
  "use strict";
  const APP = window.APP;
  const notify = window._chrxNotify || console.log;

  const DAY_BITS = 6;

  function dayBits(dayIdx) {
    const bits = new Array(DAY_BITS).fill("0");
    if (dayIdx >= 0 && dayIdx < DAY_BITS) bits[dayIdx] = "1";
    return bits.join("");
  }

  function xmlEscape(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function renderCardsBlock(school) {
    const cards = school.cards || [];
    const lines = [];
    lines.push('  <cards options="canadd,export:silent" columns="lessonid,period,days,weeks,terms,classroomids">');
    for (const c of cards) {
      const lid = xmlEscape(c.lessonId);
      const period = String(c.period || 1);
      const days = dayBits(c.day);
      const rooms = c.classroomId ? xmlEscape(c.classroomId) : "";
      lines.push(`    <card lessonid="${lid}" classroomids="${rooms}" period="${period}" weeks="1" terms="1" days="${days}"/>`);
    }
    lines.push("  </cards>");
    return lines.join("\n");
  }

  // Per-entity block renderers — used both by exportSynthesized AND by
  // exportFromTemplate, so edits to teachers / classes / subjects /
  // classrooms / lessons survive XML round-trip. Before this, only the
  // <cards> block was replaced and entity edits in memory were silently
  // dropped on export.
  function renderSubjectsBlock(school) {
    const lines = [];
    lines.push('  <subjects options="canadd,export:silent" columns="id,name,short,partner_id">');
    for (const s of (school.subjects || []))
      lines.push(`    <subject id="${xmlEscape(s.id)}" name="${xmlEscape(s.name)}" short="${xmlEscape(s.abbr || s.short || s.name)}" partner_id=""/>`);
    lines.push("  </subjects>");
    return lines.join("\n");
  }
  function renderTeachersBlock(school) {
    const lines = [];
    lines.push('  <teachers options="canadd,export:silent" columns="id,name,short,gender,color,email,mobile,partner_id,firstname,lastname">');
    for (const t of (school.teachers || [])) {
      const color = t.color || "";
      const email = t.email || "";
      const mobile = t.mobile || "";
      lines.push(`    <teacher id="${xmlEscape(t.id)}" name="${xmlEscape(t.name || "")}" short="${xmlEscape(t.abbr || t.short || t.name || "")}" gender="" color="${xmlEscape(color)}" email="${xmlEscape(email)}" mobile="${xmlEscape(mobile)}" partner_id="" firstname="" lastname=""/>`);
    }
    lines.push("  </teachers>");
    return lines.join("\n");
  }
  function renderClassroomsBlock(school) {
    const lines = [];
    lines.push('  <classrooms options="canadd,export:silent" columns="id,name,short,capacity,buildingid,partner_id">');
    for (const r of (school.classrooms || []))
      lines.push(`    <classroom id="${xmlEscape(r.id)}" name="${xmlEscape(r.name || "")}" short="${xmlEscape(r.short || r.name || "")}" capacity="${r.capacity || "*"}" buildingid="" partner_id=""/>`);
    lines.push("  </classrooms>");
    return lines.join("\n");
  }
  function renderClassesBlock(school) {
    const lines = [];
    lines.push('  <classes options="canadd,export:silent" columns="id,name,short,classroomids,teacherid,grade,partner_id">');
    for (const c of (school.classes || [])) {
      const teacherId = c._teacherId || c.teacherId || "";
      const rooms = (c._classroomIds || []).join(",") || "";
      lines.push(`    <class id="${xmlEscape(c.id)}" name="${xmlEscape(c.name || "")}" short="${xmlEscape(c.short || c.name || "")}" classroomids="${xmlEscape(rooms)}" teacherid="${xmlEscape(teacherId)}" grade="" partner_id=""/>`);
    }
    lines.push("  </classes>");
    return lines.join("\n");
  }
  function renderLessonsBlock(school) {
    const lines = [];
    lines.push('  <lessons options="canadd,export:silent" columns="id,subjectid,classids,groupids,teacherids,classroomids,periodspercard,periodsperweek,daysdefid,weeksdefid,termsdefid,seminargroup,capacity,partner_id">');
    for (const l of (school.lessons || [])) {
      const cls = (l.classIds || []).join(",");
      const tch = (l.teacherIds || []).join(",");
      const grp = (l.groupIds || []).join(",");
      const rooms = (l._lessonRoomIds && l._lessonRoomIds.length ? l._lessonRoomIds.join(",") : (l.preferredRoomId || ""));
      const ppc = l.isLabDouble ? 2 : 1;
      const daysDefId = l.daysDefId || "DAY_ANY";
      const weeksDefId = l.weeksDefId || "WEEK_ALL";
      const termsDefId = l.termsDefId || "TERM_YR";
      lines.push(`    <lesson id="${xmlEscape(l.id)}" classids="${cls}" subjectid="${xmlEscape(l.subjectId || "")}" periodspercard="${ppc}" periodsperweek="${l.periodsPerWeek || 0}" teacherids="${tch}" classroomids="${xmlEscape(rooms)}" groupids="${xmlEscape(grp)}" seminargroup="" termsdefid="${xmlEscape(termsDefId)}" weeksdefid="${xmlEscape(weeksDefId)}" daysdefid="${xmlEscape(daysDefId)}" capacity="*" partner_id=""/>`);
    }
    lines.push("  </lessons>");
    return lines.join("\n");
  }

  function replaceBlock(src, tag, fresh) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>|<${tag}\\b[^>]*/>`);
    if (!re.test(src)) {
      // No block to replace — insert before </timetable>.
      return src.replace(/<\/timetable>\s*$/, fresh + "\n</timetable>\n");
    }
    return src.replace(re, fresh);
  }

  function exportFromTemplate(school) {
    let src = school._meta.sourceText;
    // Replace all entity blocks AND cards with the in-memory state so
    // edits done after import survive the round-trip. Order doesn't
    // matter — each regex is anchored on its own tag.
    src = replaceBlock(src, "subjects",   renderSubjectsBlock(school));
    src = replaceBlock(src, "teachers",   renderTeachersBlock(school));
    src = replaceBlock(src, "classrooms", renderClassroomsBlock(school));
    src = replaceBlock(src, "classes",    renderClassesBlock(school));
    src = replaceBlock(src, "lessons",    renderLessonsBlock(school));
    src = replaceBlock(src, "cards",      renderCardsBlock(school));
    return src;
  }

  function exportSynthesized(school) {
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    out.push(`<timetable importtype="database" defaultexport="1" displayname="${xmlEscape(school.schoolName || "Chronexa Export")}" displaycountries="">`);

    // Periods
    out.push('  <periods options="canadd,export:silent" columns="period,name,short,starttime,endtime">');
    for (const p of (school.bell?.periods || [])) {
      const st = minToTime(p.startMin), en = minToTime(p.endMin);
      out.push(`    <period name="${xmlEscape(p.label)}" short="${xmlEscape(p.label)}" period="${p.index}" starttime="${st}" endtime="${en}"/>`);
    }
    out.push("  </periods>");
    out.push('  <breaks options="canadd,export:silent" columns="break,name,short,starttime,endtime"/>');

    // Daysdefs: prefer user-defined patterns (school.daysDefs), else emit 6 standard + 'Any day'.
    out.push('  <daysdefs options="canadd,export:silent" columns="id,days,name,short">');
    const userDaysDefs = (school.daysDefs && school.daysDefs.length) ? school.daysDefs : null;
    if (userDaysDefs) {
      for (const d of userDaysDefs) {
        out.push(`    <daysdef id="${xmlEscape(d.id)}" name="${xmlEscape(d.name || d.id)}" short="${xmlEscape(d.short || "")}" days="${xmlEscape(d.bits || "111111")}"/>`);
      }
    } else {
      const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
      DAYS.forEach((d, i) => {
        const bits = new Array(DAY_BITS).fill("0"); bits[i] = "1";
        out.push(`    <daysdef id="DAY_${i}" name="${d}" short="${d.slice(0,2)}" days="${bits.join("")}"/>`);
      });
      out.push(`    <daysdef id="DAY_ANY" name="Any day" short="X" days="100000,010000,001000,000100,000010,000001"/>`);
    }
    out.push("  </daysdefs>");

    const userWeeksDefs = (school.weeksDefs && school.weeksDefs.length) ? school.weeksDefs : null;
    out.push('  <weeksdefs options="canadd,export:silent" columns="id,weeks,name,short">');
    if (userWeeksDefs) {
      for (const w of userWeeksDefs)
        out.push(`    <weeksdef id="${xmlEscape(w.id)}" name="${xmlEscape(w.name || "")}" short="${xmlEscape(w.short || "")}" weeks="${xmlEscape(w.bits || "1")}"/>`);
    } else {
      out.push('    <weeksdef id="WEEK_ALL" name="All weeks" short="All" weeks="1"/>');
    }
    out.push("  </weeksdefs>");

    const userTermsDefs = (school.termsDefs && school.termsDefs.length) ? school.termsDefs : null;
    out.push('  <termsdefs options="canadd,export:silent" columns="id,terms,name,short">');
    if (userTermsDefs) {
      for (const t of userTermsDefs)
        out.push(`    <termsdef id="${xmlEscape(t.id)}" name="${xmlEscape(t.name || "")}" short="${xmlEscape(t.short || "")}" terms="${xmlEscape(t.bits || "1")}"/>`);
    } else {
      out.push('    <termsdef id="TERM_YR" name="Whole year" short="YR" terms="1"/>');
    }
    out.push("  </termsdefs>");

    // Subjects
    out.push('  <subjects options="canadd,export:silent" columns="id,name,short,partner_id">');
    for (const s of (school.subjects || []))
      out.push(`    <subject id="${xmlEscape(s.id)}" name="${xmlEscape(s.name)}" short="${xmlEscape(s.abbr || s.name)}" partner_id=""/>`);
    out.push("  </subjects>");

    // Teachers
    out.push('  <teachers options="canadd,export:silent" columns="id,name,short,gender,color,email,mobile,partner_id,firstname,lastname">');
    for (const t of (school.teachers || []))
      out.push(`    <teacher id="${xmlEscape(t.id)}" name="${xmlEscape(t.name)}" short="${xmlEscape(t.abbr || t.name)}" gender="" color="" email="" mobile="" partner_id="" firstname="" lastname=""/>`);
    out.push("  </teachers>");

    // Buildings (empty) + Classrooms
    out.push('  <buildings options="canadd,export:silent" columns="id,name,partner_id"/>');
    out.push('  <classrooms options="canadd,export:silent" columns="id,name,short,capacity,buildingid,partner_id">');
    for (const r of (school.classrooms || []))
      out.push(`    <classroom id="${xmlEscape(r.id)}" name="${xmlEscape(r.name)}" short="${xmlEscape(r.name)}" capacity="${r.capacity || "*"}" buildingid="" partner_id=""/>`);
    out.push("  </classrooms>");

    // Classes
    out.push('  <classes options="canadd,export:silent" columns="id,name,short,classroomids,teacherid,grade,partner_id">');
    for (const c of (school.classes || []))
      out.push(`    <class id="${xmlEscape(c.id)}" name="${xmlEscape(c.name)}" short="${xmlEscape(c.name)}" classroomids="" teacherid="" grade="" partner_id=""/>`);
    out.push("  </classes>");

    // Lessons
    out.push('  <lessons options="canadd,export:silent" columns="id,subjectid,classids,groupids,teacherids,classroomids,periodspercard,periodsperweek,daysdefid,weeksdefid,termsdefid,seminargroup,capacity,partner_id">');
    for (const l of (school.lessons || [])) {
      const cls = (l.classIds || []).join(",");
      const tch = (l.teacherIds || []).join(",");
      const rooms = l.preferredRoomId || "";
      const ppc = l.isLabDouble ? 2 : 1;
      const daysDefId = l.daysDefId || "DAY_ANY";
      const weeksDefId = l.weeksDefId || "WEEK_ALL";
      const termsDefId = l.termsDefId || "TERM_YR";
      out.push(`    <lesson id="${xmlEscape(l.id)}" classids="${cls}" subjectid="${xmlEscape(l.subjectId || "")}" periodspercard="${ppc}" periodsperweek="${l.periodsPerWeek || 0}" teacherids="${tch}" classroomids="${rooms}" groupids="" seminargroup="" termsdefid="${xmlEscape(termsDefId)}" weeksdefid="${xmlEscape(weeksDefId)}" daysdefid="${xmlEscape(daysDefId)}" capacity="*" partner_id=""/>`);
    }
    out.push("  </lessons>");

    out.push(renderCardsBlock(school));
    out.push("</timetable>");
    return out.join("\n") + "\n";
  }

  function minToTime(m) {
    if (!m && m !== 0) return "";
    const h = Math.floor(m / 60), mm = m % 60;
    return h + ":" + String(mm).padStart(2, "0");
  }

  function downloadBlob(text, filename) {
    const blob = new Blob([text], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function exportTimetableXml() {
    const school = APP.school;
    if (!school) { notify("Open a timetable first.", "error"); return; }
    let xml;
    if (school._meta?.sourceText) {
      xml = exportFromTemplate(school);
    } else {
      xml = exportSynthesized(school);
    }
    const base = (school._meta?.sourceFilename || school.schoolName || "chronexa").replace(/\.xml$/i, "");
    downloadBlob(xml, base + "-export.xml");
    notify("Exported " + base + "-export.xml");
  }

  window.addEventListener("app:export-timetable-xml", exportTimetableXml);
  APP.io = APP.io || {};
  APP.io.exportTimetableXml         = exportTimetableXml;
  APP.io.exportFromTemplate   = exportFromTemplate;
  APP.io.exportSynthesized    = exportSynthesized;
  APP.io.renderCardsBlock     = renderCardsBlock;
})();
