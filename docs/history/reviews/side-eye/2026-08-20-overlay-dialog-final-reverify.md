---
kind: review
status: archived
updated: 2026-08-30
---

# Overlay and dialog final reverify

**VERDICT: GRADUATE #315, #359, #361, #363, #367, #368, and #369.** The exact
integrated tree repairs the two keyboard/focus failures and the Effects reading-measure defect. The
complete appearance matrix, actual pointer and keyboard routes, coarse geometry, ARIA, contrast,
portal/pane ownership, production motion, and independent performance controls are clean. No product
P0-P3 or unresolved taste/ugly finding survived the evidence ladder.

This report supersedes the overlay rows of the prior HOLD patch
`/tmp/integrated-ui-side-eye-final.patch`, which reviewed `06d02cf3`. Its Chats rows and findings
\#364-#366 are outside this final reverify.

## Provenance and isolation

- Exact reviewed ref: `2895946d810415f85c5bb001d27af60d396660be`.
- Detached review tree: `/tmp/orb-315-reverify.D0fxG6`.
- Private development pair: app `http://127.0.0.1:5384`, API `http://127.0.0.1:8999`, run state
  `/tmp/orb-315-reverify.D0fxG6-run/dev`, DB
  `/tmp/orb-315-reverify.D0fxG6/data/orbweaver.db`.
- The private DB contained seven chats before corpus-dependent drives. Its initial SHA-256 was
  `e87b2a5a3432d04fef2849fda95fe4a36c17a1d2f959745e5d3e88ec91cc20dc`; its final SHA-256 was
  `3ef33cef71ac84fcc2cbcecf549ac9064249e232d94d78780d98023027cfa602` after the app's normal
  temporary-chat reaper ran. The command corpus remained seven rows.
- Private production stage: `http://127.0.0.1:8996`, run state
  `/tmp/orb-315-reverify.D0fxG6-run/prod`. The client was built in the exact detached tree before the
  production server started. `/healthz` was clean and single-user; no shared stack was touched.
- Product code, Project state, `main`, and `origin` were not changed. Review-only probe scripts and
  generated evidence stay in the private tree; this durable report is the only returned patch.

## Coverage

Every named surface ran `defaults`, `maximal`, `compact`, `reading`, and `diagnostics` across
desktop/mobile, light/dark, and OS full-motion/reduced-motion while the application motion arm was
full: eight cells per preset, forty per surface. The final audit read all results: **240/240 pass**.

| Surface | Result | Artifact stem |
| - | -: | - |
| Command palette | 40/40 | `reports/snaps/final-289-315-command-*-matrix-*` |
| Theme picker | 40/40 | `reports/snaps/final-289-315-theme-picker-*-matrix-*` |
| Theme builder | 40/40 | `reports/snaps/final-289-315-theme-builder-*-matrix-*` |
| Settings | 40/40 | `reports/snaps/final-289-315-settings-*-matrix-*` |
| Persona / You | 40/40 | `reports/snaps/final-289-315-persona-*-matrix-*` |
| Settings Effects, scrolled | 40/40 | `reports/snaps/final-289-315-effects-*-matrix-*` |

Each surface also has explicit Light and `none` theme receipts under
`reports/snaps/final-289-315-{command,picker,builder,settings,persona,effects}-theme-*`. List-open,
list-hidden, context-open, and focus-mode portal states are captured by
`final-289-315-pane-{command-list-open,command-list-hidden,theme-context-open,settings-focus}`.
Representative screenshots were blunt-read at desktop and phone widths; hierarchy, containment,
contrast, and visual finish remain coherent in every arm.

## Command palette — #359, #363, #367, #368

The semantic control maps one dialog containing a named combobox, listbox, groups, and options; all
24 mapped controls are semantic rather than DOM fallbacks. Heading contrast is 15.34:1, the palette
does not overflow, and the selected option remains represented. Receipt:
`reports/snaps/final-289-315-command-semantic-control.{png,json}`.

