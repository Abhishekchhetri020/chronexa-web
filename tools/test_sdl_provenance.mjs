// Phase 2.3 regression — audit finding #7
// subjectDailyLimit explicit values (numeric cap, "i"/"*" unlimited sentinel)
// must survive auto-tighten. The auto step previously overwrote explicit caps
// with ceil(totalPeriods/days), silently changing user intent.
//
// Strategy:
//   A) 5-period day, subject with 5 sessions, AUTO limit=default(2)
//      → solver places at most 2 (default binds).
//   B) same school + explicit "i" for the (class, subject) pair
//      → auto-tighten must NOT clobber it → solver places all 5.
//   C) same school + explicit numeric cap of 3
//      → solver places exactly 3 (not the default 2, not auto's 5).
//
// Run: node tools/test_sdl_provenance.mjs

import { solve } from "../js/solver/csp_solver.js";

const base = {
  schoolName: "sdl-provenance",
  daysPerWeek: 1,
  periodsPerDay: 5,
  bell: { periods: [1,2,3,4,5].map(i => ({ index: i, name: `P${i}`, short: `${i}`, isTeaching: true })) },
  bells: [],
  teachers:  [ { id: "t" } ],
  classes:   [ { id: "c" } ],
  classrooms:[ { id: "r" } ],
  subjects:  [ { id: "sS" } ],
  lessons: [
    { id: "L1", subjectId: "sS", periodsPerWeek: 5, periodsPerDay: 5, classIds: ["c"], teacherIds: ["t"], preferredRoomId: "r" },
  ],
  relations: [], cards: [], settings: {},
};

// NOTE: periodsPerDay on the lesson must reflect the 5-card split so the
// solver is allowed to stack five cards on the same day (some guards use the
// lesson's periodsPerDay as a per-day ceiling regardless of subjectDailyLimit).
// With periodsPerDay=5 and one day, the only constraint left is subjectDailyLimit.

// A — auto only (default=2). Expect ≤ 2 placed.
const a  = solve(base, { timeLimitSec: 3 });

// B — explicit unlimited. Expect all 5 placed if (and only if) our
// provenance fix preserves the "i" sentinel through auto-tighten.
const b  = solve({ ...base, subjectDailyLimit: { c: { sS: "i" } } },
                 { timeLimitSec: 3 });

// C — explicit numeric cap = 3. Expect exactly 3 placed.
const c  = solve({ ...base, subjectDailyLimit: { c: { sS: 3 } } },
                 { timeLimitSec: 3 });

console.log(`A auto    → placed=${a.stats.placed}/${a.stats.placed + a.stats.unplaced}`);
console.log(`B "i"     → placed=${b.stats.placed}/${b.stats.placed + b.stats.unplaced}`);
console.log(`C cap=3   → placed=${c.stats.placed}/${c.stats.placed + c.stats.unplaced}`);

const okA = a.stats.placed <= 2;
const okB = b.stats.placed === 5;
const okC = c.stats.placed === 3;

if (okA && okB && okC) {
  console.log("PASS: explicit SDL overrides survive auto-tighten.");
  process.exit(0);
}
console.log(`FAIL: auto≤2=${okA}  unlimited→5=${okB}  cap=3=${okC}`);
process.exit(1);
