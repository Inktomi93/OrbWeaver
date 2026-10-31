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
- Import dialog at 300% on the phone: the dialog viewport gutter steps down to the field inset under the `inline-narrow` token condition (`breakpoint.inline-narrow`, 30rem) (`packages/ui/src/primitives/dialog/variants.ts`), so a 390px phone keeps a readable width. Red before: the exits sat past the viewport. Pinned in `QUALIFIED.importDialog`, green on Chromium and WebKit.
- Composer, all cases: when the utilities row is wider than its room, its actions move into the Message tools menu's Reply group in a fixed order. Try another reply and Continue the reply move first, then Draft your line (a submenu of the three persons). Generate reply and the Message tools door never move. The hook is `packages/client/src/features/chat/hooks/use-reply-row-overflow.ts`; the menu rows are in `composer-utility-menu.tsx`. While an impersonation stream runs, Draft your line stays in the row so its Stop control stays reachable.
- Measured moves in `QUALIFIED.room`, green on Chromium and WebKit: desktop at 200% moves nothing; phone at 200% moves Try another reply and Continue the reply; desktop at 300% moves all three. Red before: Generate reply and Continue the reply past the edge on the phone at 200%, and Generate reply past the edge at 300% (x 446 of 390 on the phone, x 1376 of 1440 on the desktop) once only the two secondary replies had moved. Each case also opens the menu and finds the moved rows by their production names, checks that each action is in the row or in the menu, never both, and that Generate reply is never in the menu.
- Measured floor, phone at 300%: on Chromium all three actions move and the case passes, but on WebKit the message field is only 54% in the 390x844 viewport. With the options door and Send at 96px each the field column is about one character wide, so its placeholder wraps one letter per line and the field grows past the viewport. Generate reply and the menu door fit. That case is left out of `QUALIFIED.room` and stays open here: the message row needs its own decision, not another move from the utilities row.
- Composer suite flake: `tests/client/features/chat/components/platform-composer-terminal-action.suite.ct.tsx` was run with `--repeat-each=10` on main (a detached worktree of main, 6ff0731467) and on this branch, Chromium, `CT_PORT` apart, load under 24. Main: 4 of 20 runs failed, all in the touch variant ("by touch"; the keyboard variant passed 10 of 10). Branch: the whole file passed 20 of 20 once, then the touch variant alone failed 4 of 10 and 3 of 6 on later runs. It flakes on both sides at about the same rate, in the touch variant only, so the overflow measurement is not the cause. The failures time out at 30s in `revealByTouch`: at the hit-point poll (line 105), at the `scrollend` wait after the pan (line 107), and at the closing `toHaveCount(0)` (line 185). I replaced the `scrollend` wait with a listener attached and confirmed before the pan; it still timed out, so a late listener is not the cause and I reverted it. The pan itself does not always scroll the menu popup in the short keyboard host. The cause is not located and no product timing bug was found; the test is unchanged.
