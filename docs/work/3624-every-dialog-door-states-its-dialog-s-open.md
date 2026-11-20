---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# Every dialog door states its dialog's open state

## What

The dialog primitives now take a trigger that states the dialog's open state, and the Character New and Import doors use it. About twenty-five other doors still open composite dialogs from plain buttons that say nothing about the dialog; the phone lane's report lists them.

## Why

A screen reader user cannot tell those buttons open a dialog, or whether it is open.

## Done when

Every listed door opens its dialog through the primitive's trigger, or records why it cannot, and a sweep finds no plain button opening a dialog.

## Evidence

Filled at landing: what ran and where its output is.
