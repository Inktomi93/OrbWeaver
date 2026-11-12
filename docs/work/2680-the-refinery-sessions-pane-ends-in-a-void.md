---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# The Refinery Sessions pane ends in a void

## What

The design audit rule pane-ink fails on the Sessions pane (`[aria-label=Sessions]`) at refinery/requested-pane-composition and every refinery/execution result checkpoint: content ends at about a fifth of the pane and nothing designed fills the rest.

## Why

A pane that is mostly empty below its content reads as unfinished; the rule's own header calls the fix a design decision (the Config item for the same rule records the same finding).

## Done when

The pane earns its height or sheds it, decided from a rendered look together with the Config pane-ink decision; the finding is gone from these checkpoints or answered with a cited reason.

## Evidence

Filled at landing: what ran and where its output is.