Actual keyboard routes are clean:

- Meta+K and Control+K each open exactly one palette and focus `Search commands`.
- Rapid repeated Meta+K leaves one dialog and one focused combobox.
- An editable Settings search and an existing Theme modal retain their sole owner; the palette does
  not steal either route.
- Filtering `Rust` leaves one selected `Example — The Rust Lecture`. No-results names the empty
  state; repopulation restores 17 options; Escape closes the palette.
- Actual mobile pointer entry is included in the appearance and replacement probes.

Receipts: `final-289-315-command-{meta-key,control-key,rapid-key,editable-clean,
existing-modal-clean,filter-rust,filter-states}` under `reports/snaps/`. The combined filter-state
manifest contains one invalid exploratory eval expression; only its succeeding state evals are cited.
The independent Rust and keyboard receipts are clean.

### #367 focus ownership repair

`reports/snaps/final-289-315-overlay-interactions.json` proves the two sides of the ownership
contract at both 390px and 320px:

- Ordinary You drawer close returns focus to the visible `You` button outside any dialog.
- Repeated You -> Jump replacement, twice per width, settles with focus on `Search commands` inside
  the sole command dialog.
- The actual bottom-nav You targets are 97.5x56px at 390 and 80x56px at 320; neither viewport has
  horizontal or vertical overflow.

This closes the prior post-unmount focus race without regressing ordinary Drawer return focus.

### #368 Retry repair

`reports/snaps/final-289-315-command-retry.json` and its Enter, Space, and pointer screenshots prove
all three recovery routes against forced recent-thread failures. In each arm Retry owns focus inside
the dialog, performs the refetch, disappears after recovery, leaves the palette open with 17 options,
and leaves the shell byte-equivalent (`Home`, both panes collapsed, no chat, focus mode off). The
static selection is still Home before and after recovery, but neither Enter nor Space activates it.

## Theme picker and builder — #315, #361

Actual pointer paths, Escape, focus return, selected state, mobile containment, portal ownership,
four-edge hit ownership, Light/`none`, and all five presets pass. The picker and builder remain
legible without horizontal overflow at phone width. Production design-audit drives cover both
desktop and mobile actual paths in `reports/design-audit/final-289-315-prod-{picker,builder}-*-actual.json`.

The earlier #361 suspected regression remains retracted: the final tree supplies no reproduction
across its forty picker cells, forty builder cells, Light/`none`, coarse geometry, or actual routes.

## Settings, persona, and Effects — #315, #369

Settings and Persona actual desktop and mobile routes preserve focus, Escape, ordering, containment,
and owned coarse targets. The portal stays on the correct pane plane when the list is open/hidden,
the context pane is open, and focus mode is active. Slider geometry was controlled separately: the
22px native input reported by the audit is inside a visible 24px thumb; the actual slider control is
200x32px in fine input and supplies the coarse target. Receipt:
`reports/snaps/final-289-315-slider-geometry-control.{png,json}`.

### #369 reading measure repair

The Frosted-glass explanation measures 390.375px at 10.5px in defaults, maximal, compact, and
diagnostics; reading scales it to 487.406px at 13.125px. The exact `1ch` control is 6px, making the
default rail 65.0625ch. Reading scales proportionally to the same measure. All five presets therefore
remain inside the accepted 65-75ch band.

At 390px the Effects section/prose are both 276px wide; at 320px both are 206px wide. Both have zero
horizontal overflow and the prose is contained. The actual Effects anchor puts the section heading
fully below the sticky header. Receipts:

- `reports/snaps/final-289-315-effects-measure-{defaults,maximal,compact,reading,diagnostics}.{png,json}`
- `reports/snaps/final-289-315-effects-ch-control.{png,json}`
- `reports/snaps/final-289-315-overlay-interactions.json`
- `reports/snaps/final-289-315-effects-actual-anchor.{png,json}`

## Production motion and performance

