---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: import
plan: import-robustness
---

# One bad persona avatar does not fail a SillyTavern profile import

## What

A persona avatar that is not an image fails the whole profile import in `packages/server/src/domain/import/loader/profile-directory.ts`: the workload ends failed with no personas.

## Why

One damaged picture costs the person every persona in the folder.

## Done when

The persona imports without the picture and the report names the file, proved by a test through the production import workload.

## Evidence

Filled at landing: what ran and where its output is.
