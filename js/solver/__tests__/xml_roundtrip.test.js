// Regression tests for the asctt2012 import/export fidelity bugs
// (2026-07-16, "asctt2012 (2).xml" report):
//
//   X1  Classes whose name contains "Floor" were silently dropped on import
//       (SKIP_CLASS_PATTERNS hack), cascading into dropping every lesson that
//       only references them (59 Floor-Duty lessons / 192 placed cards in the
//       reporting file) — which also removed the de-facto teacher-duty
//       occupancy, so the solver double-booked duty teachers.
//   X2  Lessons did not retain daysdefid/weeksdefid/termsdefid, so the XML
//       export rewrote them as synthetic ids (DAY_ANY/WEEK_ALL/TERM_YR) that
//       don't exist in the file's <daysdefs>/<weeksdefs>/<termsdefs> blocks —
//       dangling references that break re-import into the source application.
//   X3  daysdefs/weeksdefs/termsdefs were not parsed at all, so a synthesized
//       export could not reproduce them.
//   X4  Teacher color/contact/name-part attributes were dropped on import and
//       blanked by the export's teachers block.

import { describe, it, expect } from "vitest";
import "../../xml/parse_timetable_xml.js";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<timetable importtype="database" options="idprefix:CHRONEXA" displayname="Fixture">
  <periods options="canadd,export:silent" columns="period,name,short,starttime,endtime">
    <period name="1st" short="1st" period="1" starttime="8:00" endtime="8:40"/>
    <period name="2nd" short="2nd" period="2" starttime="8:40" endtime="9:20"/>
  </periods>
  <daysdefs options="canadd,export:silent" columns="id,days,name,short">
    <daysdef id="DDMON" name="Monday" short="Mo" days="100000"/>
    <daysdef id="DDANY" name="Any day" short="X" days="100000,010000,001000,000100,000010,000001"/>
  </daysdefs>
  <weeksdefs options="canadd,export:silent" columns="id,weeks,name,short">
    <weeksdef id="WDALL" name="All weeks" short="All" weeks="1"/>
  </weeksdefs>
  <termsdefs options="canadd,export:silent" columns="id,terms,name,short">
    <termsdef id="TDYR" name="Whole year" short="YR" terms="1"/>
  </termsdefs>
  <subjects options="canadd,export:silent" columns="id,name,short,partner_id">
    <subject id="SMATH" name="Math" short="MA" partner_id=""/>
    <subject id="SDUTY" name="Floor Duty" short="FD" partner_id=""/>
  </subjects>
  <teachers options="canadd,export:silent" columns="id,name,short,gender,color,email,mobile,partner_id,firstname,lastname">
    <teacher id="T1" name="Mr. A" short="A" gender="M" color="#FF0000" email="a@x.com" mobile="123" partner_id="" firstname="Mr." lastname="A"/>
  </teachers>
  <classrooms options="canadd,export:silent" columns="id,name,short,capacity,buildingid,partner_id">
    <classroom id="R1" name="Room 1" short="R1" capacity="*" buildingid="" partner_id=""/>
  </classrooms>
  <classes options="canadd,export:silent" columns="id,name,short,classroomids,teacherid,grade,partner_id">
    <class id="C1" name="I A" short="I A" teacherid="T1" classroomids="" grade="" partner_id=""/>
    <class id="CF1" name="1st Floor" short="1st Floor" teacherid="" classroomids="" grade="" partner_id=""/>
  </classes>
  <groups options="canadd,export:silent" columns="id,classid,name,entireclass,divisiontag,studentcount,studentids">
    <group id="G1" classid="C1" name="Entire class" entireclass="1" divisiontag="0" studentcount="" studentids=""/>
    <group id="GF1" classid="CF1" name="Entire class" entireclass="1" divisiontag="0" studentcount="" studentids=""/>
  </groups>
  <lessons options="canadd,export:silent" columns="id,subjectid,classids,groupids,teacherids,classroomids,periodspercard,periodsperweek,daysdefid,weeksdefid,termsdefid,seminargroup,capacity,partner_id">
    <lesson id="L1" classids="C1" subjectid="SMATH" periodspercard="1" periodsperweek="2.0" teacherids="T1" classroomids="R1" groupids="G1" seminargroup="" termsdefid="TDYR" weeksdefid="WDALL" daysdefid="DDMON" capacity="*" partner_id=""/>
    <lesson id="LDUTY" classids="CF1" subjectid="SDUTY" periodspercard="1" periodsperweek="1.0" teacherids="T1" classroomids="" groupids="GF1" seminargroup="" termsdefid="TDYR" weeksdefid="WDALL" daysdefid="DDANY" capacity="*" partner_id=""/>
  </lessons>
  <cards options="canadd,export:silent" columns="lessonid,period,days,weeks,terms,classroomids">
    <card lessonid="L1" classroomids="R1" period="1" weeks="1" terms="1" days="100000"/>
    <card lessonid="LDUTY" classroomids="" period="2" weeks="1" terms="1" days="100000"/>
  </cards>
</timetable>
`;

function parse() {
  return window.parseTimetableXml.parseText(FIXTURE, "fixture.xml");
}

describe("X1 floor pseudo-classes survive import", () => {
  it("keeps classes whose name contains 'Floor'", () => {
    const school = parse();
    expect(school.classes.map(c => c.name)).toContain("1st Floor");
  });

  it("keeps lessons and cards that only reference floor classes", () => {
    const school = parse();
    const duty = school.lessons.find(l => l.id === "LDUTY");
    expect(duty).toBeTruthy();
    expect(duty.classIds).toEqual(["CF1"]);
    expect(school.cards.some(c => c.lessonId === "LDUTY")).toBe(true);
  });
});

describe("X2 lessons retain their def ids for round-trip", () => {
  it("stores daysdefid/weeksdefid/termsdefid on the lesson", () => {
    const school = parse();
    const l1 = school.lessons.find(l => l.id === "L1");
    expect(l1.daysDefId).toBe("DDMON");
    expect(l1.weeksDefId).toBe("WDALL");
    expect(l1.termsDefId).toBe("TDYR");
  });
});

describe("X3 daysdefs/weeksdefs/termsdefs are parsed", () => {
  it("exposes the defs with their original ids and bits", () => {
    const school = parse();
    expect(school.daysDefs.map(d => d.id)).toEqual(["DDMON", "DDANY"]);
    expect(school.daysDefs[0].bits).toBe("100000");
    expect(school.weeksDefs[0]).toMatchObject({ id: "WDALL", bits: "1" });
    expect(school.termsDefs[0]).toMatchObject({ id: "TDYR", bits: "1" });
  });
});

describe("X4 teacher attributes survive import", () => {
  it("keeps color, contact and name parts", () => {
    const school = parse();
    const t = school.teachers.find(x => x.id === "T1");
    expect(t.color).toBe("#FF0000");
    expect(t.email).toBe("a@x.com");
    expect(t.mobile).toBe("123");
    expect(t.gender).toBe("M");
    expect(t.firstName).toBe("Mr.");
    expect(t.lastName).toBe("A");
  });
});
