---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: tooling
---

# Snap stage-db clones the owner's art

## What

pnpm snap --stage-db copies the database but not the owner's asset folder under data/assets, so every avatar and art image on a cloned stage returns 404; side-eye had to copy the asset folder by hand.

## Why

Every imagery review on a copied database runs blind without it.

## Done when

The stage-db flag clones or links the owner's asset folder into the stage data dir, read-only toward the source, with a test that a cloned stage serves an avatar.

## Evidence

Filled at landing: what ran and where its output is.
