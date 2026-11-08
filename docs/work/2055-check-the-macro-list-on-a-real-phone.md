---
kind: work
status: blocked
updated: 2026-11-07
priority: P3
area: ui
blocked: owner
plan: cross-surface-consistency
---

# Check the macro list on a real phone with a soft keyboard

## What

Open a prompt section editor on a real phone, type {{c with the soft keyboard up, in a short field and a long one, and see whether the suggestion rows stay on screen. Emulation passes; ui-platform-rulings section 8.5 keeps keyboard behaviour open for a real device.

## Why

Only a real keyboard proves the visual viewport behaves as the emulated one does.

## Done when

The result on a device is recorded, and any defect is filed.

## Evidence

Filled at landing: what ran and where its output is.
