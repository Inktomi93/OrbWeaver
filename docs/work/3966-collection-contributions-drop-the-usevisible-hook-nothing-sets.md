---
kind: work
status: doing
updated: 2026-11-24
priority: P3
area: client
lane: wt/agent-afca5223c7596f5fc
plan: unwired-code
---

# Collection contributions drop the useVisible hook nothing sets

## What

CollectionContribution.useVisible in packages/client/src/lib/collection-contracts.ts is read only in config-list-collection-group.tsx with a true fallback, and no contribution sets it, so every collection is always visible.

## Why

A hook no contribution provides leaves a dead branch and a contract promise nothing keeps.

## Done when

The field, its read, the hidden-collection branch and both comments are gone, and the config list tests still pass.

## Evidence

Filled at landing: what ran and where its output is.
