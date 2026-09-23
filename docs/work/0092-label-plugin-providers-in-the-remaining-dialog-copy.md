---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: client
---

# Label plugin providers in the remaining dialog copy

## What

A plugin provider's bare label (no '· plugin …' suffix) still shows in add-connection-form-model.ts:73-75, add-connection-dialog.tsx:370,421,476, add-model-on-key-dialog.tsx:50,98,134 and connections-list-section.tsx:276.

## Why

The picker already names the plugin; the dialog copy should use providerDisplayLabel too, most of all for admin-distributed copies.

## Done when

Every listed site renders providerDisplayLabel, with a CT asserting the plugin suffix in the add-connection and add-model dialogs.

## Evidence

Filled at landing: what ran and where its output is.
