---
kind: bug
status: doing
updated: 2026-11-21
priority: P1
area: import
lane: wt/agent-aa6d619f30bafd922
plan: import-robustness
---

# A refused SillyTavern zip offers no import and shows its reason in plain words

## What

After a SillyTavern zip is refused, the import check still says You can still import and keeps the Import this file and Try again buttons; pressing Import shows the raw error zip rejected (no-directory). Copy lives in packages/client/src/features/workloads/lib/import-library-names.ts.

## Why

The screen offers an action that cannot work and then shows an internal error.

## Done when

A refused zip shows only its plain reason and a way to pick another file, never an Import action, with a CT per refusal kind.

## Evidence

Filled at landing: what ran and where its output is.
