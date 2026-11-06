---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: tooling
---

# Preserve secondary files during semantic rename previews

## What

Semantic rename dry runs write secondary target files before application.

## Why

A preview can mutate source before its proposed edits are reviewed.

## Done when

Rename previews show primary and secondary edits without changing target files, with a focused native regression.

## Evidence

Filled at landing: what ran and where its output is.
