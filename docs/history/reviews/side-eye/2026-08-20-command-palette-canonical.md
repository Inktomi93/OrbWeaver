---
kind: review
status: archived
updated: 2026-08-21
---

> Codex-authored side-eye review, recovered untracked at the Codex decommission (2026-08-21, #400).
> Original status: `current-hold-363` — Codex verdict: HOLD on #363. final_ref: `6117549056cfb1946143b85d8b12304591b00787`. product_ref: `2d0b176d22c1d52f2bdb35fa1d9f84df3de51124`.

# Command palette canonical visual graduation

## Current 611 verdict

**HOLD on #363.** The palette itself passes the final visual, state, recovery, semantic, geometry,
theme, pane and controlled-instrument rows. The remaining product defect is outside the modal: the visible
desktop `⌘K` chip does not respond to Meta+K or Control+K.

- Failure receipts: `reports/snaps/final-611-command-shortcut-focus-walk.json` and
  `reports/snaps/final-611-command-shortcut-focus-walk-control.json` both end with `{ open: false }`.
- Working control: `reports/snaps/final-611-command-keyboard-focus-walk-exact.json` opens from the actual
  chip, Tabs to the named combobox, links ArrowDown selection through `aria-activedescendant`, and returns
  visible focus to the chip on Escape.
- Root cause: `packages/client/src/features/app-shell/surfaces/app-shell.tsx:98-139` renders the shortcut
  glyph and wires only `onClick`; a two-method 1,010-file client TS/TSX sweep found no Command shortcut
  listener.

Issue #363 is filed and claimed as P2. The visible promise is broken, while the click door and modal path
remain usable. `git diff --name-only 2d0b176d2..611754905 -- packages/client packages/ui packages/workspace`
is empty, so 611's product tree is byte-identical to the scored 2d0 tree.

## Final-tree provenance

`git diff --name-only c260f2905..2d0b176d22c1d52f2bdb35fa1d9f84df3de51124 -- packages/client/src/features/chat packages/client/src/features/settings packages/ui/src/primitives/color-field packages/client/src/forms` is empty. The final tree changes only Configuration collection controls in this scope, so the canonical error/retry/repopulation and ARIA receipts below remain applicable. Final main re-ran the open palette baseline through every committed appearance preset and all desktop/mobile × light/dark × OS-motion/reduced cells: `reports/snaps/final-2d0b-command-{defaults,maximal,compact,reading,diagnostics}-matrix-dynamic-*` (5×8, every matrix `failed=0`). The dynamic trigger deliberately selects the rendered desktop topbar trigger or mobile You-sheet Jump door per variant; this retracts the older mobile red traces produced by attempting the desktop-only trigger on mobile.

Current integrated addendum (`14575c87e`, post-green): the prior compact no-results P2 is **retracted**. The #355 fix centered the empty state across all five full 8-arm preset matrices (40/40 pass). This historical report still does not claim complete #315 graduation.

## Confirmed finding

### Retraction — compact no-results dead cavity

The earlier call was based on the pre-#355 image. Post-green `14575c87e` receipts show the message centered in the fixed compact list; the remaining space is balanced rather than a top-pinned dead cavity. Receipt: `reports/snaps/side-eye-command-355-compact-green-mobile-dark-reduced-no-results.png`, backed by all five `side-eye-command-355-*-green` matrices (`RESULT snap-matrix variants=8 failed=0`).

## What held

- **All four state rows:** default/recents, one-result `Analytics`, no-results `zzzzzzzz`, and repopulated-after-no-results each passed every desktop/mobile × light/dark × OS motion/reduced-motion checkpoint under `defaults`, `maximal`, `compact`, `reading`, and `diagnostics`: **160 state/media rows**, `RESULT snap-matrix variants=8 failed=0` for each `side-eye-command-315-*-rerun` family.
- **Sam:** command is a real named combobox/listbox. The canonical semantic walk shows `aria-activedescendant` equals the selected option id at initial open, after ArrowDown, filtered one-result, and repopulation. No-results correctly clears both active descendant and options. Final ARIA exposes `dialog Jump to… → combobox Command palette → listbox Suggestions → option Analytics [selected]`.
- **Casey:** mobile compact input is a real `274 × 44` CSS px; dialog `366 × 355`; no dialog overflow. The 44px floor is met.
- **Contrast and geometry:** input contrast is `14.25:1 PASS`; desktop final dialog overflow is `0×0`.

## Taste & flow

The normal palette is good: restrained, legible, and immediately tells a cold user both the purpose and the first action. The mobile sheet has sensible breathing room and does not become a card zoo. The post-#355 compact empty state is centered and balanced. No duplicated home for command navigation was observed.

## Console triage

The first cold canonical defaults attempt saw Vite `504 Outdated Optimize Dep` requests. The warm rerun passed all 160 rows, so that is Vite optimizer churn, not a product error. Matrix-only slow-input/frame messages were not forwarded: their stable interaction check passed and the warnings occurred during cold/multi-browser setup, not the warmed command action. The final semantic receipt had zero errors and one `0.0047` input-adjacent shift explicitly excluded by the instrument.

## Coverage

| Instrument / arm | Status |
| - | - |
| Five appearance presets × 8 media arms × four Command states | RAN — `reports/snaps/side-eye-command-315-{defaults,maximal,compact,reading,diagnostics}-rerun-*` (160 rows, all pass) |
| Explicit full-motion app arm | RAN — `--full-motion` on every matrix invocation |
| ARIA/map/JSON/contrast | RAN — `reports/snaps/side-eye-command-315-semantic.{png,json}` |
| PNG reads | RAN — mobile normal `side-eye-command-315-mobile-geometry.png`; compact no-results receipt above |
| Mobile floor / overflow | RAN — `side-eye-command-315-mobile-geometry.json` (`44px`, `0×0`) |
| App theme Light / none | RAN — `final-611-command-theme-{Light,none}.{png,json}` |
| Pane-state matrix | RAN — `final-611-command-pane-portal-clean` and `final-611-command-focus-portal`; dialog remains independent with zero overflow |
| Error / Retry / repopulation | RAN — `final-611-command-forced-error`, `final-611-command-error-retry-recovery`, and `final-611-command-trigger-state-keyboard-aria` |
| Keyboard Escape focus return | RAN — `final-611-command-keyboard-focus-walk-exact.json` |
| Coarse hit geometry | RAN — `final-611-command-coarse-hit-control.json`; close/input/fully visible options meet 44px and own sampled edges |
| Motion / perf / `__orb` | RAN post-ready — non-virtualized CLS 0 and compositor clean; input-adjacent list population is excluded by instrument contract |
| design-audit desktop/mobile | RAN — `reports/design-audit/final-611-command-{desktop,mobile}.json`; every lead is reproduced and classified in the integrated report |
| Lighthouse desktop/mobile | SKIPPED — no lighthouse MCP exposed in this lane |

Lighthouse is a tool limitation, not a pass. The product HOLD is #363, not an unclassified detector or a
missing visual matrix row.
