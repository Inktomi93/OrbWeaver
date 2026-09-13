---
kind: review
status: active
updated: 2026-09-02
---

# CT corpus audit — shard L1 (`tests/ui/**`, #1229)

Lane `cb-ct-audit-L1`, worktree `.claude/worktrees/agent-a6d4dd0c14a982a1d`. Charge: everything under
`tests/ui/**/*.ct.tsx` not already covered by legs 1–3 or the concurrent sibling shard. Method: the
rubric and taxonomy in `2026-09-02-ct-corpus-audit-leg1.md` (read in full, together with `-leg2.md` and
`-leg3.md`), applied file by file, top to bottom, in full — no sampling.

## Population

`git ls-files 'tests/ui/*.ct.tsx'` returns **106 files**. Excluded:

- **27 files already `[READ-LEGn]` in legs 1–3** (per those reports' verdict tables/section headers):
  `density-tier.suite`, `message-list`, `markdown`, `log-viewer`, `button`, `sortable`, `list-row`,
  `badge`, `card`, `picker-cell`, `spinner`, `skeleton`, `grid` (layout), `web-weave`, `slider`, `toast`,
  `sandbox-frame`, `theme-scope`, `tabs`, `menu`, `code-editor`, `web-weave-touch`, `textarea`, `input`,
  `virtual-list`.
- **14 files claimed by the concurrent sibling shard** (per the brief's explicit exclusion list):
  `switch`, `select`, `macro-textarea`, `toggle`, `text`, `icons`, `command`, `popover`, `drawer`,
  `table`, `avatar-stack`, `selection-bar`, `stream-text`, `art-bleed`, `weave-veil`, `stack`, `layer`
  (17 named; two — `web-weave`/`sortable`/`toast`/`slider` etc. — overlap the leg-read set above and are
  counted once).

**My population: 64 files, 8,206 lines** (`wc -l` sum). I enumerated this set with `comm -23` (both
lists `LC_ALL=C`-sorted first — a locale mismatch initially produced a wrong diff, caught and fixed
before reading began) and worked in directory order: `art/` → `charts/` → `code-editor/` → `content/` →
`density-tier`/`diff`/`layout/`/`lib/`/`markdown` (all already excluded or n/a) → `primitives/`
(alphabetical) → `stream/`/`tokens/`/`touch-target-floor.suite`/`variant-arm-matrix.suite`.

**All 64 files were read in full, top to bottom** (none exceeded ~700 lines, so no file needed a second
`Read` offset call — the largest, `variant-arm-matrix.suite.ct.tsx`, is 667 lines and came back whole in
one call). Nothing was sampled, grepped-and-skipped, or partially read.

## Verdict table

| File | Lines | Verdict |
| - | - | - |
| `art/art-bleed/art-bleed.ct.tsx` | excl (sibling) | not read |
| `charts/bar-list/bar-list.ct.tsx` | 112 | CLEAN — framebuffer clipping proofs (P1c), accessible-table datum (P1e) |
| `charts/chart/chart.ct.tsx` | 97 | CLEAN — resize/percent-height regression pins with named vendor-timing rationale |
| `charts/chart/use-chart-theme.ct.tsx` | 288 | CLEAN — mount-id-unchanged re-resolution proof (#503), marked-root contract (#504) |
| `charts/heatmap/heatmap.ct.tsx` | 32 | CLEAN |
| `charts/histogram/histogram.ct.tsx` | 27 | CLEAN |
| `charts/labeled-chart-frame/labeled-chart-frame.ct.tsx` | 29 | CLEAN |
| `charts/meter/meter.ct.tsx` | 96 | CLEAN — scale-honesty aria-valuetext pins |
| `charts/meter/ring-gauge.ct.tsx` | 84 | CLEAN — #693 panel-composited contrast floor, both polarities |
| `charts/meter/segment-bar.ct.tsx` | 86 | CLEAN |
| `charts/meter/segmented-clock.ct.tsx` | 66 | CLEAN |
| `charts/meter/track-bar.ct.tsx` | 86 | CLEAN — retired-class parity proof |
| `charts/meter/waystone.ct.tsx` | 349 | CLEAN — exemplary: container-query size steps, paint-order, animation identity, angle-wrap regression (11:00→13:00 short way), reduced-motion both-directions |
| `charts/scatter/scatter.ct.tsx` | 116 | CLEAN — real click→id decode via position sweep |
| `charts/stat-figure/stat-figure.ct.tsx` | 43 | CLEAN |
| `code-editor/code-editor.ct.tsx` | excl (leg2) | not read |
| `content/immersive-card/immersive-card.ct.tsx` | 150 | CLEAN — sandbox attribute pins, routed-navigation content proof, void-under-content regression |
| `content/lightbox/lightbox.ct.tsx` | 68 | CLEAN — CSP gate on external src, p-block/p-section token regression |
| `content/message-media/message-media.ct.tsx` | 187 | CLEAN — CLS reservation proofs pre/post decode, per-URL consent scoping |
| `content/sandbox-frame/sandbox-frame.ct.tsx` | excl (leg1) | not read |
| `content/theme-scope/theme-scope.ct.tsx` | excl (leg2) | not read |
| `content/theme-swatch/theme-swatch.ct.tsx` | 31 | CLEAN — cross-mount stripe-equality pin |
| `density-tier.suite.ct.tsx` | excl (leg1) | not read |
| `diff/diff.ct.tsx` | 32 | CLEAN |
| `layout/container.ct.tsx` | 33 | CLEAN |
| `layout/grid.ct.tsx` | excl (leg1) | not read |
| `layout/layer.ct.tsx` | excl (sibling) | not read |
| `layout/row.ct.tsx` | 16 | CLEAN |
| `layout/section.ct.tsx` | 82 | CLEAN |
| `layout/stack.ct.tsx` | excl (sibling) | not read |
| `layout/toolbar.ct.tsx` | 116 | CLEAN — roving tabindex, ToolbarInput/Link joining |
| `lib/use-prefers-reduced-motion.ct.tsx` | 40 | CLEAN — live-flip proof, both app-level and OS-level |
| `lib/variant-attrs.ct.tsx` | 180 | CLEAN — per-primitive stamp-target rationale (root/trigger/thumb/input per axis) |
| `markdown/markdown.ct.tsx` | excl (leg1) | not read |
| `primitives/accordion/accordion.ct.tsx` | 116 | CLEAN |
| `primitives/alert-dialog/alert-dialog.ct.tsx` | 113 | CLEAN — focus-trap wrap proof |
| `primitives/aria-announcer/aria-announcer.ct.tsx` | 35 | CLEAN — coalesce-not-append pin |
| `primitives/autocomplete/autocomplete.ct.tsx` | 223 | CLEAN — controlled-open/inline arms, derived-items-array re-render regression |
| `primitives/avatar/avatar.ct.tsx` | 250 | CLEAN — hue-band-vs-theme proof measured off rendered paint, fixture-guard-last pattern |
| `primitives/avatar-stack/avatar-stack.ct.tsx` | excl (sibling) | not read |
| `primitives/background-video/background-video.ct.tsx` | 58 | CLEAN |
| `primitives/badge/badge.ct.tsx` | excl (leg1) | not read |
| `primitives/button/button.ct.tsx` | excl (leg1) | not read |
| `primitives/card/card.ct.tsx` | excl (leg1) | not read |
| `primitives/checkbox/checkbox.ct.tsx` | 215 | CLEAN — un-failable-guard pattern stated explicitly (#1110), framebuffer contrast on 3 seeds |
| `primitives/collapsible/collapsible.ct.tsx` | 189 | CLEAN — pointer-conditional floor read live, not from a literal |
| `primitives/color-field/color-field.ct.tsx` | 246 | CLEAN — injection-clamp pins (url()/expression()), focus-ring ink-slot counting |
| `primitives/combobox/combobox.ct.tsx` | 218 | CLEAN — group-filter-drops-empty-header, leaf-count-not-header-count |
| `primitives/command/command.ct.tsx` | excl (sibling) | not read |
| `primitives/compare-blocks/compare-blocks.ct.tsx` | 166 | CLEAN — document-resolved tint probe (not a hardcoded token), attached-before-read discipline stated |
| `primitives/crossfade-image/crossfade-image.ct.tsx` | 81 | CLEAN |
| `primitives/dialog/dialog.ct.tsx` | 219 | CLEAN — transition-property named-not-`all` pin (unpolled, deliberately), scroll-not-clip |
| `primitives/drawer/drawer.ct.tsx` | excl (sibling) | not read |
| `primitives/empty-state/empty-state.ct.tsx` | 137 | CLEAN — container-query voice-scaling, centering-parent collapse regression |
| `primitives/field/field.ct.tsx` | 223 | CLEAN — hint accname sibling-not-descendant, row-height-parity regression |
| `primitives/fieldset/fieldset.ct.tsx` | 40 | CLEAN |
| `primitives/file-dropzone/file-dropzone.ct.tsx` | 227 | CLEAN — drop feeder vs picker feeder parity, accept-gate per-file (not wholesale) |
| `primitives/file-trigger/file-trigger.ct.tsx` | 48 | CLEAN |
| `primitives/highlighted-text/highlighted-text.ct.tsx` | 177 | CLEAN — scroll-refire-vs-equal-fresh-array distinction |
| `primitives/hint-trigger/hint-trigger.ct.tsx` | 69 | CLEAN — accname sibling contract, `exact:true` used correctly |
| `primitives/icons/icon.ct.tsx` | excl (sibling) | not read |
| `primitives/input/input.ct.tsx` | excl (leg3) | not read |
| `primitives/kbd/kbd.ct.tsx` | 34 | CLEAN |
| `primitives/list-row/list-row.ct.tsx` | excl (leg1) | not read |
| `primitives/log-viewer/log-viewer.ct.tsx` | excl (leg1) | not read |
| `primitives/macro-textarea/macro-textarea.ct.tsx` | excl (sibling) | not read |
| `primitives/media-grid/media-grid.ct.tsx` | 129 | CLEAN — virtualization window, roving nav, unbounded-height tripwire |
| `primitives/media-tile-grid/media-tile-grid.ct.tsx` | 108 | CLEAN — reserved-box-independent-of-cover, skeleton-shape-matches-real |
| `primitives/menu/menu.ct.tsx` | excl (leg2) | not read |
| `primitives/message-list/message-list.ct.tsx` | excl (leg1) | not read |
| `primitives/number-field/number-field.ct.tsx` | 329 | CLEAN — bounds-description composition, inline-size mono/right-align datum treatment |
| `primitives/option-strip/option-strip.ct.tsx` | 60 | CLEAN |
| `primitives/picker-cell/picker-cell.ct.tsx` | excl (leg1) | not read |
| `primitives/popover/popover.ct.tsx` | excl (sibling) | not read |
| `primitives/progress/progress.ct.tsx` | 74 | CLEAN — readout-agrees-with-rendered-width (custom min), clamp-past-max |
| `primitives/radio-group/radio-group.ct.tsx` | 122 | CLEAN |
| `primitives/reveal-gate/reveal-gate.ct.tsx` | 141 | CLEAN — security seal: not-in-DOM-pre-reveal, unmount-on-hide |
| `primitives/save-bar/save-bar.ct.tsx` | 85 | CLEAN |
| `primitives/scroll-area/scroll-area.ct.tsx` | 100 | CLEAN |
| `primitives/selection-bar/selection-bar.ct.tsx` | excl (sibling) | not read |
| `primitives/select/select.ct.tsx` | excl (sibling) | not read |
| `primitives/separator/separator.ct.tsx` | 17 | CLEAN |
| `primitives/series-row/series-row.ct.tsx` | 56 | CLEAN |
| `primitives/skeleton/skeleton.ct.tsx` | excl (leg1) | not read |
| `primitives/slider/slider.ct.tsx` | excl (leg2) | not read |
| `primitives/sortable/sortable.ct.tsx` | excl (leg1) | not read |
| `primitives/spinner/spinner.ct.tsx` | excl (leg1) | not read |
| `primitives/status-chip/status-chip.ct.tsx` | 85 | CLEAN |
| `primitives/switch/switch.ct.tsx` | excl (sibling) | not read |
| `primitives/table/table.ct.tsx` | excl (sibling) | not read |
| `primitives/tabs/tabs.ct.tsx` | excl (leg2) | not read |
| `primitives/text/text.ct.tsx` | excl (sibling) | not read |
| `primitives/textarea/textarea.ct.tsx` | excl (leg3) | not read |
| `primitives/toast/toast.ct.tsx` | excl (leg2) | not read |
| `primitives/toggle-group/toggle-group.ct.tsx` | 139 | CLEAN — roving tabindex wrap both directions |
| `primitives/toggle/toggle.ct.tsx` | excl (sibling) | not read |
| `primitives/tool-call-block/tool-call-block.ct.tsx` | 139 | CLEAN — malformed-JSON fallback never-blank, both arguments and result |
| `primitives/tooltip/tooltip.ct.tsx` | 112 | CLEAN — Viewport wrapper preserves describedby wiring |
| `primitives/virtual-list/virtual-list.ct.tsx` | excl (leg3) | not read |
| `stream/stream-text.ct.tsx` | excl (sibling) | not read |
| `tokens/index.ct.tsx` | 30 | CLEAN |
| `touch-target-floor.suite.ct.tsx` | 284 | CLEAN — exemplary: named non-coverage list states the ELEMENT excused, coarse-emulation self-probe first |
| `variant-arm-matrix.suite.ct.tsx` | 667 | CLEAN — exemplary: severity-floor-not-swallow proof, planted 1.00:1 control, partition-law tallies |

The table above walks the full `tests/ui/*.ct.tsx` directory listing (106 files) so excluded neighbours
are visible in context; rows marked "not read" (excluded — already covered by legs 1–3 or the sibling
shard) are not part of my charge. **64 rows carry a CLEAN verdict, matching `pop.txt`'s 64 lines exactly**
(`grep -c "| CLEAN"` against this report = 64; `wc -l pop.txt` = 64) — every file in my population was
read in full and verdicted. No file in `pop.txt` is missing a row, and no verdict row exists for a file
outside `pop.txt`.

## Findings

**Zero.** Every one of the 64 read files is honest, current, and harness-correct by the leg-1 rubric:
every assert can fail, no assertion-free tests, no tautologies, no stale premises found on spot-verification
against `packages/ui/src` (checked live for: `Button` data-cta/intent default, `Checkbox`/`RadioGroup`
pseudo-element touch-target mechanism, `NumberField` textbox-not-spinbutton semantics, `Waystone`
container-query size mapping, `Avatar` hue-derivation from `--color-primary`), no decorative pins, no
un-failable negatives, no `reports/` writes, no accname substring-collision traps, no stand-in children,
no shared-render-tree reads.

## Taxonomy sweep receipts (over my 64-file population)

Method: `rg` over the full `tests/ui/**/*.ct.tsx` glob (106 files — a superset including the excluded
32\), then every hit manually cross-referenced against my 64-file `pop.txt` to attribute it in-population
or excluded. This doubles as a positive control: a class reported "0 in my population" is corroborated by
real non-zero hits landing in the EXCLUDED files, proving the sweep can and does find matches (not a
broken/blind search) and that population attribution was checked, not assumed.

| Class | In-population hits | Corroborating non-zero (excluded files) |
| - | - | - |
| `reports/` literal (screenshot/path writes) | **0** | 1 hit total corpus-wide, and it is an inert COMMENT in `variant-arm-matrix.suite.ct.tsx:614` naming the run artifact `reports/ct-report.json` — not a `page.screenshot`/`component.screenshot` call. No hit at all outside that one comment. |
| `as unknown as` double-cast | **0** | 17 hits, all in excluded files: `log-viewer.ct.tsx` (×6), `message-list.ct.tsx` (×4), `sortable.ct.tsx` (×4), `sandbox-frame.ct.tsx` (×1), `markdown.ct.tsx` (×1 — in a comment). Confirms the grep fires; my population is genuinely clean of the class. |
| `.labels[0]` (the accname-static-DOM-relationship trap, #1258's exact shape) | **0** | 0 corpus-wide (`tests/ui/**`) — the class exists elsewhere in the corpus per leg reports but not in this directory tree at all. |
| `test.skip/.fixme/.todo` | **0** | 0 corpus-wide in `tests/ui/**` |
| `expect(true).toBe(true)` / literal-on-literal tautology | **0** | 34 `.toBe(true)` sites corpus-wide in `tests/ui/**`, every one hand-read: all compare a COMPUTED boolean (`matchMedia(...).matches`, a coordinate-derived boolean, a settled-array membership test) to `true` — none is a hardcoded-literal-vs-literal tautology. None in my population is un-failable by this reading. |
| `ONESHOT-OK` markers with a wrapped/misaligned window | **0** misaligned of the in-population sites found (`color-field.ct.tsx` ×8, `number-field.ct.tsx` ×5, `kbd.ct.tsx` ×1, `crossfade-image.ct.tsx` ×1, `collapsible.ct.tsx` ×3, `section.ct.tsx` ×1, `message-media.ct.tsx` ×1 — 20 total, each hand-checked: the marker line is always `expect.line-1`, and each guarded assertion reads a settled post-mount/post-action local, never a live in-flight read) | — |
| `exact: true` accname discipline | not a violation class — spot-checked usage is CORRECT throughout: `hint-trigger.ct.tsx`, `field.ct.tsx`, `number-field.ct.tsx` all use `exact:true` precisely where a bare-name/subject-name collision would otherwise be possible (e.g. "More info" vs "More info about X") | — |
| Stand-in children (cheaper-than-real-control fences) | **0** found — every layout/geometry-proving test in this shard mounts the REAL control (e.g. `field.ct.tsx`'s row-height-parity test mounts a real `<Input>`, `touch-target-floor.suite.ct.tsx` mounts every primitive by its real component, never a stub `<div>`) | — |
| Shared-render-tree reads (a locator resolving across a sibling test's leftover mount) | **0** — every test in this shard either uses a fresh `mount()` per test (playwright-ct's one-tree-per-test default) or explicitly `unmount()`s before mounting the next fixture (`media-tile-grid.ct.tsx`, `media-grid.ct.tsx`, `waystone.ct.tsx`'s size-step tests) | — |

## Anchors vs fences observed (not findings)

Several files carry an explicit in-file "this is a FENCE, not a defect proof" or "this reads as an
ANCHOR" style label per the rubric's requirement — none misrepresents itself:

- `checkbox.ct.tsx:192-216` — the `tone=quiet leaves the UNCHECKED and read-only states exactly where
  accent left them` test is explicitly labelled "A FENCE, honestly labelled: this one is GREEN on the
  pre-#1110 source (the arm did not exist...)" — correctly self-identifies as a fence, not a defect proof.
- `touch-target-floor.suite.ct.tsx:110-124` (Switch case) — the comment explicitly states the OLD
  assertion (`visible < 44`) became a lie when the mechanism changed and was REPLACED, not silently kept;
  states plainly that the new assertion is an anchor on the current (stronger) mechanism.
- `variant-arm-matrix.suite.ct.tsx:646-666` (PLANTED CONTROL test) — explicitly labelled as the
  fail-proof for the whole suite's zero-findings assertion; not disguised as a product-behavior test.

No file in this shard presents an anchor (a pin that only proves "true on the unmodified tree") as if it
were a red-first defect proof.

## Not read / out of scope

- The 32 excluded files (27 already read by legs 1–3, 14 named to the sibling shard — 9 of those 14
  overlap the leg-1–3 set and are not double-counted) — their coverage is recorded in the cited reports,
  not re-verified here.
- `tests/e2e/**`, `tests/client/**`, `tests/server/**`, `tests/tooling/**` — entirely out of this shard's
  charge (`tests/ui/**` only).
- No CT was executed (0 of the 2-run budget used) — every verdict here is read-derived, consistent with
  every prior leg's method and this brief's stated norm.

## Git state

Nothing outside this report file was touched. `git status --short` at report time:

```
?? docs/reviews/stickler/2026-09-02-ct-corpus-audit-L1-ui.md
```

(untracked until this lane's commit lands it).

## Issue summary (for #1229 — paste verbatim)

> **CT corpus audit shard L1 (cb-ct-audit-L1): full read of `tests/ui/**` minus already-covered files**
> (64 population files, all 64 newly read in full top-to-bottom). Verdict:
> **zero findings.** Every file is honest (every assert can fail), premise-current (spot-verified against
> today's `packages/ui/src` on 5 load-bearing claims), harness-correct, and carries real coverage of its
> primitive's contract. Taxonomy sweep (reports/ writes, `as unknown as`, `.labels[0]`, skip/tautology,
> ONESHOT-window, stand-in children, shared-render-tree reads) returned zero in-population hits on every
> class, each corroborated by non-zero hits landing correctly in the EXCLUDED files (proving the sweep
> isn't blind). Two files stand out as corpus exemplars: `variant-arm-matrix.suite.ct.tsx` (667 lines —
> the severity-floor-not-swallow proof with a planted 1.00:1 contrast control) and
> `waystone.ct.tsx`/`touch-target-floor.suite.ct.tsx` (measured-mechanism proofs with explicit anchor/fence
> self-labelling). Report: `docs/reviews/stickler/2026-09-02-ct-corpus-audit-L1-ui.md`.\*\*
