---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-a18d3a4c83c54f7cb
plan: cross-surface-consistency
---

# A 390 phone at 300% browser text keeps a usable transcript

## What

At 300% browser text on a 390x844 phone, the chat topbar and composer leave almost no transcript port, measured while fixing the reading-row hold.

## Why

A reader at large text sees the chrome and almost none of the conversation.

## Done when

At 390x844 and 300% text the transcript keeps a stated minimum port, from a ruling in the density law, with a CT that measures it and is red on the current tree.

## Evidence

Closed as a refusal, by owner ruling.

The rule is in `docs/law/ui-platform-rulings.md` §8.1, the shell-short bullet: a room's transcript never drops below its short-room floor. `packages/client/src/styles/globals.css` sets that floor to `--height-scroll-sm`, which is 10rem. The room keeps its visible name line on a phone 16rem wide or less, because the 300% rendered review in `539e0343ad` blocked a screen with no visible name. The composer keeps its full height.

These are the measurements on main at 390x844, with browser text set through the CDP door that `setPlatformTextSize` uses:

| Text | Transcript port | Topbar | Composer |
| - | - | - | - |
| 1x | 672 | 48 | 106 |
| 2x | 342 | 144 | 322 |
| 3x | 480, the 10rem floor | 216, the control row and the name line | 446 |

With the name line kept, the 3x port can be at most 844 − 216 topbar − 132 composer touch row − 18 field gap = 478. The tree already gives 480, so no change can grow it without dropping the name line or the composer. A CT that is red on the current tree cannot exist under this ruling.

Proposed items for the orchestrator to file:

1. Avatar touch floor under enlarged text.
   - What: below the `cq-16` step, the transcript avatar chip is the enlarged `size.avatar-sm` (30px at 125% text on a 320 phone), and it has no 44px reach.
   - Why: a reach on the rem touch token splits words (2271 B3). A touch pseudo sized on the physical 44px floor would cost about 2px of inset.
   - Done: a ruling on a physical-floor variant of `TOUCH_TARGET_PSEUDO` below `cq-16`, and a CT cell at 320 with 125% text.
2. The design-audit line-length rule skips truncated single-line runs.
   - What: the line-length rule counts single-line, truncated, `aria-hidden` facet previews (103–104 characters) as prose lines.
   - Why: they have no line return, so a measure cap does not apply, and they raise false findings (2271 B5).
   - Done: the rule excludes single-line runs with `text-overflow: ellipsis`, with a fixture that proves it.
