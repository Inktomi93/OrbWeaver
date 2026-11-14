---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# The first-model step's failure line is hand-spelled instead of the dialog failure owner

## What

packages/client/src/features/credentials/components/first-model-setup.tsx draws its save failure as a destructive Text instead of DialogFailure, so it is not at the body size the dialog failure rule names and is outside the one owner.

## Why

A dialog's failure line reads at the body size from one owner; this site was outside the footer-only scope of the commit footer migration.

## Done when

The first-model step draws its failure through DialogFailure, and a component test fails its save and finds the failure line inline with the choice kept.

## Evidence

Filled at landing: what ran and where its output is.
