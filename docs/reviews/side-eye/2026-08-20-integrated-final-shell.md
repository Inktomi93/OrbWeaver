---
kind: review
status: archived
updated: 2026-08-21
---

> Codex-authored side-eye review, recovered untracked at the Codex decommission (2026-08-21, #400).
> Original status: `active-hold` — Codex verdict: HOLD the integrated graduation. ref: `6117549056cfb1946143b85d8b12304591b00787`. product_ref: `2d0b176d22c1d52f2bdb35fa1d9f84df3de51124`.

# Integrated shell final re-verification

## Decision

**HOLD the integrated graduation.** The seven available non-chat surfaces are visually sound on the
final product tree, but Command advertises a keyboard shortcut it does not implement (#363, P2). Chats
remain deliberately withheld until #206 merges, so this is not a claim about Chats.

`6117549056cfb1946143b85d8b12304591b00787` is the scored final ref. It changes agent routing, docs and
configuration tests only. The exact provenance check
`git diff --name-only 2d0b176d2..611754905 -- packages/client packages/ui packages/workspace` returned
zero paths. Product receipts captured at `2d0b176d2` therefore remain byte-applicable; every newly driven
receipt below used the warm private `611754905` stage at `http://localhost:5273`.

| Target | Verdict | Reason |
| - | - | - |
| #274 notice band | SHIP | Existing one/many flow-band receipts remain applicable |
| #277 trailing Configuration actions | SHIP | Final coarse/fine action receipts remain applicable |
| Presets | SHIP visually | Five preset families, theme arms, panes, coarse geometry, contrast and controlled instruments hold |
| Databank | SHIP visually | Empty state is intentional and clear; all final rows hold |
| Regex | SHIP visually | Dense raw-pattern list remains scannable; all final rows hold |
| World Info | SHIP visually | Clear hierarchy and stable mobile actions; all final rows hold |
| Theme picker | SHIP visually | All final rows, exact focus/Escape and portal independence hold |
| Theme builder | SHIP visually | Honest draft status, all final rows, exact focus/Escape and portal independence hold |
| Command | HOLD on #363 | Click path and modal behavior hold; advertised Meta/Control+K does nothing |
| Chats | WITHHELD | Awaiting #206; not scored here |

## Final matrix

Every named family is `defaults`, `maximal`, `compact`, `reading`, and `diagnostics`; every family is
desktop/mobile x OS light/dark x OS motion/reduced-motion with the app forced to full motion. There was no
byte-equivalence shortcut for the newly driven rows.

| Surface | Final family receipts | Result |
| - | - | - |
| Command | `reports/snaps/final-2d0b-command-{defaults,maximal,compact,reading,diagnostics}-matrix-dynamic-*` | 5 x 8 pass |
| Configuration | `reports/snaps/integrated-2d0b-config-*-final*` and the final Configuration matrix family | 5 x 8 pass; #277 coarse/fine control holds |
| Presets | final 2d0 preset matrices | 5 x 8 pass |
| Databank | final 2d0 databank matrices | 5 x 8 pass |
| Regex | 2d0 defaults plus `reports/snaps/final-611-regex-{maximal,compact,reading,diagnostics}-matrix-*` | 5 x 8 pass |
| World Info | `reports/snaps/final-611-world-info-{defaults,maximal,compact,reading,diagnostics}-matrix-*` | 5 x 8 pass |
| Theme picker | 2d0 defaults plus `reports/snaps/final-611-theme-picker-{maximal,compact,reading,diagnostics}-matrix-*` | 5 x 8 pass |
| Theme builder | `reports/snaps/final-611-theme-builder-{defaults,maximal,compact,reading,diagnostics}-matrix-*` | 5 x 8 pass |

The warm 611 continuation added 144 fresh matrix cells: Regex 4 x 8, World Info 5 x 8, Theme picker 4 x 8,
and Theme builder 5 x 8. Each family completed with zero overflow failures. Representative desktop and
mobile PNGs were read subjectively, not merely emitted. Presets is direct and calm; Databank's empty state
is intentional; Regex is dense but legible; World Info is balanced; picker and builder avoid card-zoo
slop; Command's empty/error states stay centered and coherent.

## Confirmed finding: #363

### \[P2] Advertised Command keyboard shortcut does nothing

The desktop trigger visibly says `⌘K`, but both Meta+K and Control+K leave the modal closed. This is a
broken visible interaction promise, not a platform-key ambiguity. The pointer path works and the modal's
subsequent keyboard behavior works, so P2—not P1—is appropriate.

- Meta+K: `reports/snaps/final-611-command-shortcut-focus-walk.json` times out with `{ open: false }`.
- Control+K: `reports/snaps/final-611-command-shortcut-focus-walk-control.json` has the same result.
- Working control: `reports/snaps/final-611-command-keyboard-focus-walk-exact.json` opens from the real
  trigger, Tabs to `Search commands`, ArrowDown links `aria-activedescendant` to the selected option, and
  Escape restores visible focus to `⌘K jump — the command menu`.
- Root cause: `packages/client/src/features/app-shell/surfaces/app-shell.tsx:98-139` renders `<Kbd>⌘K</Kbd>`
  but wires only `onClick`. A two-method sweep across 1,010 tracked client TS/TSX files found no Command
  shortcut listener; the only Meta/Control key handling found belongs to unrelated composer/member flows.

Issue #363 is filed and claimed. The fix must add the actual application shortcut and re-run both shortcut
arms plus the exact click/keyboard control above; removing the visible shortcut is not equivalent UX.

## Command state, semantics and recovery

- Semantic map: `reports/snaps/final-611-command-map-aria.json` exposes a named combobox/listbox/options,
  37 semantic elements and zero DOM fallbacks.
- Forced failure: `reports/snaps/final-611-command-forced-error.{png,json}` renders
  `Couldn't load recent threads.` and a Retry action. Its red exit is the deliberately injected fetch
  error; assertions pass.
- Recovery: `reports/snaps/final-611-command-error-retry-recovery.{png,json}` fails the first three recent
  requests, then Retry repopulates the list and exposes Home; dialog overflow is zero.
- State walk: `reports/snaps/final-611-command-trigger-state-keyboard-aria.json` proves filtered Analytics,
  zero options for `zzz`, then 31 repopulated options.
- Exact focus walk: `reports/snaps/final-611-command-keyboard-focus-walk-exact.json`. Initial modal-body
  focus is the ruled modal-host behavior, one Tab reaches the input, ArrowDown updates selection/ARIA, and
  Escape returns focus to the actual trigger.
- Mobile no-matches: `reports/snaps/final-611-command-no-matches-mobile.{png,json}` has zero options,
  `No matches.`, no overflow and 14.25:1 input contrast.

## Theme, pane, focus and coarse-pointer arms

All seven non-chat surfaces were captured under both explicit `--theme Light` and `--theme none`:
`reports/snaps/final-611-{presets,databank,regex,world-info,theme-picker,theme-builder,command}-theme-{Light,none}.{png,json}`.
The Light screenshots are genuinely light and readable; `none` resolves to the shipped default rather than
silently aliasing a named theme.

List-hidden and focus-mode states were driven for Presets, Databank, Regex and World Info. The shell
correctly docks context when list is hidden and collapses both side panes in focus mode. Portal controls
for Theme picker, Theme builder and Command stay geometrically independent of both pane states. Valid
receipts are the `final-611-*-pane-list-hidden-clean`, `final-611-*-pane-portal-clean`, and
`final-611-*-focus-portal` families; earlier red `detail-shown` attempts asked for an impossible shell
combination and are not evidence.

Actual coarse-pointer edge ownership—not only CSS boxes—passed:

- `final-611-presets-coarse-hit-control.json`: import 48x48, New/search 44px high, row/radio 48px; all
  sampled edges owned.
- `final-611-databank-coarse-hit-control.json`: maintenance 48x48; Add/search/empty-state CTA 44px high;
  all sampled edges owned.
- `final-611-regex-world-coarse-hit-control.json`: group rows and all six trailing actions are at least
  44px and own all sampled edges.
- `final-611-theme-picker-coarse-hit-control.json`: close/New/theme rows are 48px or taller and own all
  edges.
- `final-611-theme-builder-coarse-hit-control.json` plus
  `final-611-theme-builder-input-coarse-hit-control.json`: close, Back, visible ColorFields and Theme name
  meet the floor and own all edges.
- `final-611-command-coarse-hit-control.json`: close, 274x44 input and the fully visible 302x44 options
  own their edges. A partially clipped fourth option was intentionally excluded from the verdict.

Theme focus controls are exact: `final-611-theme-picker-keyboard-focus-exact.json` walks modal body → Reset
to Hearth → New theme → Escape back to Switch theme; `final-611-theme-builder-keyboard-focus-exact.json`
walks modal body → Close → Back and Escape returns to Switch theme. Every stop is `:focus-visible`.

## Contrast, motion and performance

Explicit contrast controls pass: Presets search 6.64:1 and title 15.85:1; Databank search 6.64:1 and empty
copy 17.67:1; Regex/World labels and actions 8.71:1; picker heading 14.25:1 and theme row 12.28:1; builder
input 9.82:1, Draft status 7.02:1 and ColorField control 14.25:1; Command input 14.25:1. Receipts are the
`reports/snaps/final-611-*-contrast-control.json` family and Command no-matches control.

Post-ready full-motion controls reset `__orb` before the measured action. All seven surfaces are
compositor-clean and below the product gates:

| Surface | Desktop / mobile result |
| - | - |
| World Info | non-virtualized CLS 0/0; worst blocking 0/0ms |
| Regex | non-virtualized CLS 0.0059/0.0571; worst blocking 0/0ms |
| Theme builder | non-virtualized CLS 0/0; worst blocking 6/7ms |
| Theme picker | non-virtualized CLS 0.0011/0; worst blocking 0/0ms |
| Presets | non-virtualized CLS 0.0063/0; worst blocking 0/0ms |
| Databank | non-virtualized CLS 0/0; worst blocking 40/3ms |
| Command | exact state controls have non-virtualized CLS 0; input-adjacent list population is excluded by contract |

Receipts: `reports/snaps/final-611-*-motion-control-{desktop,mobile}.json`. Databank logged 109/114ms
LoAF duration but only 40/3ms blocking, below the >50ms blocking gate; cold-start Vite chatter was not
substituted for the post-ready controls.

## Design-audit triage

Fourteen final audits ran with `--fail-on P3`:
`reports/design-audit/final-611-{presets,databank,regex,world-info,theme-picker,theme-builder,command}-{desktop,mobile}.json`.
Their red exits are detector leads, not silently discarded findings:

| Lead | Reproduction and classification |
| - | - |
| Preset subtitle at 10.5px | **Accept as designed.** `final-611-presets-undersized-control.json` confirms 10.5px and 8.66:1, but this is secondary `aria-describedby` gloss under a 13px primary label, not a functional label. `packages/ui/src/styles/tiers.css:100-109` explicitly rules instrument-row subtitle/meta to the micro step. #277's 11px floor applied where 10.5px was the control's only visible label. |
| Flat type hierarchy | **Detector limitation.** The screenshots have clear hierarchy through weight, color, spacing and primary/secondary placement; the heuristic counts size steps only. |
| Duplicate action door in modals | **False positive.** The reported nodes are a generic dialog container and its child with concatenated dialog text, not multiple action controls. ARIA maps expose unique named actions. |
| Modal desktop line length | **False scope.** The selector points to the blurred Home card behind the modal, not modal content. |
| Theme builder off-screen nodes | **No verdict by design.** They are below the scroll viewport; mobile/desktop matrices and explicit scrolled controls cover the surface. |
| Configuration paragraphs at \~86 heuristic chars | **Accept as designed.** Live control `final-611-config-reading-measure-control.json` resolves `--reading-measure` to 75ch and the paragraph's computed width/max-width to 643.5px. `config-welcome.tsx:193-198,307-315` caps the prose on the line itself; the detector estimate is not the computed CSS measure. |

No P0/P1 or additional confirmed P2/P3/taste defect survived reproduction. Lower-severity detector output is
retained here rather than discarded.

## Limits

- Chats is withheld until #206 merges.
- Lighthouse desktop/mobile is **SKIPPED** because no callable Lighthouse MCP is exposed in this lane.
- Command's forced-error traces are expected red because the control deliberately injects failed network
  requests; behavioral assertions and the recovery receipt are the verdict.
- This report does not turn every populated library into a fabricated empty/loading state. Real Databank
  empty, Theme draft, Command error/loading/retry, and list repopulation transitions were exercised; the
  remaining libraries were assessed in their real populated state.
