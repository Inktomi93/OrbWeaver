---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The greeting studio and the Characters hero offer two primary controls

## What

While a greeting preview is open, the hero's New chat renders as an outline button and the studio's Accept stays primary. The preview's open state lifts to `CharacterHeroBand`, which already mounts the preview.

## Why

The finishing act of the open step owns the emphasis, as the Refinery apply outcome does, and one region shows one primary control.

## Done when

a component test on the production Characters surface counts one primary control with a preview open and the hero's New chat primary with it closed, red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
