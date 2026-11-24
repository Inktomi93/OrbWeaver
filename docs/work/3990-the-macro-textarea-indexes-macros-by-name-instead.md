---
kind: work
status: doing
updated: 2026-11-24
priority: P3
area: ui
lane: wt/agent-afca5223c7596f5fc
plan: unwired-code
---

# The macro textarea indexes macros by name instead of a synthetic id

## What

packages/ui/src/primitives/macro-textarea/macro-textarea.tsx builds a synthetic id for each macro only so MiniSearch can index it by its default id field, while the macro's name is already unique.

## Why

The synthetic id is data written only to satisfy a library default, and it reads as write-only.

## Done when

The index takes the macro name as its id field, the synthetic id copies are gone, and the macro textarea's search behaves as before under its tests.

## Evidence

Filled at landing: what ran and where its output is.
