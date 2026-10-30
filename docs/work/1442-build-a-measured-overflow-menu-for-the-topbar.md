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

Filled at landing: what ran and where its output is.
