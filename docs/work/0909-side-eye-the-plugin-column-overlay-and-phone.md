---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Side-eye the plugin column, overlay and phone plugin panels

## What

Items 842 and 874 reworked the in-chat plugin column: it parks unpainted inside the room flank row, a narrow room opens it as an overlay with Escape and outside-press exits, phones open it from Message tools (Plugin panels) as a Drawer instead of a topbar button, the room-flank glide in features/app-shell/surfaces/shell.css, PanelEdgeControl edge glyphs. Review on a copy of the owner's container data with plugins enabled (a fresh stage has none). Check specifically that the Pocket Arcade frame keeps its height inline, in the overlay and on return, that the phone topbar holds one row at 320, 390 and 430, and the mixed regime transcript glide the lane flagged as off by up to half the scrollbar gutter.

## Why

Prior review rounds found paint and layout defects only visible rendered; the fix lane proved the rest with component tests on a test frame, not the live bundle.

## Done when

A side-eye report is filed with every finding fixed or boarded.

## Evidence

Filled at landing: what ran and where its output is.
