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
- Room at 300% on the phone (step 4 side-eye P2-3), now in `QUALIFIED.room`, green on Chromium and WebKit. Red before on both: the message list measured 0px tall on Chromium and the message field was cut by the viewport on WebKit, its placeholder breaking mid-word.
  - The message list keeps `height.room-thread-min` (1.4375rem, one body line) from the room thread and its flank row; the room surface scrolls instead of overlapping when the floors cannot all fit. Measured on 390x844 at 300% with the composer's two rows: about 80px is left for the transcript, which is 1.67rem of the enlarged root, so one line is the largest floor that fits; 1.5rem measured 1px too tall.
  - The message field keeps `dimension.composer-field-min-ch` (12ch). The input row measures whether the door, the field at that minimum and Send fit (`use-composer-field-wrap.ts`); when they do not, `data-field-wrapped` switches `globals.css` to a grid with the field on the first row and the door and Send on the second. The DOM order is unchanged, and the switch is measured, not a container step, so default narrow phones keep one row. At 300% on the phone the 12ch minimum (360px) is wider than the 328px row, so the field's own minimum drops to 0 while wrapped and it fills the row.
  - Desktop 300% passes the same case, with the same layout.
- Step 4 side-eye P1-1, Characters list at 200% on the phone (`QUALIFIED.charactersBand`): the case now also asserts a character row is in the viewport. Red before on Chromium and WebKit (the scroller measured 0px tall). The Characters library pane scrolls (`overflow-y-auto`) and its list body keeps a `--height-scroll-md` floor (`character-library-surface.tsx`), so the chrome no longer takes the whole pane. Green on Chromium and WebKit.
- Step 4 side-eye P1-2, room header at 200% on the phone (`QUALIFIED.roomHeader`): Members and Memory are `topbar.trail` widgets now (`chat-room-chrome.tsx`), ordered last with Members before Memory, so the trail's one overflow row moves Memory into "More top bar actions" first and Members next and the trigger never leaves the row. Members' menu item opens the Members tab. Memory's menu item opens a dialog that holds the same recall summary, host detail and turn-on door as the chip's popover (`chat-recall-indicator.tsx`, `recall-requests.ts`). Their resting place moves from the header lead to the trail at every width. Red before on Chromium and WebKit: Memory — idle at x 358 and More top bar actions at x 462 in 390px. Green on both. The topbar CSS keyed on the chip being in the identity (`chrome.css`) and the phone topbar case in `app-shell-topbar.ct.tsx` were updated to the new home.
- Open, step 4 side-eye P2-3, room at 300%: the transcript floor and the placeholder wrap are not done. Measured here: on WebKit at the phone 300% the message field is 54% in the viewport because its column is one character wide and the placeholder wraps one letter per line.
