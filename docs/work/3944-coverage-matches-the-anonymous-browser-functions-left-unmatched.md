---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# Coverage matches the anonymous browser functions left unmatched

## What

After the renamed-function fix, the recorded CT run still leaves anonymous browser functions unmatched in the coverage merge, among them the arrow in frame-document.ts and the lazy import arrow in lazy-preset-editor.tsx.

## Why

An unmatched function can never be reported executed, so a live function reads as dead.

## Done when

None are left unmatched, or each one has a named cause, with a red-first planted case for an anonymous arrow the bundler moves.

## Evidence

Filled at landing: what ran and where its output is.
