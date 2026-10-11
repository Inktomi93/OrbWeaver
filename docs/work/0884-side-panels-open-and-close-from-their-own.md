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

## Why

Owner: the toggles feel odd to click and the x duplicates the collapse control; do it properly once.

## Done when

Each side panel's collapse control sits in the panel's own header at the edge beside the content pane; a collapsed panel leaves a slim edge tab in the same screen position that reopens it, so open and close share one spot and nothing moves under the pointer; the center top bar carries only room controls; the docked x is gone and the floating overlay keeps exactly one dismiss; the control shows open or closed state with aria-expanded; phone behaviour, keyboard shortcuts and the panel motion spec are preserved; CTs pin that the control's screen position is unchanged across a toggle and that each panel has one control; the list pane, the Details pane and the plugin column all use the one `PanelEdgeControl` component from the plugin-strip work, and a CT pins each control's screen position across a toggle; a side-eye confirms desktop and phone.

## Evidence

Filled at landing: what ran and where its output is.
