---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: surface-walk
---

# Move the remaining hand-typed walk names to production copy

## What

The surface-walk drivers still hand-type some names: the showcase guest strings, World Info entry delete, preset Add, Prompt and New, the New chat dialog, the roster delete confirm, the Character form Name, filter and tag names, the section row patterns, and the DIALOG_VERBS leftovers (Admin Save and Close, refinery setup and Accept, ui Discard).

## Why

A renamed control breaks the walk at a literal the component does not read.

## Done when

Each name is read from a constant its component renders, with the held files done after their owning lanes merge.

## Evidence

Filled at landing: what ran and where its output is.
