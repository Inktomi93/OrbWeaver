---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: credentials
---

# Adding a model on a saved key asks for its limits when the window is a guess

## What

`add-model-on-key-dialog.tsx` creates a connection through a second add path with no limits step. It is a `FormDialogRoot` + `FormDialogPopup` dialog, and `#components` (`form-dialog.tsx`) exports no frame-only popup for that root, so `ConnectionLimitsStep` cannot mount there without a new shared popup export or swapping dialog roots while it is open.

## Why

A model added on an existing key whose server states no window lands on the 8,192-token guess with no word to the user, the first outside user's failure on her second model.

## Done when

`form-dialog.tsx` gains the frame-only popup the step needs (or the add-model dialog moves to `DismissDialog` stages), the add-model path shows `ConnectionLimitsStep` after create, and a CT through `tests/support/browser/ct-data-providers.tsx` sees the step for an id-only model list and none for a provider that states its window.

## Evidence

Filled at landing: what ran and where its output is.
