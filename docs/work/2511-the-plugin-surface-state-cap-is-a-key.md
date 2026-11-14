---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: plugins
---

# The plugin surface-state cap is a key count where a byte budget or a per-room eviction was proposed

## What

Record a decision that a plugin's surface state is capped by key count, with the reason in the file header and the trigger for a revision: a real plugin reaching the cap. Cite the decision in `surface-state.ts` and drop the dead board cite from the comment and the log line. Add a case at the bound.

## Why

The parked proposal has no record once the dead cite goes, and the cap has no test.

## Done when

an ADR states the key-count cap and its revision trigger, `surface-state.ts` cites it, and a server case shows a new key past the cap refused with the plugin and room in the log while an existing key's overwrite proceeds.

## Evidence

Filled at landing: what ran and where its output is.
