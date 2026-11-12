---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# The greeting studio and the Characters hero offer two primary controls

## What

The density audit's second-primary check fails on Characters content with "2 primary controls: New chat | Accept" at greeting-preview-before-discard and greeting-preview-before-accept: the hero's New chat and the studio's Accept both read primary while a greeting preview is open.

## Why

One screen should have one primary action; two compete for the focus a user needs to finish the greeting.

## Done when

While a greeting preview is open, one control is primary, shown by a component test on the production Characters surface that counts primary controls and is red today; or the audit's reading of the hero is answered with a cited reason.

## Evidence

Filled at landing: what ran and where its output is.
