// Generate → solve → apply. The button used to open the pre-launch dialog with
// no onConfirm callback, so "Build best timetable" closed and changed nothing.
import { describe, it, expect, beforeEach } from "vitest";
import { runAndApply } from "../js/ui/solver_ui/run_and_apply.js";

function school() {
  return {
    lessons: [
      { id: "l1", periodsPerWeek: 2, subjectId: "s1", classIds: ["c1"], teacherIds: ["t1"] },
      { id: "l2", periodsPerWeek: 1, subjectId: "s2", classIds: ["c1"], teacherIds: ["t2"] },
    ],
    cards: [{ lessonId: "old", day: 0, period: 0 }],
  };
}

beforeEach(() => {
  window.APP = { mutate: (label, fn) => fn(window.APP.school) };
  window.CreateNew = { refreshIndex: () => {} };
});

describe("runAndApply", () => {
  it("clears the old cards, applies the assignment and refreshes the index", async () => {
    const s = school();
    window.APP.school = s;
    window.SolverUI = {
      run: () => ({
        subscribe: (cb) => setTimeout(() => cb({
          type: "done",
          result: { assignment: [
            { lessonId: "l1", day: 1, period: 2, classroomId: "r1" },
            { lessonId: "l2", day: 2, period: 3 },
          ] },
        }), 0),
      }),
    };
    const res = await runAndApply(s, { timeLimitSec: 5 });
    expect(res).toMatchObject({ placed: 2, total: 3, status: "ok" });
    expect(s.cards).toHaveLength(2);
    expect(s.cards[0]).toMatchObject({ lessonId: "l1", day: 1, period: 2, classroomId: "r1" });
  });

  it("keeps existing cards in improve mode", async () => {
    const s = school();
    window.APP.school = s;
    window.SolverUI = {
      run: (opts) => ({
        subscribe: (cb) => {
          // the improve run must NOT have had its cards cleared
          expect(opts.options.improveOnly).toBe(true);
          expect(s.cards).toHaveLength(1);
          setTimeout(() => cb({ type: "done", result: { assignment: [{ lessonId: "l1", day: 0, period: 5 }] } }), 0);
        },
      }),
    };
    await runAndApply(s, { mode: "improve", timeLimitSec: 5 });
    expect(s.cards).toHaveLength(1);
  });

  it("reports a missing solver instead of hanging", async () => {
    const s = school();
    window.SolverUI = undefined;
    const res = await runAndApply(s, { timeLimitSec: 5 });
    expect(res.status).toBe("solver unavailable");
  });

  it("reports an empty school rather than running", async () => {
    const res = await runAndApply({ lessons: [], cards: [] }, {});
    expect(res).toMatchObject({ placed: 0, total: 0, status: "no lessons" });
  });

  it("surfaces a solver error as a status, not an exception", async () => {
    const s = school();
    window.APP.school = s;
    window.SolverUI = { run: () => ({ subscribe: (cb) => setTimeout(() => cb({ type: "error", message: "boom" }), 0) }) };
    const res = await runAndApply(s, { timeLimitSec: 5 });
    expect(res.status).toBe("boom");
  });
});

describe("pre-launch default mode", () => {
  it("tiny schools default to Generate, big schools to Best", async () => {
    await import("../js/ui/solver_ui/prelaunch_dialog.js");
    const f = window.SolverUI.PreLaunch.suggestDefaultMode;
    expect(f(12)).toBe("generate");
    expect(f(120)).toBe("generate");
    expect(f(121)).toBe("best");
    expect(f(700)).toBe("best");
    expect(f(0)).toBe("best");
  });
});
