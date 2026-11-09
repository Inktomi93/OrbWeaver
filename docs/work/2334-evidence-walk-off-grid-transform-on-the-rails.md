---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: off-grid-transform on the rails and Characters, Chat, Config

## What

The design audit rule off-grid-transform fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/home.jump/3 at div.grid\[data-slot=setting-row-group]:nth-of-type(1) > div.grid\[data-slot=setting-row]:nth-of-type(2) > div.flex\[data-slot=field-root]:nth-of-type(1) > div.flex; Chat: checkpoint context-chat_00000000000000000000000420/tabs-0/1/disclosure-9 at div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex\[data-slot=field-root]:nth-of-type(2) > div.flex\[data-slot=field-control-col]:nth-of-type(2) > span.; Config: checkpoint config/personas-Your personas-landing at \[data-slot=switch-thumb]. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The off-grid-transform finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Adjudicated from the three named runs: 1,443 design-audit JSON files, 392 finding occurrences, 12 distinct subjects. All 12 are `[data-slot=switch-thumb]`. No other element on these surfaces carries a rest transform.

- Rule: `tooling/src/ui-audit/lib/checks-grid.ts:109` (`checkOffGridTransform`, P3), fed by `tooling/src/ui-audit/ops/walker/census-grid.ts:285-324`. It judges the absolute landing of any visible element that carries a transform at rest, and never compares it to the landing the element's own transform produced.
- Owner of every subject: `packages/ui/src/primitives/switch/variants.ts:147` (`data-checked:translate-x-(--size-switch-travel)`).

| Subject | Occurrences | Landing (device px, DPR 1) | Cause arm | Class | Mechanism |
| - | - | - | - | - | - |
| `[data-slot=switch-thumb]` (Config panes, unqualified) | 121 | left -0.391 / -0.406, top 0.000 | resting translation | b | inherited pane fraction |
| Config `setting-row-group > setting-row(2) > field-control-col` thumb | 68 | left -0.406, top 0.000 | resting translation | b | inherited pane fraction |
| Config `setting-row-group > setting-track-row(1) > field-control-col` thumb | 60 | left -0.406, top 0.000 | resting translation | b | inherited pane fraction |
| Config `setting-row-group > setting-row(1) > field-control-col` thumb | 48 | left -0.406, top 0.000 | resting translation | b | inherited pane fraction |
| `[aria-label="Allow background work on Built-in embeddings · jina-clip-v2"]` thumb | 21 | left -0.391, top -0.500 | resting translation | b | pane x + row-centred y |
| Add-connection `surface-root > field-root(1) > switch-root(2)` thumb | 20 | left -0.406, top 0.000 | resting translation | b | inherited pane fraction |
| Chat disclosure `field-root(2) > field-control-col` thumb | 14 | left -0.391, top 0.000 | resting translation | b | inherited pane fraction |
| Presets rack `[aria-label="Main enabled"]` thumb | 11 | left -0.391, top 0.000 | resting translation | b | inherited pane fraction |
| `[data-slot=rpg-game-tab] ... switch-root(2)` thumb | 10 | left -0.391, top 0.000 | resting translation | b | inherited pane fraction |
| Presets rack `[aria-label="Post-history enabled"]` thumb | 9 | left -0.391, top 0.000 | resting translation | b | inherited pane fraction |
| `[data-slot=group-config-form] > field-root(3)` thumb | 7 | left -0.391, top 0.000 | resting translation | b | inherited pane fraction |
| `[data-slot=regex-member-editor] ... field-root(1)` thumb | 3 | left -0.406, top 0.000 | resting translation | b | inherited pane fraction |

Every one of the 392 occurrences reports the same computed value, `translate: 16px scale: none`, and the same cause arm, `a resting translation`; there is no resting-scale finding in these runs.

Class b for all of them, by arithmetic on the reported numbers. The translation carries an integer x component (16) and no y component, so the reported landing equals the landing the box had before its own transform: the fraction pre-exists the transform. The knob's relative geometry is whole by construction (`packages/ui/src/primitives/switch/variants.ts:59-63` makes the centred difference exactly `2 × --size-switch-inset`), and that header already rules the absolute landing belongs to the ancestors: "NOT fixed here and not this control's to fix: the element's ABSOLUTE landing, which is its ancestors'" (`packages/ui/src/primitives/switch/variants.ts:69-71`). `docs/law/integer-line-boxes.md` §9 names the same dependency: runtime pixels depend on the element box, the root font size and the device pixel ratio.

The pane owns the fraction. The same two x values recur unchanged across whole panes and are reported by the Law 3 rule in the same cases against the panes' own glass layers: `[aria-label="Settings details"]::before`, `Chats`, `Characters`, `Presets`, `Corpus`, `Refinery` and `Databank` details all land left -0.391, and `[data-slot=composer]` lands left -0.406. Two origins, not twelve: the details pane and the chat column each start between device pixels and every descendant inherits it. Both fractions are exact multiples of 1/64 device px, the granularity of a glyph advance width, which is what the centreing inputs resolve through: `--reading-measure: 75ch` (`packages/ui/src/styles/theme.css:369`) and `--width-shell-content: clamp(..., calc(var(--appearance-chat-width-pct) * 1dvw), ...)` (`packages/client/src/styles/globals.css:521`). The existing `round(down, ..., var(--dimension-device-pixel))` guards (`packages/client/src/styles/globals.css:141` and `:153`) floor the start margin inside the pane; they cannot remove a fraction the pane itself starts with. Tracked by 2337, which files those layers directly.

Swept for an authored offset on these chains, and found none: 13 matches over 2,229 tracked TS/TSX files under `packages/client/src` and `packages/ui/src` for `translate-[`, `translate-x-1/2`, `translate-y-1/2`, `translateX(`, `translateY(`, `matrix3d`, `transform={` (hits are the invisible touch-target pseudo in `packages/ui/src/lib/selection-control.ts:13`, drawer and tab motion skins, and SVG art and charts); 0 matches for `transform: $$$` in either language with `ast-grep`; 17 matches over 21 tracked CSS files for `.5px`, `/ 2)` and `translate(` (the two `round()` guards above, `packages/ui/src/styles/waystone.css:17` and `:20` inside `@keyframes` — motion, which §9 allows — icon stroke widths, and glyph, avatar and notice centring halvings on surfaces outside this population).

## Engine change proposed

Attribute the fraction to whoever creates it, then judge only that. `tooling/src/ui-audit/ops/walker/census-grid.ts:107-132` already parses the matrix's tx and ty and throws both away into a boolean `translated`; carry them into `OffGridTransformInput` and let `checkOffGridTransform` exclude a unity-scale, integer-translation subject with a named reason (`integer-transform-inherits-ancestor-landing`), counted in `relationalAccounting` so the cohort cannot leave the denominator silently, as §11 requires. A resting scale keeps firing regardless, and an authored fractional translation (`translate: 0.5px`, `translate-x-1/2` on an odd box, a `calc()` ending in `.5`) still fires because its own tx or ty lands off-grid. Fixture: `tests/tooling/ui-audit/lib/checks-grid.test.ts`. The same attribution settles off-grid-text: see 2333.
