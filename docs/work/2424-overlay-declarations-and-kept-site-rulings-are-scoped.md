---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Overlay declarations and kept-site rulings are scoped tighter

## What

Review of the overlay and cohort rulings found three gaps. The art tile declares its overlay across the whole MessageBox in packages/client/src/features/chat/components/message-row-bubble.tsx, the widest declaration. No CT plants two controls inside one declarer (tests/support/browser/enlarged-text-geometry.ts). A keptSites ruling covers a whole file and any value, so a new defect at a ruled path passes silently. The cb-rev3 review under reports/code-reviewer holds the evidence.

## Why

A declaration or ruling wider than the design it names can hide a real defect.

## Done when

The art tile declaration covers only the controls that overlay, a CT shows two controls inside one declarer still fire, and keptSites names the value it keeps so a different value at a ruled path is judged.

## Evidence

Filled at landing: what ran and where its output is.
