---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: import
plan: import-robustness
---

# Report every unrecognised preset field that holds a value

## What

`collectDroppableFields` in `packages/contracts/src/preset/index.ts` reports only the fixed `DROPPABLE_FIELDS` list, so a field on no list is ignored with no message. In the Sola file that is `extensions`, `send_if_empty`, `stream_openai`, `use_sysprompt`, `media_inlining`, `continue_prefill`, `max_context_unlocked`, `n`, `personality_format`, `scenario_format` and `wi_format`. Report any top-level field with a meaningful value that the importer neither maps nor lists.

## Why

The import states that nothing is dropped silently, and these fields are.

## Done when

An import of a preset with an unknown populated field names that field in the summary, and a test pins it.

## Evidence

Filled at landing: what ran and where its output is.
