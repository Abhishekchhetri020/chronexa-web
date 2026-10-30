// aSc per-entity <constraints> must survive XML import. The school's own export
// omits the block (it lives in the online document), but aSc database/desktop
// exports carry it and Chronexa must not drop it silently on save.
import { describe, it, expect } from "vitest";
import "../../xml/parse_timetable_xml.js";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<timetable importtype="database" displayname="Constraints fixture">
  <periods columns="period,name,short">
    <period name="1st" short="1st" period="1"/>
    <period name="2nd" short="2nd" period="2"/>
  </periods>
  <daysdefs columns="id,days,name,short">
    <daysdef id="DDMON" name="Monday" short="Mo" days="100000"/>
  </daysdefs>
  <weeksdefs columns="id,weeks,name,short"><weeksdef id="WDALL" name="All" short="All" weeks="1"/></weeksdefs>
  <termsdefs columns="id,terms,name,short"><termsdef id="TDYR" name="Year" short="YR" terms="1"/></termsdefs>
  <subjects columns="id,name,short">
    <subject id="SGAM" name="Games" short="GA">
      <constraints maxParallel="2" minParallel="2">
        <cardDistribution>ideal</cardDistribution>
      </constraints>
    </subject>
    <subject id="SMATH" name="Maths" short="MA"/>
  </subjects>
  <teachers columns="id,name,short">
    <teacher id="T1" name="Ms. Rao" short="RAO">
      <constraints maxgapsday="1" maxgapsweek="4" maxconsecutiveperiods="3" maxdaysweek="5">
        <lessonsPerDayMin>3</lessonsPerDayMin>
        <lessonsPerDayMax>6</lessonsPerDayMax>
      </constraints>
    </teacher>
    <teacher id="T2" name="Mr. Das" short="DAS"/>
  </teachers>
  <classrooms columns="id,name,short">
    <classroom id="RG" name="Ground" short="GR" capacity="60">
      <constraints maxCardsPos="2"/>
    </classroom>
  </classrooms>
  <classes columns="id,name,short,teacherid">
    <class id="CA" name="IX A" short="IXA" teacherid="T1">
      <constraints minperiodsday="3" maxperiodsday="6" lunch_periodfrom="4" lunch_periodto="5">
        <classteacherpos>[[["1"]]]</classteacherpos>
      </constraints>
    </class>
    <class id="CB" name="IX B" short="IXB"/>
  </classes>
  <lessons columns="id,subjectid,teacherids,classids,count">
    <lesson id="L1" subjectid="SGAM" teacherids="T1" classids="CA" count="2"/>
  </lessons>
  <cards columns="lessonid,period,days,weeks">
    <card lessonid="L1" period="1" days="100000" weeks="1"/>
  </cards>
</timetable>`;

function parse() {
  return window.parseTimetableXml.parseText(FIXTURE, "fixture.xml");
}

describe("XML import keeps per-entity constraints", () => {
  it("reads teacher limits by aSc key name", () => {
    const school = parse();
    const t = school.teachers.find((x) => x.id === "T1");
    expect(t.constraints.maxgapsday).toBe(1);
    expect(t.constraints.maxgapsweek).toBe(4);
    expect(t.constraints.maxconsecutiveperiods).toBe(3);
    expect(t.constraints.maxdaysweek).toBe(5);
    expect(t.constraints.lessonsPerDayMin).toBe(3);
    expect(t.constraints.lessonsPerDayMax).toBe(6);
  });

  it("leaves constraint-less entities clean", () => {
    const school = parse();
    expect(school.teachers.find((x) => x.id === "T2").constraints).toBeUndefined();
    expect(school.classes.find((x) => x.id === "CB").constraints).toBeUndefined();
  });

  it("reads class limits, lunch window and the aliased homeroom mask", () => {
    const c = parse().classes.find((x) => x.id === "CA");
    expect(c.constraints.minperiodsday).toBe(3);
    expect(c.constraints.maxperiodsday).toBe(6);
    expect(c.constraints.lunch_periodfrom).toBe(4);
    // aSc spells it lowercase; Chronexa models it in camelCase.
    expect(c.constraints.classTeacherPos).toBe('[[["1"]]]');
    expect(c.constraints.classteacherpos).toBeUndefined();
  });

  it("reads subject and classroom constraints, attributes and children together", () => {
    const school = parse();
    const s = school.subjects.find((x) => x.id === "SGAM");
    expect(s.constraints.maxParallel).toBe(2);
    expect(s.constraints.minParallel).toBe(2);
    expect(s.constraints.cardDistribution).toBe("ideal");
    expect(school.subjects.find((x) => x.id === "SMATH").constraints).toBeUndefined();
    expect(school.classrooms.find((x) => x.id === "RG").constraints.maxCardsPos).toBe(2);
  });

  it("maps '*' and 'i' to the unlimited sentinel and keeps booleans boolean", () => {
    const xml = FIXTURE.replace('maxgapsday="1"', 'maxgapsday="*"')
      .replace("<lessonsPerDayMax>6</lessonsPerDayMax>", "<lessonsPerDayMax>i</lessonsPerDayMax>")
      .replace('<class id="CA" name="IX A" short="IXA" teacherid="T1">',
               '<class id="CA" name="IX A" short="IXA" teacherid="T1">');
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
  });
});
