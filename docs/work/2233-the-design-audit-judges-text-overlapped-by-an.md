---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The design audit judges text overlapped by an inline control and skips full-bleed wrappers

## What

The design audit reported the Characters band clean while its census was painted under the New character button: no rule judges text overlapped by a sibling control. It also raised clipped-overflow P1 on New chat at 300% phone for the popup's full-bleed body wrapper, whose content is not cut.

## Why

An audit that passes a covered count and fails an uncut wrapper reads wrong in both directions.

## Done when

A fixture with text under a sibling control fails the audit, a full-bleed wrapper with uncut content passes, and both run in the tooling suite. Source: acceptance part 3 report Synthesis.

## Evidence

Filled at landing: what ran and where its output is.
