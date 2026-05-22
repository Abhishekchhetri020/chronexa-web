/* Filter modal — Phase 3 of the print-system rewrite.
 *
 * Top-level modal with 6 sections (Classes / Teachers / Classrooms /
 * Subjects / Periods / Days). Each section displays a count summary
 * ("All classes" / "5 selected") and opens a two-pane transfer-list
 * sub-modal on click. State lives on report.filters; the pivot engine
 * already reads it via applyFilters.
 *
 * Matches aSc screenshots 9-15.
 *
 * Public API:
 *   APP.PrintFilterDialog.open(report, onSave)
 */
(function () {
  "use strict";
  const APP = (window.APP = window.APP || {});

  const SECTIONS = [
    { key: "classes",  label: "Classes",    entityKind: "class"     },
    { key: "teachers", label: "Teachers",   entityKind: "teacher"   },
    { key: "rooms",    label: "Classrooms", entityKind: "classroom" },
    { key: "subjects", label: "Subjects",   entityKind: "subject"   },
    { key: "periods",  label: "Periods",    entityKind: "period"    },
    { key: "days",     label: "Days",       entityKind: "day"       },
  ];

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of kids) if (c != null && c !== false) {
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }
  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function entitiesFor(kind) {
    const Pivot = APP.PrintPivot;
    if (!Pivot || !APP.school) return [];
    return Pivot.entitiesFor(kind, APP.school, 8);
  }

  // ────────────────────────────────────────────────────────────────────
  // Two-pane transfer list — used for each of the 6 sections
  // ────────────────────────────────────────────────────────────────────

  function openTransferList(title, allEntities, selectedIds, onSave) {
    // Internal mutable copy of selected order
    let selected = (selectedIds || []).filter(id => allEntities.some(e => e.id === id));

    const scrim = el("div", {
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);backdrop-filter:blur(6px);z-index:9400;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dlg = el("div", {
      style: "background:var(--chrx-bg-sheet,#f6f1e6);width:min(900px,94vw);max-height:84vh;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:system-ui;color:var(--chrx-fg,#1a1714);overflow:hidden;display:flex;flex-direction:column",
    });
    scrim.appendChild(dlg);

    function close() { scrim.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);

    const header = el("div", {
      style: "background:#2f3940;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center",
    });
    header.appendChild(el("div", { style: "font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase" }, title));
    header.appendChild(el("button", {
      type: "button",
      style: "background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px",
      onclick: close, "aria-label": "Close",
    }, "×"));
    dlg.appendChild(header);

    // Body: grid with left list, centre arrows column, right list
    const body = el("div", {
      style: "display:grid;grid-template-columns:1fr 60px 1fr;gap:16px;padding:18px 24px;flex:1;overflow:hidden",
    });
    dlg.appendChild(body);

    const leftPane  = makeListPane("Available");
    const rightPane = makeListPane("Selected", true);
    const centre = el("div", {
      style: "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px",
    });
    body.appendChild(leftPane.node);
    body.appendChild(centre);
    body.appendChild(rightPane.node);

    const swapBtn = el("button", {
      type: "button",
      style: "width:42px;height:42px;border-radius:50%;border:1px solid #d8cfbb;background:rgba(13,79,84,.08);color:#0d4f54;font-size:18px;cursor:pointer",
      title: "Move selection ⇄",
      onclick: () => {
        // Move highlighted rows in left to right (and vice versa)
        const leftSel = leftPane.getHighlighted();
        const rightSel = rightPane.getHighlighted();
        if (leftSel.length > 0) {
          for (const id of leftSel) if (!selected.includes(id)) selected.push(id);
        } else if (rightSel.length > 0) {
          selected = selected.filter(id => !rightSel.includes(id));
        }
        refreshPanes();
      },
    }, "⇄");
    centre.appendChild(swapBtn);

    // Reorder controls (right pane)
    const upBtn = el("button", {
      type: "button",
      style: "width:36px;height:30px;border-radius:6px;border:1px solid #d8cfbb;background:#fff;cursor:pointer;font-size:14px",
      title: "Move up",
      onclick: () => {
        const hl = rightPane.getHighlighted();
        if (hl.length === 0) return;
        for (const id of hl) {
          const i = selected.indexOf(id);
          if (i > 0) {
            [selected[i-1], selected[i]] = [selected[i], selected[i-1]];
          }
        }
        refreshPanes();
      },
    }, "▲");
    const removeBtn = el("button", {
      type: "button",
      style: "width:36px;height:30px;border-radius:6px;border:1px solid #d8cfbb;background:#fff;cursor:pointer;font-size:14px;color:#9c4322",
      title: "Remove from selected",
      onclick: () => {
        const hl = rightPane.getHighlighted();
        selected = selected.filter(id => !hl.includes(id));
        refreshPanes();
      },
    }, "×");
    const downBtn = el("button", {
      type: "button",
      style: "width:36px;height:30px;border-radius:6px;border:1px solid #d8cfbb;background:#fff;cursor:pointer;font-size:14px",
      title: "Move down",
      onclick: () => {
        const hl = rightPane.getHighlighted();
        if (hl.length === 0) return;
        for (let i = selected.length - 1; i >= 0; i--) {
          if (hl.includes(selected[i]) && i < selected.length - 1) {
            [selected[i+1], selected[i]] = [selected[i], selected[i+1]];
          }
        }
        refreshPanes();
      },
    }, "▼");
    centre.appendChild(upBtn);
    centre.appendChild(removeBtn);
    centre.appendChild(downBtn);

    // Footer with action buttons
    const footer = el("div", {
      style: "padding:14px 24px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg,#f6f1e6)",
    });
    const leftFooter = el("div", { style: "display:flex;gap:8px" });
    leftFooter.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: () => { selected = allEntities.map(e => e.id); refreshPanes(); },
    }, "Select all"));
    leftFooter.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: () => { selected = []; refreshPanes(); },
    }, "Clear selection"));
    footer.appendChild(leftFooter);
    const rightFooter = el("div", { style: "display:flex;gap:8px" });
    rightFooter.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: close,
    }, "Cancel"));
    rightFooter.appendChild(el("button", {
      type: "button",
      style: "padding:6px 18px;border:0;background:#0d4f54;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600",
      onclick: () => { close(); if (typeof onSave === "function") onSave(selected); },
    }, "OK"));
    footer.appendChild(rightFooter);
    dlg.appendChild(footer);

    function refreshPanes() {
      const selectedSet = new Set(selected);
      const leftItems  = allEntities.filter(e => !selectedSet.has(e.id));
      const rightItems = selected
        .map(id => allEntities.find(e => e.id === id))
        .filter(Boolean);
      leftPane.setItems(leftItems, selectedSet);
      rightPane.setItems(rightItems, selectedSet);
    }
    refreshPanes();

    document.body.appendChild(scrim);
  }

  function makeListPane(label, selectedPane) {
    const wrap = el("div", {
      style: "display:flex;flex-direction:column;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:8px;overflow:hidden",
    });
    const head = el("div", {
      style: "display:grid;grid-template-columns:90px 1fr;padding:8px 12px;background:#fafafa;border-bottom:1px solid #eee;font-size:12px;font-weight:600;color:#4a4339",
    },
      el("span", null, "Abbreviation"),
      el("span", null, "Name"));
    wrap.appendChild(head);

    const list = el("div", {
      style: "flex:1;overflow:auto;max-height:46vh;min-height:240px",
    });
    wrap.appendChild(list);

    let highlighted = new Set();

    function setItems(items, selectedSet) {
      clearNode(list);
      highlighted = new Set();
      items.forEach(e => {
        const row = el("div", {
          style: "display:grid;grid-template-columns:90px 1fr;padding:6px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f3f3;align-items:center",
          "data-id": e.id,
          onclick: (ev) => {
            // Cmd/Ctrl-click for multi-select
            if (!ev.metaKey && !ev.ctrlKey) highlighted.clear();
            if (highlighted.has(e.id)) highlighted.delete(e.id);
            else highlighted.add(e.id);
            paintHighlight();
          },
          ondblclick: () => {
            // Double-click moves the item across (handled outside by swap)
            const sb = wrap.parentElement?.querySelector('button[title="Move selection ⇄"]');
            if (sb) { highlighted.clear(); highlighted.add(e.id); paintHighlight(); sb.click(); }
          },
        });
        row.appendChild(el("span", { style: "color:#0d4f54;font-weight:600" }, e.abbr || e.id));
        row.appendChild(el("span", null, e.name || e.id));
        list.appendChild(row);
      });
      paintHighlight();
    }

    function paintHighlight() {
      list.querySelectorAll('div[data-id]').forEach(r => {
        const id = r.getAttribute("data-id");
        if (highlighted.has(id)) r.style.background = "rgba(91,110,61,.18)";
        else r.style.background = "transparent";
      });
    }

    function getHighlighted() { return Array.from(highlighted); }

    return { node: wrap, setItems, getHighlighted };
  }

  // ────────────────────────────────────────────────────────────────────
  // Top-level filter modal (6-section overview)
  // ────────────────────────────────────────────────────────────────────

  function open(report, onSave) {
    if (!report) return;
    report.filters = report.filters || { classes:[], teachers:[], rooms:[], subjects:[], periods:[], days:[] };

    const scrim = el("div", {
      class: "chrx-print-filter-scrim",
      style: "position:fixed;inset:0;background:rgba(26,23,20,.42);backdrop-filter:blur(6px);z-index:9350;display:flex;align-items:flex-start;justify-content:center;padding-top:10vh",
      onclick: (e) => { if (e.target === scrim) close(); },
    });
    const dlg = el("div", {
      style: "background:var(--chrx-bg-sheet,#f6f1e6);width:min(720px,92vw);border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.25);font-family:system-ui;color:var(--chrx-fg,#1a1714);overflow:hidden",
    });
    scrim.appendChild(dlg);

    function close() { scrim.remove(); document.removeEventListener("keydown", onKey, true); }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);

    const header = el("div", {
      style: "background:#2f3940;color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center",
    });
    header.appendChild(el("div", { style: "font-weight:600;font-size:14px;letter-spacing:.04em;text-transform:uppercase" }, "Filter"));
    header.appendChild(el("button", {
      type: "button",
      style: "background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;padding:0 6px",
      onclick: close, "aria-label": "Close",
    }, "×"));
    dlg.appendChild(header);

    const titleSection = el("div", { style: "padding:14px 24px 8px;border-bottom:1px solid var(--chrx-line,#d8cfbb)" });
    titleSection.appendChild(el("h2", {
      style: "margin:0;font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:22px",
    }, "Filter what's printed"));
    titleSection.appendChild(el("p", {
      style: "margin:6px 0 0;font-size:13px;color:var(--chrx-fg-secondary,#4a4339);line-height:1.5",
    }, "Pick which entities to include. An empty list means 'all'."));
    dlg.appendChild(titleSection);

    const body = el("div", { style: "padding:18px 24px;display:grid;grid-template-columns:1fr 1fr;gap:12px" });
    dlg.appendChild(body);

    function sectionRow(section) {
      const row = el("button", {
        type: "button",
        class: "chrx-filter-row",
        style: "display:flex;justify-content:space-between;align-items:center;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:8px;padding:14px 16px;cursor:pointer;font-family:system-ui;font-size:13px;text-align:left;color:var(--chrx-fg,#1a1714)",
        onclick: () => {
          const ents = entitiesFor(section.entityKind);
          openTransferList(section.label, ents, report.filters[section.key], (newSelected) => {
            report.filters[section.key] = newSelected;
            refreshSummaries();
          });
        },
      });
      const left = el("div", { style: "display:flex;flex-direction:column;gap:2px" });
      left.appendChild(el("div", { style: "font-weight:600;font-size:14px" }, section.label));
      const summary = el("div", { style: "font-size:11.5px;color:var(--chrx-fg-tertiary,#837a6d)" }, "");
      summary.dataset.section = section.key;
      left.appendChild(summary);
      row.appendChild(left);
      row.appendChild(el("span", { style: "color:#0d4f54;font-weight:700;font-size:16px" }, "›"));
      return row;
    }

    for (const sec of SECTIONS) body.appendChild(sectionRow(sec));

    function refreshSummaries() {
      for (const sec of SECTIONS) {
        const sumNode = body.querySelector('div[data-section="' + sec.key + '"]');
        if (!sumNode) continue;
        const sel = report.filters[sec.key] || [];
        if (sel.length === 0) {
          sumNode.textContent = "All " + sec.label.toLowerCase();
        } else {
          const total = entitiesFor(sec.entityKind).length;
          sumNode.textContent = sel.length + " of " + total + " " + sec.label.toLowerCase();
        }
      }
    }
    refreshSummaries();

    const footer = el("div", {
      style: "padding:14px 24px 18px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--chrx-line,#d8cfbb);background:var(--chrx-bg,#f6f1e6)",
    });
    footer.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: () => {
        for (const sec of SECTIONS) report.filters[sec.key] = [];
        refreshSummaries();
        if (typeof onSave === "function") onSave(report);
      },
    }, "Clear filter — print ALL items"));
    const rightBtns = el("div", { style: "display:flex;gap:8px" });
    rightBtns.appendChild(el("button", {
      type: "button",
      style: "padding:6px 14px;border:1px solid var(--chrx-line,#d8cfbb);background:#fff;border-radius:6px;cursor:pointer;font-size:13px",
      onclick: close,
    }, "Cancel"));
    rightBtns.appendChild(el("button", {
      type: "button",
      style: "padding:6px 18px;border:0;background:#0d4f54;color:#fff;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600",
      onclick: () => { close(); if (typeof onSave === "function") onSave(report); },
    }, "OK"));
    footer.appendChild(rightBtns);
    dlg.appendChild(footer);

    document.body.appendChild(scrim);
  }

  APP.PrintFilterDialog = { open };
})();
