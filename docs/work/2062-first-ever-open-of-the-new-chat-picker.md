---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# First-ever open of the New chat picker holds the roster door row

## What

A device with no remembered box for the New chat picker grows by the roster door row once, for a user with saved rosters, because the declared box excludes the row.

## Why

A dialog that jumps on first open reads as broken.

## Done when

The declared box includes the row or a CT seeds the box store, and first open holds its height.

## Evidence

NewChatPicker reads rosterPreset.list without suspending, so a warm cache knows the door row while the skeleton shows: the declared box is then PICKER_FIRST_OPEN_BOX_WITH_DOOR, the picker box plus the height.picker-door-row token. Held by tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx on a desktop and a coarse portrait screen with the roster list cached (red first with the plain box: data-tile-reserved was var(--height-picker-box); green with the door row, skeleton and loaded box and dialog within 1px). A cold first open stays refused: rosterPreset.list and character.list leave in one batched request (character.list,rosterPreset.list?batch=1), so the response that carries the rosters is the one that settles the picker and nothing can know the row sooner.
