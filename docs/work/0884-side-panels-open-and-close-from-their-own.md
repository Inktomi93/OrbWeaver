---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Side panels open and close from their own edge

## What

The list and context toggles live in the center pane's top bar, so clicking one reflows the center pane and the button moves out from under the cursor; the context pane also has a header x (added by the 851/852 work) that does the same collapse as the toggle, so one action has two controls in two places, and the toggle icon does not show open versus closed state.

Order: build after item 1442 (the shell action overflow mechanism), because both change the same header chrome.

## Why

Owner: the toggles feel odd to click and the x duplicates the collapse control; do it properly once.

## Done when

Each side panel's collapse control sits in the panel's own header at the edge beside the content pane; a collapsed panel leaves a slim edge tab in the same screen position that reopens it, so open and close share one spot and nothing moves under the pointer; the center top bar carries only room controls; the docked x is gone and the floating overlay keeps exactly one dismiss; the control shows open or closed state with aria-expanded; phone behaviour, keyboard shortcuts and the panel motion spec are preserved; CTs pin that the control's screen position is unchanged across a toggle and that each panel has one control; the list pane, the Details pane and the plugin column all use the one `PanelEdgeControl` component from the plugin-strip work, and a CT pins each control's screen position across a toggle; a side-eye confirms desktop and phone.

## Evidence

- Built: `packages/client/src/features/app-shell/components/panel-edges.tsx` draws one `PanelEdgeControl` per desktop side panel at its screen-edge corner of the header row. The list uses `edge="start"`, Details uses `edge="end"`, and the plugin column keeps `FlankEdge`. The same node serves the docked and collapsed state. The topbar and the panel header keep a lane under it (`--panel-edge-reserve`, `--shell-topbar-lane-start` and `--shell-topbar-lane-end` in `panels.css` and `chrome.css`).
- The docked pane has no close of its own. On a desktop the edge control stays rendered while its panel floats as a sheet and is that sheet's one dismiss (`app-shell.tsx` passes the sheet-band close, `panel-overlay-close` or `context-bracket-dismiss`, on a phone only). The topbar lane is keyed on the panel being available, so nothing steps when a panel floats. A closed sheet hands focus back to the edge control through its focus-return marker.
- Split, with the reason: a phone keeps its topbar doors (the list-screen swap and the `contextToggleChrome` widget, now visible on a phone only). A fixed edge lane there takes 60px of a 320px row, which truncates the screen title in `platform-overflow-room.suite.ct.tsx` and covers the More trigger in `platform-text-scale.suite.ct.tsx`. Both suites were red with the lane and are green without it on a phone.
- Red then green: `tests/client/features/app-shell/surfaces/panel-edge-controls.ct.tsx` was red on the old tree (no `panel-edge-control` in the topbar or panel header, toggles in the topbar, a sheet with two dismisses). It is green with the change: one control per panel inside the panel header row, the topbar carries none, the box (x, y, width) is unchanged across hide and show for the list and Details, and an open sheet has one dismiss. `tests/client/features/plugin/components/context-panels.ct.tsx` pins the plugin column control across a hide and a show.
- Also green: the whole `tests/client/features/app-shell` tree on Chromium, the app-shell platform suites on WebKit (`pnpm test:ct:webkit`), and the panel motion spec (`app-shell-motion.ct.tsx`; the topbar lane stays constant so the FLIP counters nothing extra).
- Open: the side-eye for desktop and phone is scheduled by the coordinator.
- Side-eye follow-up, red then green in `panel-edge-controls.ct.tsx`: the control stays at the same box while a panel floats at 900px and closes the sheet (F4); a rail tooltip no longer covers the list control, since rail tooltips are non-hoverable and `pointer-events-none` (F2); each control precedes its panel body in the document and one Tab from the list control enters the list (F3); the list count keeps its width and the title is what truncates (F5); at 300% text nothing in the topbar sits under the Details control (F6).
- F6 fork: the chat header chips (Members, Memory) are fixed-size identity, not trail actions, so they cannot move into the overflow menu. Below 24rem of content column beside an edge control they are shed (`chrome.css`); their facts are Details tabs. Default kept; say if the chips should become overflow actions instead.
