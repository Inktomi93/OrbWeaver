---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# Character New and Import dialog triggers speak no open state

## What

CharacterImportDoor and CharacterNewDoor in packages/client/src/features/character/components/character-create-actions.tsx open a feature-owned Dialog from a plain ghost Button with setOpen(true). The trigger carries no aria-haspopup and no aria-expanded, unlike the Base UI triggers and the registry modal triggers in shell chrome.

## Why

A screen-reader user hears a plain button and is not told it opens a dialog or that the dialog is open; every other shell chrome trigger now states it.

## Done when

Both triggers state aria-haspopup=dialog and aria-expanded from the dialog's own open state, through Base UI's Dialog.Trigger or the same attributes, with a component test that opens and closes each dialog and reads the attributes.

## Evidence

Filled at landing: what ran and where its output is.
