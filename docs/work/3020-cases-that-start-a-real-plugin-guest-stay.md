---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# Cases that start a real plugin guest stay inside their time budget under load

## What

`tests/server/domain/chat/verbs/turn-plugin-macros.int.test.ts` holds cases that spawn a real plugin guest. One carries the slow tag. An untagged sibling reached the default budget on a loaded box in two separate review runs and passed alone.

## Why

A case that fails only under load reads as a red in a whole-suite run and hides real ones.

## Done when

Each real-guest case in that file is either made cheaper or tagged for the work it does, and the file passes in a whole-suite run on a loaded box.

## Evidence

Filled at landing: what ran and where its output is.
