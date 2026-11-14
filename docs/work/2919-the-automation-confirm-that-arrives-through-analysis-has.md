---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# The automation confirm that arrives through analysis has a test

## What

The lore confirm in `packages/server/src/domain/automation/engine/analysis-confirm.ts` takes a confirm from a rule and a confirm from an analysis. No test runs the confirm from an analysis.

## Why

The module was rebound during the substrate purity work with no case to show that path still writes what it wrote before.

## Done when

A server case through the composed root confirms an analysis result and asserts the lore rows written, with a refusal case and its reason.

## Evidence

Filled at landing: what ran and where its output is.
