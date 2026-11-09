---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-ac29a34b89f272d3f
plan: cross-surface-consistency
---

# Sticky bands cover the controls under them at enlarged text on the phone

## What

At 300% text on the phone the character editor's sticky save bar wraps its title so tall that it covers Add tag in the editor and the greeting's Studio toggle. At 200% the Presets tab strip covers a setting's hint trigger.

## Why

A phone user at enlarged text cannot press the covered controls.

## Done when

Add tag, the greeting Studio toggle and the Presets hint triggers are clickable at 200% and 300% on chromium-phone-portrait; Characters independent editor, Characters independent greeting and Rail independent presets pass their journeys there.

## Evidence

Part, in 44a69762a1: SaveBar unpins when usePinnedBarCap says it would fill the pane; CT the character editor's Add tag stays pressable under its save bar at 200% and 300% (red at 300% on main). Still open: the greeting Studio toggle and the Presets tab strip over the hint trigger at 200%.

Part 2, in 820ce8dc84: the Presets pinned band unpins through usePinnedBarCap. Remaining: the greeting Studio toggle.
