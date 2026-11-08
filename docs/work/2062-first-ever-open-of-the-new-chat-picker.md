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

NewChatPicker reads rosterPreset.list without suspending, and the shell now warms that key at boot (useWarmSavedRosters in AppShell, one rosterPreset.list request on any section; tests/client/features/app-shell/surfaces/shell-warm-rosters.ct.tsx), so a picker opened after the shell's first round trip knows the door row while its skeleton shows: the declared box is PICKER_FIRST_OPEN_BOX_WITH_DOOR, the picker box plus the height.picker-door-row token. A stacked or landscape dialog hides the leading door row (the door moves to the footer), so the Stack reserve variant gives drops that token to 0px under dialog-stacked and the declared box no longer overshoots: red first at 300% text, where the skeleton held 470px against a 266px picker on a coarse portrait phone and 398px against 230px on a desktop; green with skeleton, loaded box and dialog within 1px. Held by tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx on a desktop and a coarse portrait screen at 100% and 300% text with the roster list cached, and without rosters. Residue: a picker opened before the shell's roster read returns (the same instant as the boot) still cannot know the row; it settles once.
