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

- Added to `QUALIFIED` in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx`, green on Chromium and WebKit: the topbar at 300% on the desktop (red before: Show details and Report a bug past the edge, clipped on x), the phone Characters band at 200% (red before: Import, New character and Show details covered by the Search field) and the Context panel header at 200% on the desktop.
- The Context header case was not red for the ruled defect: its tab strip is the shrinker and has its own chooser, so no action sits past the edge (see 1442). Its only finding was tabs scrolled out of their own scroller, which the probe's hit test counted as covered. `clippedControls` now skips the hit test for a control its own scroller reaches by scrolling, the rule its header already states for the clip check. A planted case in the same suite (`_text-scale-probe-stories.tsx`) pins that a control clipped by an ancestor that does not scroll still fails and one its own scroller reaches passes.
- Jump to latest at 300% on the phone and desktop: `JumpToLatestPill` caps its width at the thread and wraps its label, so the flank row no longer clips it on x (red before: the pill was 446px wide in a 366px row). Pinned in `QUALIFIED.jumpToLatest`, green on Chromium and WebKit. The case measures the pill mounted-but-hidden, which has the box a pending arrival paints; the pill stays inside the thread rather than moving out of the flank row.
- Import dialog at 300% on the phone: the dialog viewport gutter steps down to the field inset under `shell-mobile` (`packages/ui/src/primitives/dialog/variants.ts`), so a 390px phone keeps a readable width. Red before: the exits sat past the viewport. Pinned in `QUALIFIED.importDialog`, green on Chromium and WebKit.
- Composer at 200% on the phone: Try another reply and Continue the reply move into the Message tools menu (Reply group) when the utilities row cannot seat them; Generate reply stays in the row (`composer-guided-cluster.tsx`, `composer-utility-menu.tsx`). Red before: Generate reply and Continue the reply past the right edge. Pinned in `QUALIFIED.room`, green on Chromium and WebKit.
- Open, ruling fork: the composer at 300%. After the ruled move Generate reply alone is still past the edge on the phone (x 446 of 390) and on the desktop (x 1376 of 1440), because the controls before it (Message tools, Draft your line) already span that width. The ruling cannot hold at 300% by moving those two actions. The next candidates are Draft your line into the same menu, or a third row, which the two-row ruling forbids. Owner decision needed; the room's 300% cases stay out of `QUALIFIED`.
