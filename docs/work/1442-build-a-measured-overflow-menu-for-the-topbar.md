---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: css-system
---

# Build a measured overflow menu for the topbar trail, Context header and list band actions

## What

Give the shell's action rows one overflow mechanism. When the topbar trail, the Context panel header or a list band runs out of inline space, the actions that do not fit move into a "More" menu at the row's end, never wrapping, clipping or sliding under a neighbour.

Design (ruled):

- Each action in these rows declares a menu form beside its inline form: label, icon and the same handler. Registry-driven topbar trail widgets declare it on their registry entry, so a new widget cannot ship without one.
- The row measures with a `ResizeObserver` on its own container (not a viewport media query), keeps actions inline in their declared priority order while they fit, and moves the rest into the menu. The "More" trigger is always reserved.
- One shared hook and one menu component own the measuring and rendering. The topbar, the Context header and the list band use it; none hand-rolls its own.
- Keyboard and screen-reader order follow declared priority, and focus stays on the trigger when an action moves between inline and menu.

## Why

Item 1438 rules that these actions overflow into a menu at enlarged text, and item 0884 moves panel toggles into the panel headers. Neither can land without the mechanism. At 200% text on a phone, Import, New character and Show details already sit under the Search field.

## Done when

The 1438 topbar, Context header and list band cases pass in `QUALIFIED` in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` on Chromium and WebKit at 390x844 and 1440x900. A production-mounted CT proves an action moves into the menu as the row narrows, back out as it widens, keeps its handler, and keeps focus on the trigger.

## Evidence

- Built: `OverflowActions` in `packages/client/src/components/overflow-actions.tsx` (one hook-and-menu component). The row observes its own box and each action with a `ResizeObserver`, keeps actions inline in declared order while they fit, and moves the first that does not fit, and every action after it, into a "More" menu. An action that moved stays mounted, out of flow and `inert`, so its dialogs keep their state and its width stays measurable. Focus on an action that leaves the row moves to the trigger.
- Registry: `TrailWidgetBehavior.useMenuForms` in `packages/client/src/state/chrome-registry.ts` is required on every `topbar.trail` widget; `tests/client/state/chrome-registry.dom.test-d.ts` pins that a trail widget without one does not type-check. The five trail entries declare one: the context toggle (same handler), the Characters doors (a request channel into the mounted dialogs, `features/character/lib/character-door-requests.ts`), and the notifications, bug report and plugin commands entries, which open the You sheet that carries their lens. The command modal entry derives its form from its modal behavior.
- CSS: `shell/chrome.css` makes the lead the first shrinker and drops the wrap; the trail row takes its width from its own flex-basis. The narrow title floor now caps at a share of the column so a 300% column cannot push the trigger past the edge.
- Test: `tests/client/features/app-shell/surfaces/platform-topbar-overflow.suite.ct.tsx` (Chromium and WebKit) narrows by text scale: the action leaves the row, focus lands on the trigger, the menu entry keeps its handler, the row widens and the action returns. `app-shell-topbar.ct.tsx` now pins that the Characters doors ride the menu at 320 and sit inline at 390.
- Not built, open on this item: the Context panel header and the list band. The Context header needs no overflow today: its tab strip is the row's shrinker (`min-inline-0`) with its own tab chooser, and the pane's one actions node and its dismiss follow it; the 200% probe finds no action past the edge. The list band's `action` is a `ReactNode` carrying dialogs, a popover (Refinery's start picker) and a maintenance menu (Databank), so each site needs its own declared menu form before the band can use the row.
