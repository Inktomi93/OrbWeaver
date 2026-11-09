---
kind: decision
status: open
updated: 2026-11-09
priority: P3
area: ui
plan: surface-walk
---

# Decide how a control laid over a sibling control is declared

## What

Three designs place a control over a sibling control that does not contain it, and the overlap probe reports each. The theme cell's corner menu at `packages/client/src/features/config/components/appearance-looks-section.tsx:226` sits over the theme radio. The ListRow `float` actions at `packages/ui/src/primitives/list-row/variants.ts:167` cover the clickable body on a fine pointer. Echo's art-tile pointer sheet at `packages/client/src/features/chat/components/art-slot.tsx:97` lies under the message's Regenerate a variant control. Shows at desktop 200%, desktop 300%, phone 200%, phone 300% text on: Characters independent library; Chat reading style echo; Config independent category appearance; Config independent category rosterPreset; Config independent category worldInfo; Config reversible settings; Rail independent corpus; Rail independent home; Rail independent refinery; Refinery disposable stage execution and versions.

## Why

The probe cannot tell a designed sibling overlay from a defect, because the tree declares no relation between the two controls.

## Done when

A ruling, and each overlay either redesigned or declared through a production attribute the probe reads. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: chat-room-chat-*, config-appearance-*, config-library-setting-changed, config-rosterPreset-*, config-worldInfo-*, corpus-labels-finder-scroll-*, home-native-chat-alsoOpen-*, library-scroll-*, message-operations-*, refinery-requested-pane-composition.

## Evidence

Filled at landing: what ran and where its output is.
