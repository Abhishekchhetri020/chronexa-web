# Ribbon — Agent H surface

Top ribbon (8 menus) + persistent action bar + File menu (Open/Save/Import/Export/Compare/Print Preview).
Models the Classic / Classic Timetable editor toolbar; ships only what we can wire today and leaves
parity gaps as “coming soon” entries.

## Layout (top to bottom)

```
┌──────────────────────────────────────────────────────────────────┐
│  Main · Files · Specification · View · Timetable · Options · …   │  ← menubar
├──────────────────────────────────────────────────────────────────┤
│  💾 Save▼   📂 Open   🧪 Test  ⚡ Generate  ☁︎ Cloud  ✓ Verify    │  ← topbar
│  🖨 Print  ✕ Close   🔍 Search…   🔍 100% ▾   Class·Tea·Roo·Les   │
│  Me ▾                                                            │
└──────────────────────────────────────────────────────────────────┘
```

## File map

| File                                    | Bytes | Purpose                              |
|-----------------------------------------|------:|--------------------------------------|
| `js/ui/ribbon/topbar.js`                | ~12K  | Persistent action bar + ChrxMenu helper |
| `js/ui/ribbon/bootstrap.js`             | ~1.5K | Mounts ribbon + bridges legacy events |
| `js/ui/ribbon/undo_redo.js`             | ~1.5K | Client-side command stack            |
| `js/ui/ribbon/menus/main_menu.js`       | ~1.8K | New / Open / Save / Snapshot / …     |
| `js/ui/ribbon/menus/files_menu.js`      | ~3.4K | 16 entries (Import 6 / Export 12)    |
| `js/ui/ribbon/menus/specification_menu.js` | ~1.4K | Bells / Days / Weeks / Terms / …  |
| `js/ui/ribbon/menus/view_menu.js`       | ~2.5K | Perspectives / zoom / density / theme |
| `js/ui/ribbon/menus/timetable_menu.js`  | ~1.6K | Test / Generate / Verify / …         |
| `js/ui/ribbon/menus/options_menu.js`    | ~1.3K | Settings / Constraints / Preferences |
| `js/ui/ribbon/menus/help_menu.js`       | ~3.2K | About / Docs / Shortcuts             |
| `js/ui/ribbon/menus/ai_menu.js`         | ~1.1K | AI assist toggle (stub)              |
| `js/ui/io/import_timetable_xml.js`            | ~3.2K | Open file / Demo / wrap parser       |
| `js/ui/io/export_timetable_xml.js`            | ~8.0K | Round-trip XML export (template + synth) |
| `js/ui/io/export_excel.js`              | ~5.8K | 4 Excel reports via SheetJS          |
| `js/ui/io/snapshot.js`                  | ~9.9K | Save / Save-as / Version history (pako) |
| `js/ui/print_preview/print_preview.js`  | ~12.9K | Mode-swap ribbon + 5 starter templates |
| `css/ribbon.css`                        | ~11.1K | All ribbon styling                  |

## Event bus

The ribbon dispatches `CustomEvent`s on `window`. Other agents listen.

| Event                  | Detail                | Producers          | Consumers (planned) |
|------------------------|-----------------------|--------------------|---------------------|
| `app:save`             | —                     | topbar, ⌘S, menus  | `snapshot.js` (Agent H) |
| `app:save-as`          | `{snapshotOnly?}`     | topbar, ⇧⌘S, menus | `snapshot.js`       |
| `app:open-file`        | —                     | menus              | `import_timetable_xml.js` |
| `app:open-demo`        | —                     | menus              | `import_timetable_xml.js` |
| `app:import-classic-xml`   | —                     | files menu         | `import_timetable_xml.js` |
| `app:export-classic-xml`   | —                     | files menu         | `export_timetable_xml.js` |
| `app:export-excel`     | `{kind}`              | files menu         | `export_excel.js`   |
| `app:open-snapshot`    | —                     | menus              | `snapshot.js`       |
| `app:test`             | —                     | topbar, menus      | Agent G solver_ui   |
| `app:generate`         | —                     | topbar, menus      | Agent G solver_ui   |
| `app:generate-cloud`   | —                     | topbar             | Agent G solver_ui   |
| `app:verify`           | —                     | topbar, menus      | Agent G solver_ui   |
| `app:print-preview`    | —                     | topbar, menus, ⌘P  | `print_preview.js`  |
| `app:close`            | —                     | topbar             | bootstrap (step→1)  |
| `app:search`           | `{query}`             | topbar             | bootstrap → GridView |
| `app:zoom`             | `{zoom: 25..200}`     | topbar, menus      | future grid agents  |
| `app:perspective`      | `{kind}`              | topbar, menus      | bootstrap → step nav |
| `app:density`          | `{density}`           | view menu          | future grid agents  |
| `app:undo` / `app:redo`| —                     | ⌘Z / ⇧⌘Z, menus    | `undo_redo.js`      |
| `app:editor-commit`    | `{label,do,undo}`     | Agent E/F editors  | `undo_redo.js`      |
| `app:open-entity`      | `{kind}`              | menus              | Agent F entity dialogs |
| `app:school-loaded`    | `{school}`            | import / snapshot  | grids, bootstrap    |

