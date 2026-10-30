---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: css-system
---

# Repair the shell, composer and dialog layouts at 200% and 300% text

## What

Repair the defects that `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` found at enlarged text (item 1299 Evidence lists each case). Rulings:

- Topbar at 300% (Show details, Report a bug past the edge) and the desktop Context panel header at 200% (Character actions, Close details, token hint past the edge): actions that do not fit move into the header's overflow menu. They never wrap or clip.
- Composer at 200% on a phone and 300% everywhere: the two-row composer ruling stands. Secondary actions (Try another reply, Continue the reply) move into the composer menu when they do not fit; Generate reply stays visible.
- Room at 300%: Jump to latest renders above the flank row and is never clipped by it.
- Characters list band at 200% on a phone: Import, New character and Show details drop below the header and sit under the Search field (hit test finds them covered). They stay reachable and uncovered, moving into the band's overflow menu when they do not fit.
- Import dialog at 300% on a phone: the dialog viewport gutter steps down at narrow inline sizes through a token condition, so the dialog keeps a readable width.

## Why

Item 1299 requires the topbar, panels, room and dialogs to stay usable at 200% and 300% text. These are the failures its probe recorded.

## Done when

Each listed case is added to the text-scale suite and passes on Chromium and WebKit at 390x844 and 1440x900, and the probe's planted overflow control still fails.

## Evidence

- Added to `QUALIFIED` in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx`, green on Chromium and WebKit: the topbar at 300% on the desktop (red before: Show details and Report a bug past the edge, clipped on x), the phone Characters band at 200% on a phone (red before: Import, New character and Show details covered by the Search field), and the Context panel header at 200% on the desktop.
- The Context header case was not red for the ruled defect on this tree: no action is reported past the edge. Its only finding was tabs scrolled out of their own scroller, which the probe's hit test counted as covered. `clippedControls` now skips the hit test for a control its own scroller reaches by scrolling, which is the rule its header already states for the clip check. Review that probe change before landing.
- The probe's planted overflow control: the suite has none beyond the red runs above; the topbar and band cases failed on the old tree for the recorded reason.
- Open: Jump to latest above the flank (`message-list-surface.tsx`), the dialog gutter token (tokens tree) and the composer's secondary actions.
