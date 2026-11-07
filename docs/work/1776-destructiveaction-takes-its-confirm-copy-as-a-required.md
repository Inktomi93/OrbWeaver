---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a87a17d0e7877c3a3
plan: type-law
---

# DestructiveAction takes its confirm copy as a required prop, replacing most of orb/destructive-needs-confirm and its exempt list

## What

Make DestructiveAction take its confirm copy as a required prop, and shrink orb/destructive-needs-confirm and its exempt list to what a type cannot express.

## Why

The lint rule judges a destructive control by its label and a list of exempt files. A required prop makes a control without confirm copy fail the typecheck.

## Done when

A DestructiveAction without confirm copy fails the typecheck. The DESTRUCTIVE_EXEMPT entries in tooling/src/eslint/ui-feature-policy.ts that the component covers are removed.

## Evidence

Filled at landing: what ran and where its output is.
