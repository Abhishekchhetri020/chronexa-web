// Time-off in the grid — aSc draws an × in every period the row's class,
// teacher or room is unavailable, so the free space is visible before a card
// is picked up. Chronexa only showed it during placement (availability
// shading). Called by Editor.render after each rebuild.
//
// timeOff comes in two shapes (see dialog_shell.buildTimeOffMini):
//   2D array [day][period0] = 0|1|2, or { "day_period1": "unavailable"|"preferred"|... }.

const LIST = { class: "classes", teacher: "teachers", room: "classrooms" };

export function offState(timeOff, day, period1) {
  if (!timeOff) return 0;
  if (Array.isArray(timeOff)) return (timeOff[day] && timeOff[day][period1 - 1]) | 0;
  const v = timeOff[`${day}_${period1}`];
  if (v === "unavailable" || v === "blocked" || v === 2) return 2;
  if (v === "conditional" || v === "preferred" || v === 1) return 1;
  return 0;
}

export function markTimeOff(rootEl, school, perspective) {
  const list = LIST[perspective] && school[LIST[perspective]];
  if (!rootEl || !list) return 0;
  const byId = new Map(list.filter((e) => e.timeOff).map((e) => [e.id, e.timeOff]));
  if (!byId.size) return 0;
  let n = 0;
  for (const slot of rootEl.querySelectorAll(".chrx-slot[data-row]")) {
    const off = byId.get(slot.getAttribute("data-row"));
    if (!off) continue;
    const st = offState(off, slot.getAttribute("data-day") | 0, slot.getAttribute("data-period") | 0);
    if (!st) continue;
    slot.setAttribute("data-timeoff", st === 2 ? "off" : "conditional");
    n++;
  }
  return n;
}

window.TimeOffMarks = { markTimeOff, offState };