Command open was measured in four independent native-speed production perf-meter runs. Click duration was 64-88ms;
three runs observed 53-58ms long tasks, but every measured interaction had **0ms blocking duration**,
zero layout shift, and stayed below the interaction budget. Four Home controls were 32-40ms with no
long tasks. Four Theme controls were 56-88ms; three had no long task and one observed 76ms with 0ms
blocking. Receipts: `reports/perf-meter/final-289-315-prod-{command-perf-run,
home-perf-control,theme-perf-control}-{1..4}.json`.

A separate CDP control applies actual 4x CPU throttling to four fresh production contexts and dispatches
the pointer at the door's measured center. All four runs open one dialog with `Search commands`
focused, no page errors, and zero CLS. Interaction duration is 75-95ms; observed blocking duration is
2-8ms. Receipt: `reports/perf-meter/final-289-315-prod-command-4x-control.json`.

The initial multi-cycle command perf probe is retained but not counted: leaving the first modal open
made later clicks non-actionable. Independent page runs are the valid control.

Four independent production motion probes — two default/reduced arms and two explicit full-motion
arms — all pass at 4x CPU with zero dropped frames, 0ms worst blocking, zero CLS, zero style/layout in
frame, zero dirty animation, and zero page errors:
`reports/final-289-315-prod-command-motion-{bare,full}-{1,2}.log`.

Lighthouse was not run because no callable Lighthouse instrument was available. This is a declared
skip, not a pass. Snap ARIA, contrast, geometry, keyboard, screenshots, performance meter, production
motion, and deterministic design audit were run.

## Detector disposition and separate tooling finding

- The audit's recurring 86ch and all-caps leads are the blurred Home card behind the active portal,
  not overlay prose: the text is the Ashen Spire excerpt and cast-name metadata. Control:
  `reports/snaps/final-289-315-audit-home-controls.{png,json}`.
- The 22px slider lead is the native sub-node control described above, not a lost hit target.
- The mobile Effects deterministic audit could not action an offscreen side-nav anchor. Settings'
  mobile actual route and the dedicated 390/320 Effects probe provide the owned replacement receipt.
- One separate **P2 audit-integrity finding** survives: `duplicate-action-door` counts nested generic
  `div[tabindex=-1]` focus-management wrappers as distinct doors. The exact control is
  `reports/snaps/final-289-315-duplicate-door-root-control.{png,json}`. The root cause is
  `scripts/probes/design-audit-walker.ts:19,735-742,870-879` admitting all `[tabindex]` nodes and
  naming unroled DIVs `generic`, then `scripts/probes/design-audit-checks.ts:1486-1521` grouping their
  distinct DOM paths. Acceptance: exclude programmatic-only generic `tabindex=-1` wrappers from
  action-door grouping while retaining them in the focus/a11y census; a nested-wrapper CT is clean and
  two truly duplicated buttons still fail. This is an instrument defect, not a #315 product hold.

## Final ledger

| Issue | Verdict | Final evidence |
| - | - | - |
| #315 overlay/dialog class | **GRADUATE** | 240-cell matrix, actual routes, panes/portal, ARIA, contrast, geometry, production instruments |
| #359 command palette | **GRADUATE** | semantic map, keyboard/pointer entry, filters, Escape, performance |
| #361 Theme regression report | **RETRACTION HOLDS / GRADUATE** | zero reproduction across picker/builder matrix and controls |
| #363 command shortcut | **GRADUATE** | Meta+K, Control+K, repeat/rapid/editable/existing-modal ownership |
| #367 focus race | **GRADUATE** | ordinary return focus plus repeated You -> Jump replacement at 390/320 |
| #368 keyboard Retry | **GRADUATE** | Enter, Space, and pointer recover without command activation |
| #369 Effects measure | **GRADUATE** | 65.0625ch across scaled presets; 390/320 containment |

The exact-289 overlay/dialog class is ready to close. The separate design-audit P2 should be filed and
claimed in the tooling lane, but it does not invalidate the product evidence above.
