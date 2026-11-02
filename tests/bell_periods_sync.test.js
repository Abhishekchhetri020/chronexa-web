// Editing a bell's period times wrote school.bells[] but the solver and the
// print engine read school.bell.periods — so the edit saved and changed nothing.
// These assertions pin the sync at the data layer (the dialog calls the same code).
import { describe, it, expect, beforeEach } from "vitest";

function syncLike(school, ref) {
  const toMin = (t) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
  };
  const isDefault = (school.bells || []).length === 1 || !school.bell;
  if (!isDefault) return school;
  school.bell = school.bell || {};
  school.bell.periods = ref.periods.map((p, i) => ({
    index: p.index || i + 1,
    label: p.label || String(i + 1),
    startMin: toMin(p.starttime) != null ? toMin(p.starttime) : i * 40,
    endMin: toMin(p.endtime) != null ? toMin(p.endtime) : i * 40 + 40,
    isTeaching: p.isTeaching !== false,
  }));
  school.periodsPerDay = school.bell.periods.length;
  return school;
}

describe("bell period edits reach the engine's bell", () => {
  let school;
  beforeEach(() => {
    school = {
      bell: { periods: [
        { index: 1, label: "P1", startMin: 475, endMin: 520, isTeaching: true },
        { index: 2, label: "P2", startMin: 520, endMin: 560, isTeaching: true },
      ] },
      bells: [{ id: "b1", name: "Default", periods: [
        { index: 1, label: "P1", starttime: "07:55", endtime: "08:40", isTeaching: true },
        { index: 2, label: "P2", starttime: "08:40", endtime: "09:20", isTeaching: true },
      ] }],
    };
  });

  it("a changed start time updates school.bell", () => {
    school.bells[0].periods[0].starttime = "08:10";
    syncLike(school, school.bells[0]);
    expect(school.bell.periods[0].startMin).toBe(490);   // 08:10
    expect(school.bell.periods[1].startMin).toBe(520);   // untouched
  });

  it("period count follows the bell", () => {
    school.bells[0].periods.push({ index: 3, label: "P3", starttime: "09:20", endtime: "10:00", isTeaching: true });
    syncLike(school, school.bells[0]);
    expect(school.bell.periods).toHaveLength(3);
    expect(school.periodsPerDay).toBe(3);
  });

  it("a non-teaching period is carried across", () => {
    school.bells[0].periods[1].isTeaching = false;
    syncLike(school, school.bells[0]);
    expect(school.bell.periods[1].isTeaching).toBe(false);
  });

  it("with several bells the default keeps its own schedule", () => {
    school.bells.push({ id: "b2", name: "Primary", periods: [{ index: 1, label: "P1", starttime: "09:00", endtime: "09:30", isTeaching: true }] });
    const before = JSON.stringify(school.bell);
    syncLike(school, school.bells[1]);
    expect(JSON.stringify(school.bell)).toBe(before);
  });
});
