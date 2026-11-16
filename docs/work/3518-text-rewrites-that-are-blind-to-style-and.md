---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
---

# Text rewrites that are blind to style and script elements can break a model-written stylesheet or script

## What

Three rewrites run over reply text without regard to a style or script element in it. Macro neutralization in `packages/kit/src/macro/` puts a zero-width space between two closing braces, and CSS closes nested blocks with two closing braces; the host-confirmed analysis rewrite of a model reply neutralizes it. The display-time names pass replaces identity macros and drops the body of an identity macro read as a block, inside a style or script body as anywhere else. The optional Markdown auto-fix rewrites asterisks, underscores and quotes across those bodies. Found by reading the source and not run.

## Why

A reply that draws a styled or scripted panel can lose its styling or its script after one of these passes, with no error shown.

## Done when

Each pass is shown by a test to leave the text of a real style or script element unchanged, or the pass is ruled to apply there and the reason is stated in `docs/law/Chat-Macro-Resolution.md`.

## Evidence

Filled at landing: what ran and where its output is.
