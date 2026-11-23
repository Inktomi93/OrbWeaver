---
kind: bug
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A key an extended schema inherits counts on the extension's own type

## What

A key the extension inherits from its base schema, read through the extension, is not credited to the extension's own type in the unwired graph.

## Why

The extension's inherited key can read as unread while it is read.

## Done when

A planted base.extend() case reads an inherited key through the extension and credits it; the case fails without the change.

## Evidence

Filled at landing: what ran and where its output is.
