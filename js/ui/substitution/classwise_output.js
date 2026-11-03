// [vite-esm] imports auto-generated from the 2026-07 Vite migration.
import "../state.js";
import "./main.js";
import "./candidate_ranker.js";
import "./planner_model.js";

/**
 * Class-wise output — the day's substitution board.
 *
 * This is the screen ported from the school's standalone GDSSD Substitution
 * Planner, because that is where the real work happens: one row per absent
 * card, with a ranked pick, and every other way out of the slot one click away
 * (supervision by a co-teacher, cancel the period, move it, or merge two
 * classes into one supervised room).
 *
 * Score tiers (the colours the school already reads):
 *    ★★★ green  ≥100  same subject / co-teacher / on duty
 *    ★★  blue    ≥30   free and safe
 *    ★   yellow  <30   available, but the policy would rather not
 *    —   red     uncovered or cancelled
 */
(function () {
  "use strict";
  const APP = window.APP;
  const S = window.Substitution;
  if (!APP || !S) return;
  const el = S.el, esc = S.esc;
  const P = () => window.SmartPlanner;

  const STATUS_LABEL = {
    PENDING: "Not assigned",
    FILLED: "Substitute",
    SUPERVISED: "Supervision",
    CANCELLED: "Cancelled",
    RESCHEDULE: "Reschedule",
  };

  function tierClass(score) {
    if (score == null) return "is-tier-none";
    if (score >= 100) return "is-tier-3";
    if (score >= 30) return "is-tier-2";
    return "is-tier-1";
  }
  function tierStars(score) {
    if (score == null) return "—";
    if (score >= 100) return "★★★";
    if (score >= 30) return "★★";
    return "★";
  }

  /** The plan the board renders: APP.substitution, rebuilt from the document. */
  function currentPlan() {
    const state = APP.substitution || {};
    if (!state.slots || !state.slots.length) {
      const plan = S.loadPlan(APP.school, state.date);
      return plan;
    }
    state.assignments = S.projectAssignments(APP.school, state);
    return state;
  }

  function render(host, state, onRefresh) {
    host.innerHTML = "";
    const plan = currentPlan();
    const slots = plan.slots || [];

    if (!slots.length) {
      host.appendChild(el("div", { class: "chrx-sub-empty" },
        el("p", null, plan.absent && plan.absent.length ? "No periods to cover." : "No substitutions generated yet."),
        el("p", { class: "chrx-sub-hint" },
          plan.absent && plan.absent.length
            ? "The absent teachers have no lessons on that weekday."
            : "Go back to step 1, pick a date and add absent teachers."),
      ));
      return;
    }

    const refresh = () => {
      if (typeof onRefresh === "function") onRefresh();
      else render(host, state, onRefresh);
    };

    host.appendChild(banner(plan));
    host.appendChild(toolbar(plan, refresh));
    host.appendChild(board(plan, refresh));
    const gaps = gapsNote(plan);
    if (gaps) host.appendChild(gaps);
    const acting = actingCTSection(plan, refresh);
    if (acting) host.appendChild(acting);
  }

  function banner(plan) {
    const c = P().planCounts(plan);
    const s3 = plan.slots.filter((x) => P().isFilled(x) && x.status !== "SUPERVISED" && (x.smartScore || 0) >= 100).length;
    const s2 = plan.slots.filter((x) => P().isFilled(x) && x.status !== "SUPERVISED" && (x.smartScore || 0) >= 30 && (x.smartScore || 0) < 100).length;
    const s1 = plan.slots.filter((x) => P().isFilled(x) && x.status !== "SUPERVISED" && (x.smartScore || 0) < 30).length;
    return el("div", { class: "chrx-sub-banner" },
      el("b", null, `${c.total} slot${c.total === 1 ? "" : "s"} to cover`),
      el("span", { class: "chrx-sub-pill is-green" }, `★★★ ${s3}`),
      el("span", { class: "chrx-sub-pill is-blue" }, `★★  ${s2}`),
      el("span", { class: "chrx-sub-pill is-yellow" }, `★   ${s1}`),
      c.supervised ? el("span", { class: "chrx-sub-pill", style: "background:#e0f2fe;color:#0369a1;" }, `👁 Sup ${c.supervised}`) : null,
      c.cancelled ? el("span", { class: "chrx-sub-pill", style: "background:#fee2e2;color:#b91c1c;" }, `Cancelled ${c.cancelled}`) : null,
      el("span", { class: "chrx-sub-pill is-red" }, `— ${c.pending + c.reschedule}`),
    );
  }

  function toolbar(plan, refresh) {
    const anyPending = (plan.slots || []).some((s) => s.status === "PENDING");
    const smart = el("button", {
      class: "chrx-sub-btn chrx-sub-btn--primary",
      onclick: () => runSmartFill(plan, refresh),
      title: "Fill every slot the policy is willing to fill, then let you review it",
    }, "⚡ Smart auto-fill");
    smart.disabled = !anyPending;

    return el("div", { class: "chrx-sub-row chrx-sub-row--actions", style: "gap:8px;flex-wrap:wrap;margin:8px 0 10px" },
      smart,
      el("button", {
        class: "chrx-sub-btn",
        onclick: () => {
          S.persistPlan(APP.school, plan, "Save substitutions");
          refresh();
        },
        title: "Write this day's plan to the timetable (one undo step)",
      }, "💾 Save plan"),
      el("button", {
        class: "chrx-sub-btn",
        onclick: () => {
          for (const s of plan.slots) {
            if (s.status !== "PENDING") {
              s.status = "PENDING";
              s.type = "SUB";
              s.substituteTeacherId = null;
              s.substituteTeacher = "";
              delete s.smartScore;
              s.smartReason = "";
            }
          }
          APP.substitution.assignments = S.projectAssignments(APP.school, plan);
          S.persistPlan(APP.school, plan, "Clear substitutions");
          refresh();
        },
        title: "Clear every assignment for this day",
      }, "↺ Clear"),
    );
  }

  function board(plan, refresh) {
    const table = el("table", { class: "chrx-sub-table" },
      el("thead", null, el("tr", null,
        el("th", null, "Period"),
        el("th", null, "Class"),
        el("th", null, "Subject"),
        el("th", null, "Absent"),
        el("th", null, "Substitute / action"),
        el("th", null, "Score"),
      )),
    );
    const tbody = el("tbody");
    for (const slot of plan.slots) tbody.appendChild(slotRow(plan, slot, refresh));
    table.appendChild(tbody);
    return el("div", { class: "chrx-sub-tablewrap" }, table);
  }

  function slotRow(plan, slot, refresh) {
    const filled = P().isFilled(slot);
    const challenged = slot.status === "CANCELLED";
    const tier = challenged ? "is-tier-none" : tierClass(slot.smartScore);
    const tr = el("tr", { class: `chrx-sub-tr ${tier}` });

    tr.appendChild(el("td", null,
      `P${slot.period}`,
      slot.movedFrom != null ? el("div", { class: "chrx-sub-hint", style: "font-size:10px" }, `moved from P${slot.movedFrom}`) : null,
    ));
    tr.appendChild(el("td", null, slot.classSection || "—"));
    tr.appendChild(el("td", null, slot.subject || "—"));
    tr.appendChild(el("td", null, slot.absentTeacher || "—"));

    const cell = el("td", { class: "chrx-sub-subcell" });
    if (challenged) {
      cell.appendChild(el("span", { class: "chrx-sub-cancelled", style: "color:#b91c1c;font-weight:600" }, "— Cancelled (free period) —"));
    } else if (filled) {
      const supervision = slot.status === "SUPERVISED";
      cell.appendChild(el("span", null,
        el("span", { class: "chrx-sub-stars" }, supervision ? "👁" : tierStars(slot.smartScore)),
        " ",
        el("b", null, slot.substituteTeacher || slot.substituteTeacherId),
        slot.mergedWithKey ? el("span", { class: "chrx-sub-hint", style: "margin-left:6px" }, "🔗 merged") : null,
      ));
      if (slot.smartReason) {
        cell.appendChild(el("div", { class: "chrx-sub-reasons" }, slot.smartReason));
      }
    } else {
      cell.appendChild(el("button", {
        class: "chrx-sub-btn chrx-sub-btn--primary",
        onclick: () => openChooser(plan, slot, refresh),
      }, "Pick substitute ▾"));
    }

    // Secondary actions, always available (the planner's whole point is that a
    // coordinator can resolve a slot however the day actually went).
    const acts = el("div", { style: "display:flex;gap:6px;margin-top:6px;flex-wrap:wrap" });
    if (!challenged) {
      acts.appendChild(miniBtn("✎ pick", () => openChooser(plan, slot, refresh)));
      acts.appendChild(miniBtn("👁 supervise", () => openChooser(plan, slot, refresh, { supervision: true })));
    }
    acts.appendChild(miniBtn("⏱ move", () => moveDialog(plan, slot, refresh)));
    acts.appendChild(miniBtn("🔗 merge", () => mergeDialog(plan, slot, refresh)));
    if (challenged) acts.appendChild(miniBtn("↺ uncancel", () => {
      S.setCancelled(plan, slot.slotKey, false);
      S.persistPlan(APP.school, plan, "Un-cancel period");
      refresh();
    }));
    else acts.appendChild(miniBtn("✕ cancel", () => {
      S.setCancelled(plan, slot.slotKey, true);
      S.persistPlan(APP.school, plan, "Cancel period");
      refresh();
    }));
    if (filled) acts.appendChild(miniBtn("clear", () => {
      S.setSubstitute(plan, slot.slotKey, null);
      S.persistPlan(APP.school, plan, "Clear substitute");
      refresh();
    }));
    cell.appendChild(acts);

    tr.appendChild(cell);
    tr.appendChild(el("td", { class: "chrx-sub-score" },
      slot.status === "CANCELLED" ? "0" : (filled ? String(slot.smartScore != null ? slot.smartScore : "—") : "—")));
    return tr;
  }

  function miniBtn(label, onClick) {
    return el("button", {
      class: "chrx-sub-btn",
      style: "font-size:11px;padding:2px 8px",
      onclick: (e) => { e.stopPropagation(); onClick(); },
    }, label);
  }

  function gapsNote(plan) {
    const counts = P().planCounts(plan);
    if (!counts.open) return null;
    return el("p", { class: "chrx-sub-hint", style: "margin:8px 0 0" },
      `${counts.open} slot${counts.open === 1 ? "" : "s"} still open — each one needs a substitute, a supervision, a cancellation, or a move.`);
  }

  // ── Smart auto-fill: preview, then apply ────────────────────────────────

  function runSmartFill(plan, refresh) {
    const preview = S.planSmartFill(APP.school, plan);
    const covered = preview.assignments.reduce((n, a) => n + (a.members ? a.members.length : 1), 0);
    const gapSlots = preview.gaps.reduce((n, g) => n + (g.members ? g.members.length : 1), 0);

    const scrim = el("div", { class: "chrx-sub-sheet-scrim",
      onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const sheet = el("div", { class: "chrx-sub-sheet", style: "max-width:720px" });

    sheet.appendChild(el("header", { class: "chrx-sub-sheet__head" },
      el("h3", null, "Review Smart auto-fill"),
      el("button", { class: "chrx-sub-sheet__x", onclick: () => scrim.remove() }, "×"),
    ));

    sheet.appendChild(el("div", { style: "display:flex;gap:18px;padding:10px 16px;border-bottom:1px solid #e2e8f0" },
      stat(covered, "slots covered"),
      stat(gapSlots, "need review"),
      stat(preview.actingAssignments.length, "acting CTs"),
    ));

    const list = el("div", { style: "max-height:46vh;overflow:auto;padding:6px 16px" });
    for (const a of preview.assignments) {
      const first = (a.members && a.members[0]) || a;
      const why = (a.candidate.why || []).join(" · ");
      const warn = (a.candidate.warnings || []).join(" · ");
      list.appendChild(el("div", { style: "padding:7px 0;border-bottom:1px solid #f1f5f9" },
        el("b", null, `P${first.period} · ${(a.members || []).map((m) => `${m.classSection} ${m.subject}`).join(" + ")}`),
        " → ",
        el("b", { style: "color:#047857" }, String(a.candidate.teacher)),
        el("span", { style: "color:#059669;font-weight:700" }, ` (${a.candidate.score})`),
        el("div", { style: "font-size:11.5px;color:#64748b" }, why || "best eligible workload balance"),
        warn ? el("div", { style: "font-size:11px;color:#b45309" }, `Fairness: ${warn}`) : null,
      ));
    }
    for (const a of preview.actingAssignments) {
      list.appendChild(el("div", { style: "padding:7px 0;border-bottom:1px solid #f1f5f9" },
        el("b", null, `Acting CT · ${a.classId}`), " → ", el("b", { style: "color:#047857" }, String(a.candidate.teacher)),
        el("div", { style: "font-size:11.5px;color:#64748b" }, "teaches this class today; workload used as tie-break"),
      ));
    }
    for (const g of preview.gaps) {
      const first = (g.members && g.members[0]) || {};
      list.appendChild(el("div", { style: "padding:7px 0;border-bottom:1px solid #f1f5f9" },
        el("b", null, `P${first.period} · ${(g.members || []).map((m) => `${m.classSection} ${m.subject}`).join(" + ")}`),
        el("div", { style: "font-size:11.5px;color:#b45309" }, `Left open: ${g.reason}`),
      ));
    }
    sheet.appendChild(list);

    const foot = el("div", { style: "display:flex;gap:8px;justify-content:flex-end;padding:12px 16px" });
    foot.appendChild(el("button", { class: "chrx-sub-btn", onclick: () => scrim.remove() }, "Cancel"));
    const apply = el("button", {
      class: "chrx-sub-btn chrx-sub-btn--primary",
      onclick: () => {
        S.applySmartFill(APP.school, plan, preview);
        scrim.remove();
        refresh();
      },
    }, `Apply ${covered} slot${covered === 1 ? "" : "s"}`);
    apply.disabled = covered === 0;
    foot.appendChild(apply);
    sheet.appendChild(foot);
    sheet.appendChild(el("p", { style: "font-size:11px;color:#64748b;margin:0 16px 12px" },
      "Existing manual assignments stay locked. Early-years class teachers are never picked automatically. Undo with ⌘Z."));

    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  function stat(value, label) {
    return el("div", { style: "text-align:center" },
      el("div", { style: "font-size:20px;font-weight:700;color:#0041a3" }, String(value)),
      el("div", { style: "font-size:11px;color:#64748b" }, label),
    );
  }

  // ── the chooser (pick substitute / supervision) ─────────────────────────

  function openChooser(plan, slot, refresh, opts = {}) {
    let supervision = !!opts.supervision;
    const scrim = el("div", { class: "chrx-sub-sheet-scrim",
      onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const sheet = el("div", { class: "chrx-sub-sheet" });

    const head = el("header", { class: "chrx-sub-sheet__head" },
      el("h3", null, `${slot.classSection} P${slot.period} · ${slot.subject}`),
      el("button", { class: "chrx-sub-sheet__x", onclick: () => scrim.remove() }, "×"),
    );
    sheet.appendChild(head);

    const modes = el("div", { style: "display:flex;gap:6px;padding:8px 16px" });
    const mkMode = (label, sup) =>
      el("button", {
        class: `chrx-sub-btn ${supervision === sup ? "chrx-sub-btn--primary" : ""}`,
        onclick: () => { supervision = sup; paint(); },
      }, label);
    const tabSub = mkMode("Substitute", false);
    const tabSup = mkMode("Supervision (study hall)", true);
    modes.appendChild(tabSub);
    modes.appendChild(tabSup);
    sheet.appendChild(modes);

    const list = el("div", { class: "chrx-sub-cand-list", style: "max-height:50vh;overflow:auto" });
    sheet.appendChild(list);
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);

    function paint() {
      tabSub.className = `chrx-sub-btn ${!supervision ? "chrx-sub-btn--primary" : ""}`;
      tabSup.className = `chrx-sub-btn ${supervision ? "chrx-sub-btn--primary" : ""}`;
      list.innerHTML = "";

      const cands = window.SubstitutionRanker.rankSlot(APP.school, plan, slot) || [];
      const eligible = cands.filter((c) => supervision ? true : c.score >= 0);

      if (!eligible.length) {
        list.appendChild(el("div", { class: "chrx-sub-empty", style: "padding:16px" },
          el("p", null, "No free teacher for this period."),
          el("p", { class: "chrx-sub-hint" }, "Merge the class with another, move the period, or cancel it."),
        ));
        return;
      }

      for (const c of eligible.slice(0, 40)) {
        const isChosen = slot.substituteTeacherId === c.teacherId;
        const badges = [];
        if (c.isOnDuty) badges.push("🛡 duty");
        if (c.isCoTeacher) badges.push(`👥 co-teacher${c.coSubject ? " · " + c.coSubject : ""}`);
        if (c.isCT) badges.push("CT");
        if (c.alreadyInSlot) badges.push(`🔄 in ${c.alreadyInSlot.classSection}`);
        if (c.today) badges.push(`today · ${c.today}`);
        if (c.week) badges.push(`week · ${c.week}`);

        list.appendChild(el("button", {
          class: `chrx-sub-cand ${tierClass(c.score)} ${isChosen ? "is-chosen" : ""}`,
          onclick: () => {
            S.setSubstitute(plan, slot.slotKey, c.teacherId, {
              supervision,
              score: c.score,
              reason: (c.why || []).slice(0, 3).join(" · ") || "best eligible workload balance",
            });
            S.persistPlan(APP.school, plan, supervision ? "Assign supervision" : "Assign substitute");
            scrim.remove();
            refresh();
          },
        },
          el("span", { class: "chrx-sub-cand__stars" }, tierStars(c.score)),
          el("span", { class: "chrx-sub-cand__nm" }, String(c.teacher)),
          el("span", { class: "chrx-sub-cand__score" }, String(c.score)),
          c.why && c.why.length ? el("div", { class: "chrx-sub-cand__why" }, c.why.join(" · ")) : null,
          badges.length ? el("div", { class: "chrx-sub-hint", style: "font-size:10.5px" }, badges.join(" · ")) : null,
          c.warnings && c.warnings.length
            ? el("div", { style: "font-size:10.5px;color:#b45309" }, `Fairness: ${c.warnings.join(" · ")}`)
            : null,
        ));
      }
    }
    paint();
  }

  // ── move a period ───────────────────────────────────────────────────────

  function moveDialog(plan, slot, refresh) {
    const scrim = el("div", { class: "chrx-sub-sheet-scrim",
      onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const sheet = el("div", { class: "chrx-sub-sheet", style: "max-width:420px" });
    sheet.appendChild(el("header", { class: "chrx-sub-sheet__head" },
      el("h3", null, `Move ${slot.classSection} ${slot.subject}`),
      el("button", { class: "chrx-sub-sheet__x", onclick: () => scrim.remove() }, "×"),
    ));
    sheet.appendChild(el("p", { style: "padding:8px 16px;color:#64748b;font-size:12px" },
      `Currently P${slot.period}. Moving it lets the class be taught later instead of covered — the substitute assignment is cleared and must be re-picked.`));

    const periods = [];
    const periodsPerDay = (APP.school.bell?.periods || []).length || (APP.school.periodsPerDay || 8);
    for (let p = 1; p <= periodsPerDay; p++) periods.push(p);

    const row = el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;padding:8px 16px 16px" });
    for (const p of periods) {
      row.appendChild(el("button", {
        class: `chrx-sub-btn ${p === slot.period ? "chrx-sub-btn--primary" : ""}`,
        onclick: () => {
          S.movePeriod(plan, slot.slotKey, p);
          S.persistPlan(APP.school, plan, "Move period");
          scrim.remove();
          refresh();
        },
      }, `P${p}`));
    }
    sheet.appendChild(row);
    if (slot.movedFrom != null) {
      sheet.appendChild(el("div", { style: "padding:0 16px 14px" },
        el("button", {
          class: "chrx-sub-btn",
          onclick: () => {
            S.movePeriod(plan, slot.slotKey, slot.movedFrom);
            slot.movedFrom = null;
            S.persistPlan(APP.school, plan, "Restore period");
            scrim.remove();
            refresh();
          },
        }, `↺ Back to P${slot.movedFrom}`),
      ));
    }
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  // ── merge two classes into one supervised room ──────────────────────────

  function mergeDialog(plan, slot, refresh) {
    const partners = (plan.slots || []).filter((s) => s !== slot && s.period === slot.period);
    const scrim = el("div", { class: "chrx-sub-sheet-scrim",
      onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const sheet = el("div", { class: "chrx-sub-sheet", style: "max-width:520px" });
    sheet.appendChild(el("header", { class: "chrx-sub-sheet__head" },
      el("h3", null, `Merge ${slot.classSection} with another class in P${slot.period}`),
      el("button", { class: "chrx-sub-sheet__x", onclick: () => scrim.remove() }, "×"),
    ));
    sheet.appendChild(el("p", { style: "padding:8px 16px;color:#64748b;font-size:12px" },
      "One substitute supervises both classes together — useful when two sections of the same grade are uncovered at once."));

    if (!partners.length) {
      sheet.appendChild(el("p", { style: "padding:12px 16px;color:#b45309" },
        "No other class needs cover in this period, so there is nothing to merge with."));
    } else {
      const list = el("div", { style: "padding:4px 16px 16px;display:flex;flex-direction:column;gap:6px" });
      for (const p of partners) {
        list.appendChild(el("button", {
          class: "chrx-sub-btn",
          onclick: () => {
            S.mergeSlots(plan, slot.slotKey, p.slotKey);
            S.persistPlan(APP.school, plan, "Merge classes");
            scrim.remove();
            refresh();
          },
        }, `${p.classSection} · ${p.subject} (absent ${p.absentTeacher})`));
      }
      sheet.appendChild(list);
    }
    if (slot.mergedWithKey) {
      sheet.appendChild(el("div", { style: "padding:0 16px 14px" },
        el("button", {
          class: "chrx-sub-btn",
          onclick: () => {
            S.unmergeSlots(plan, slot.slotKey);
            S.persistPlan(APP.school, plan, "Unmerge classes");
            scrim.remove();
            refresh();
          },
        }, "🔓 Unmerge"),
      ));
    }
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  // ── acting class teachers ───────────────────────────────────────────────

  function actingCTSection(plan, refresh) {
    if (!plan.absent || !plan.absent.length) return null;
    const ctMap = P().classTeacherMap(APP.school);
    const reverse = Object.create(null);
    for (const classId of Object.keys(ctMap)) reverse[ctMap[classId]] = classId;
    const absentCTs = P().absentIdsOf(plan).filter((id) => reverse[id]);
    if (!absentCTs.length) return null;

    const wrap = el("div", { style: "margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px" },
      el("b", null, "Acting class teacher"),
      el("div", { class: "chrx-sub-hint", style: "margin-bottom:6px" },
        "Covers the role (attendance, line-up, dispersal) — period substitutions are still handled above."),
    );
    for (const teacherId of absentCTs) {
      const classId = reverse[teacherId];
      const chosen = plan.actingCT?.[classId];
      const cands = P().eligibleActingCTs(APP.school, plan, classId);
      const name = chosen ? (APP.school._idx?.teacherById?.[chosen]?.name || chosen) : "—";
      wrap.appendChild(el("div", { style: "display:flex;gap:8px;align-items:center;padding:4px 0" },
        el("span", { style: "min-width:120px" }, classId),
        el("b", { style: "color:#0369a1" }, name),
        el("button", {
          class: "chrx-sub-btn",
          style: "font-size:11px;padding:2px 8px",
          onclick: () => actingDialog(plan, classId, cands, refresh),
        }, "choose"),
        chosen ? el("button", {
          class: "chrx-sub-btn",
          style: "font-size:11px;padding:2px 8px",
          onclick: () => {
            delete plan.actingCT[classId];
            S.persistPlan(APP.school, plan, "Clear acting class teacher");
            refresh();
          },
        }, "clear") : null,
      ));
    }
    return wrap;
  }

  function actingDialog(plan, classId, cands, refresh) {
    const scrim = el("div", { class: "chrx-sub-sheet-scrim",
      onclick: (e) => { if (e.target === scrim) scrim.remove(); } });
    const sheet = el("div", { class: "chrx-sub-sheet", style: "max-width:460px" });
    sheet.appendChild(el("header", { class: "chrx-sub-sheet__head" },
      el("h3", null, `Acting class teacher for ${classId}`),
      el("button", { class: "chrx-sub-sheet__x", onclick: () => scrim.remove() }, "×"),
    ));
    const list = el("div", { class: "chrx-sub-cand-list", style: "max-height:46vh;overflow:auto" });
    for (const c of cands.slice(0, 20)) {
      list.appendChild(el("button", {
        class: "chrx-sub-cand",
        onclick: () => {
          plan.actingCT = plan.actingCT || {};
          plan.actingCT[classId] = c.teacherId;
          S.persistPlan(APP.school, plan, "Assign acting class teacher");
          scrim.remove();
          refresh();
        },
      },
        el("span", { class: "chrx-sub-cand__stars" }, "★".repeat(c.stars)),
        el("span", { class: "chrx-sub-cand__nm" }, String(c.teacher)),
        el("span", { class: "chrx-sub-cand__score" }, String(c.score)),
        el("div", { class: "chrx-sub-cand__why" }, (c.why || []).join(" · ")),
      ));
    }
    if (!cands.length) list.appendChild(el("p", { style: "padding:12px" }, "No eligible teacher."));
    sheet.appendChild(list);
    scrim.appendChild(sheet);
    document.body.appendChild(scrim);
  }

  window.SubstitutionClasswise = { render, openChooser, runSmartFill };
})();

// [vite-esm] exports auto-generated by the 2026-07 Vite migration.
export const SubstitutionClasswise = window.SubstitutionClasswise;