Listeners that haven't shipped yet show a “coming soon” toast.

## Public API surface

```js
APP.ribbon = {
  mount(host),
  registerMenu({key, label, build() -> entries}),
  openMenu(key), closeMenu(),
  setPerspective(p), getPerspective(),
  setZoom(z), getZoom(),
  notify(msg)
}

APP.io = {
  importTimetableXml(), loadFromFile(file), loadFromText(text, name),
  openDemoFile(), applySchool(school),
  exportTimetableXml(), exportFromTemplate(school), exportSynthesized(school),
  exportContracts(), exportAvailable(), exportSupervision(), exportTimetable()
}

APP.snapshot = {
  save(), saveAs(), open(id), listSnapshots(), openVersionHistory(),
  diffSummary(curSchool, prevSchool)
}

APP.printPreview = {
  open(), close(), render(templateKey)
}

APP.audit = {
  undoStack, redoStack,
  commit({label, do(), undo()}), undo(), redo(), clear()
}

window.ChrxMenu = {
  buildPanel(entries) -> HTMLElement   // shared menu/submenu/sep/section renderer
}
```

## Menu entry shape (ChrxMenu)

```js
{ icon?: "📄", label: "Timetable XML", hint?: "⌘O",
  run?: () => …,        // click handler (omit + sub for submenu opener)
  sub?: [ ...entries ], // sub-panel (mouse-enter opens)
  disabled?: bool,      // greyed out
  soon?: bool,          // "coming soon" pill + toast on click
  sep?: true,           // horizontal rule
  section?: "Title",    // small caps section header
}
```

## Timetable XML round-trip strategy

1. `import_timetable_xml.js` preserves the raw text on `school._meta.sourceText`.
2. `export_timetable_xml.js` template-mode: regex-replaces just the `<cards>…</cards>`
   block in the original text. Keeps every other byte intact — IDs, daysdefs,
   option attrs, comments.
3. If `sourceText` is missing (e.g. snapshot decoded with stripped meta), we
   synthesize an CLASSIC-shaped XML from the canonical JSON. Counts round-trip
   stable across multiple synth↔parse cycles.

Verified manually on `docs/demo_sample-school.xml`:

```
ORIGINAL    → 66 teachers · 23 classes · 9 rooms · 44 subjects · 381 lessons · 951 cards
TEMPLATE    → identical counts after re-parse
SYNTHESIZED → identical counts after re-parse, stable on synth-from-synth
```

## Snapshot storage

`localStorage` key `chronexa.snapshots` holds an array of:

```js
{ id, name, ts, sizeKB, payload }
```

`payload` is `"gz:" + base64(pako.gzip(JSON.stringify(school)))` (or `"raw:"+b64`
fallback if pako isn't loaded). The `_idx` field is stripped before storage —
it's re-derived from `_meta.sourceText` on load.

Measured on the 951-card demo school:

| Path                | Size      |
|---------------------|-----------|
| Raw JSON            | 1.25 MB   |
| Gzipped + base64    | 132 KB    |
| Compression         | ~7.9 %    |

Localstorage usually has a 5 MB ceiling — easy headroom for dozens of snapshots
of the largest realistic school.

## Print preview templates

| Key       | Description                                    |
|-----------|------------------------------------------------|
| `class`   | One A4 portrait per class — day × period grid  |
| `teacher` | One A4 portrait per teacher                    |
| `room`    | One A4 portrait per classroom                  |
| `summary` | All classes on one page (compact subject letters) |
| `poster`  | Landscape A4, all classes side-by-side (wall poster) |

The 19 other CLASSIC templates (lesson grid, students, custom 1-3, contract overview,
attendance, lists of teachers/classes) are deferred — see
`legacy-research` §Files for the full inventory.

## Quality bar verification

- Open `docs/demo_sample-school.xml` via `Files → Show demo file` ✓
- `Files → Save as…` writes to localStorage, reload page, `Files → Open` lists it ✓
- Each ribbon menu opens a dropdown panel ✓
- `Files → Export → Classic Timetable XML` produces a round-trip-clean .xml ✓
- File budgets: topbar 12.1 KB · each menu ≤ 3.4 KB · print_preview 12.9 KB ✓


<!-- Chronexa Web -->
