---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: off-grid-text on the rails and Characters, Chat, Config

## What

The design audit rule off-grid-text fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint original-context/tabs-0/2/dialog-0 at \[data-slot=dialog-footer] > button.inline-flex\[data-slot=button]:nth-of-type(1); Chat: checkpoint message-operations/reaction-added at \[data-slot=message-reaction-pill] > span:nth-of-type(1); Config: checkpoint config/world-info-details at \[data-slot=dialog-footer] > button.inline-flex\[data-slot=button]:nth-of-type(1). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The off-grid-text finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Adjudicated from the three named runs: 1,443 design-audit JSON files, 190 finding occurrences, 13 distinct subjects, all of them painted inside a `backdrop-filter` layer, at DPR 1.

- Rule: `tooling/src/ui-audit/lib/checks-grid.ts:66` (`checkOffGridText`, P2), fed by `tooling/src/ui-audit/ops/walker/census-grid.ts:142-184`. Its own message states the repair site: "the repair is at ${promotedBy}, not here".
- Owner of every subject: the promoting layer named below, never the text. The Law 3 rule `tooling/src/ui-audit/lib/checks-grid.ts:83` files that layer directly, and does so in the same case.

| Subject | Occurrences | Text | Landing (device px, DPR 1) | Promoting layer | Class | Mechanism |
| - | - | - | - | - | - | - |
| `[data-slot=dialog-footer] > button(1)` | 55 | 15px | top -0.500 / left 0.000 | `[data-slot=dialog-footer]` | b | inherits the footer's own off-grid landing |
| `[data-slot=textarea-root]` | 41 | 15px | top 0.000 / left -0.406 | `[data-slot=composer]` | b | inherits the composer's landing |
| `[aria-label=Message]` | 20 | 15px | top 0.000 / left -0.406 | `[data-slot=composer]` | b | inherits the composer's landing |
| `[data-slot=message-reaction-pill] > span(1)` | 18 | 13px | top 0.250 / left -0.406 | `[data-slot=message-footer]` | b | footer x + pill line-box quarter pixel |
| `[data-slot=message-reaction-pill] > span.font-sans[data-slot=text](2)` | 18 | 10.5px | top -0.250 / left -0.406 | `[data-slot=message-footer]` | b | footer x + pill line-box quarter pixel |
| `[data-slot=dialog-footer] > button(2)` | 12 | 15px | top -0.500 / left 0.000 | `[data-slot=dialog-footer]` | b | inherits the footer's own off-grid landing |
| `[data-testid=databank-scrape-submit]` | 4 | 15px | top -0.500 / left 0.000 | `[data-slot=dialog-footer]` | b | inherits the footer's own off-grid landing |
| `message-name-row > message-attribution > span(1)` | 4 | 13px | top 0.000 / left -0.391 | `message-name-row` | b | inherits the name row's landing |
| `message-name-row > message-metadata-timestamp (font-mono)` | 4 | 13px | top 0.000 / left -0.391 | `message-name-row` | b | inherits the name row's landing |
| `theme-scope > message-name-row > message-attribution > span(1)` | 4 | 13px | top 0.000 / left -0.406 | `message-name-row` | b | inherits the name row's landing |
| `[data-slot=message-attribution] > span.font-sans[data-slot=text](1)` | 4 | 13px | top 0.000 / left -0.391 | `message-name-row` | b | inherits the name row's landing |
| `[data-slot=message-metadata-timestamp]` | 4 | 13px | top 0.000 / left -0.391 | `message-name-row` | b | inherits the name row's landing |
| `[data-slot=dialog-footer] > p.font-sans[data-slot=text](1)` | 2 | 10.5px | top -0.500 / left 0.000 | `[data-slot=dialog-footer]` | b | inherits the footer's own off-grid landing |

Class b for all 13. Measured, not argued: in 188 of the 190 occurrences the same case carries a `promoted-layer-offset` finding whose landing fraction equals the text's to the last reported digit, and the promoting selector the finding names is that layer. 164 of 190 match on both axes at once. The remaining 2 are the dialog footers whose Law 3 row the run's representative cap withheld; their value (`top -0.500 / left 0.000`) is the value the footer's Law 3 finding reports in every other dialog case in these runs, including `[data-slot=dialog-popup]::before` and `[data-slot=alert-dialog-popup]::before`. So no subject owns a fraction: each is one rendered instance of a Law 3 finding already filed against its layer.

Two families upstream, both tracked by 2337, which files those layers as their own subject:

- The half-pixel vertical landing of dialogs. `[data-slot=dialog-popup]::before`, `[data-slot=alert-dialog-popup]::before` and `[data-slot=dialog-footer]` all land `top -0.500 / left 0.000`: a portalled popup centred in the window, where the centring halves an odd leftover. Floating-ui's positioner puts the box on the grid in x (every one of these reads left 0.000), which is why only y is off; see `.claude/rules/ui-and-client.md`.
- The pane and column x origin. `[data-slot=composer]` lands left -0.406 and `[aria-label="Chats details"]::before`, `Settings details::before` and the chat name rows land left -0.391, the same pair 2334 traces through the switch thumbs. Both are exact multiples of 1/64 device px, the granularity of a glyph advance width, which is what the centreing inputs resolve through: `--reading-measure: 75ch` (`packages/ui/src/styles/theme.css:369`) and the viewport-percentage shell width (`packages/client/src/styles/globals.css:521`). The `round(down, ..., var(--dimension-device-pixel))` guards at `packages/client/src/styles/globals.css:141` and `:153` floor the start margin inside those columns and cannot remove a fraction the column starts with.

The one axis no ancestor owns is the pill text's own ±0.25 device px: `13px` and `10.5px` inline text inside the footer's layer, where the count label's line box resolves between pixels. That is Law 1's arithmetic (`docs/law/integer-line-boxes.md` §3) and the declared residual of §2 for user-owned multipliers, not an authored offset; `10.5px` is `--text-micro` resolving at the root font size, and the pill takes its height from the resulting line box.

Engine: the fix that removes this whole cohort without blinding the rule is the attribution change written up in 2334 — a Law 4 subject whose landing equals its promoting layer's lands belongs collapsed under that layer's Law 3 finding, with the count still printed per §11 so the cohort cannot leave the denominator.
