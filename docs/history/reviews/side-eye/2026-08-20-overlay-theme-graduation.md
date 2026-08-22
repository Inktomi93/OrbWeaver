---
kind: review
status: archived
updated: 2026-08-21
---

> Codex-authored side-eye review, recovered untracked at the Codex decommission (2026-08-21, #400).
> Original status: `current-visual-pass` — Codex verdict: visual PASS. final_ref: `6117549056cfb1946143b85d8b12304591b00787`. product_ref: `2d0b176d22c1d52f2bdb35fa1d9f84df3de51124`.

# Overlay theme graduation audit

## Current 611 addendum

Theme picker and Theme builder now **SHIP visually** on the final product tree. The older draft-status P2
and development-only motion allegation remain retracted. `git diff --name-only 2d0b176d2..611754905 --
packages/client packages/ui packages/workspace` returns no paths, and all new receipts below were captured
on the warm 611 private stage.

- Picker: 2d0 defaults plus `final-611-theme-picker-{maximal,compact,reading,diagnostics}-matrix-*` complete
  five 8-arm appearance families.
- Builder: `final-611-theme-builder-{defaults,maximal,compact,reading,diagnostics}-matrix-*` completes all
  five 8-arm families. `final-611-theme-builder-click-control.{png,json}` exposes the honest
  `Draft — edit to create` status.
- Light/default polarity: `final-611-theme-{picker,builder}-theme-{Light,none}.{png,json}`.
- Pane independence: `final-611-theme-{picker,builder}-pane-portal-clean` and
  `final-611-theme-{picker,builder}-focus-portal` retain zero dialog overflow with one or both shell panes
  collapsed.
- Exact keyboard: `final-611-theme-picker-keyboard-focus-exact.json` walks body → Reset to Hearth → New
  theme → Escape to Switch theme. `final-611-theme-builder-keyboard-focus-exact.json` walks body → Close →
  Back and also returns to Switch theme. Every stop is visibly focused.
- Coarse geometry: `final-611-theme-picker-coarse-hit-control.json`,
  `final-611-theme-builder-coarse-hit-control.json`, and
  `final-611-theme-builder-input-coarse-hit-control.json` prove at least 44px controls with real four-edge
  hit ownership.
- Contrast: picker heading 14.25:1/theme row 12.28:1; builder input 9.82:1, Draft status 7.02:1 and
  ColorField control 14.25:1 in the final `*-contrast-control.json` receipts.
- Controlled motion: picker non-virtualized CLS 0.0011/0 desktop/mobile, worst blocking 0/0ms; builder 0/0
  and 6/7ms. Both are compositor-clean.

Final desktop/mobile design-audit leads were reproduced. The duplicate-action lead is a generic dialog
container plus its child with concatenated content, not duplicate controls; ARIA maps expose unique actions.
The desktop line-length lead is the blurred Home card behind the portal, outside the reviewed modal plane.
Builder off-screen nodes are below its scroll viewport and are covered by the matrices and explicit controls.
No P0-P3 or taste defect survived reproduction.

## Final-tree provenance and retractions

`git diff --name-only c260f2905..2d0b176d22c1d52f2bdb35fa1d9f84df3de51124 -- packages/client/src/features/chat packages/client/src/features/settings packages/ui/src/primitives/color-field packages/client/src/forms` is empty. Theme picker, builder, ColorField and autosave paths are byte-identical on final main. The former draft-status P2 is retracted by `reports/snaps/integrated-theme-builder-draft.png`: a fresh builder now exposes `Draft — edit to create`; ColorField portal focus and Escape return are covered by `reports/snaps/integrated-theme-colorfield-portal.png`; production New-theme interaction has zero long tasks in `reports/perf-meter/integrated-c260-theme-new-prod-perf-ready.json`.

Superseded retraction (2026-08-20): the former dev-stack 223 ms New-theme motion P1 is **not a product finding**. The same interaction on a production build/server of this candidate passed with 0 LoAFs, worst blocking 0 ms, non-virtualized CLS 0, and no dirty animations. Exact receipt: `reports/side-eye-theme-motion-builder-prod.log`; command: `pnpm --dir /tmp/orb-overlay-verify.dJbi4u/candidate motion-audit / --base http://localhost:8918 --click '[aria-label="Switch theme"]' --selector 'role=button[name="New theme"]' --full-motion --appearance-preset maximal`. The production build used `pnpm --dir /tmp/orb-overlay-verify.dJbi4u/candidate --filter @orb/client build`; its private server was `STACK_RUN_DIR=/tmp/orb-theme-prod-motion-run.bX3M3S PORT=8918 ENGINES_POSTURE=off pnpm --dir /tmp/orb-overlay-verify.dJbi4u/candidate stack start prod`. This report is therefore historical and not a clean graduation decision.

Verdict at the time: **DO NOT SHIP**. The Theme picker held across all five appearance preset matrices. The New theme builder did lie about persistence before a row existed; the motion P1 below is retracted.

## Confirmed findings

### Retraction — New theme opening motion P1

The original P1 was based on `reports/side-eye-theme-motion-builder.log` from Vite dev. It is overturned by the production interaction receipt above. The disagreement with the earlier dev `perf-meter` was therefore instrumentation/build overhead, not a confirmed user-facing editor stall. Do not file or fix this as product work.

### \[P2] A new, unpersisted theme announces “Saved”

**Why it hurts:** a person who opens New theme sees and hears a polite `Saved` status even though no theme row exists until the first edit. Closing immediately leaves nothing behind, so the status is false feedback at the exact decision point where an author needs to know whether their work exists.

**Fix:** clarify: ThemeEditor draft save status — render `Draft — edit to create` (or `Not saved`) until the deferred mint resolves; retain `Saving…` and `Saved` only after a successful write. Do not mint on open.

**Receipt:** `reports/snaps/side-eye-theme-builder-jsclick.png` and its ARIA output (`status: Saved`). The deferred-mint contract is documented at `packages/client/src/features/settings/components/theme-editor.tsx:9-15`; `onNew` creates only a draft at `packages/client/src/features/settings/surfaces/theme-picker-surface.tsx:94-101`; generic autosave initializes to `saved` at `packages/client/src/forms/create-autosave-entity-form.tsx:125-132`.

## Taste and flow

The picker looks good. It is spare, legible, and its mobile 366 px dialog keeps both actions intact without trying to turn three theme rows into a card zoo. The picker is intuitive cold: choose a theme or create one.

The builder is visually orderly but the top has a conspicuous empty band: Back sits left, the false Saved status floats far right, then the real work starts. That makes the false state more noticeable and the flow feel less trustworthy. The modal does not look like AI sludge; its failure is feedback honesty and opening cost, not visual craft.

Sam passed the picker keyboard path: initial body focus, Tab to Reset then New theme with visible focus, Escape returning to `Switch theme`. The builder reaches Back then Theme name with a visible ring. Picker ARIA exposed all ten controls with names; the builder exposed 18 named controls. Casey's compact-mobile verification measured the picker dialog at 366 x 371.75 CSS px with all ten named controls present. A blank compact matrix PNG was re-run and retracted as a matrix capture race; the fresh compact-mobile ARIA/geometry receipt is `reports/snaps/side-eye-theme-compact-mobile-verify.png`.

## What held

- Theme picker completed every `defaults`, `maximal`, `compact`, `reading`, and `diagnostics` matrix arm (desktop/mobile x light/dark x motion/reduced): 40 PNG/JSON receipts under `reports/snaps/side-eye-theme-*-matrix-*`.
- Theme builder completed the same 40-arm preset matrix using the reliable raw modal-button interaction: `reports/snaps/side-eye-theme-builder-*-matrix-*`.
- Picker motion passed (`reports/side-eye-theme-motion-picker.log`); builder `perf-meter` had no long task in two cycles, even though motion-audit caught the LoAF.

## Coverage status

The final visual battery is complete for picker and builder: matrices, Light/none, portal pane states,
keyboard/Escape, ARIA, coarse-pointer geometry, contrast, post-ready motion/perf controls, desktop/mobile
design audits and screenshot reads all ran. Lighthouse remains **SKIPPED** because no callable Lighthouse
MCP was exposed in this lane. That limitation is not a pass, but it does not preserve the superseded
historical HOLD.
