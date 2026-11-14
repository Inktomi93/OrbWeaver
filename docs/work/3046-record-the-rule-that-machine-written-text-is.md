---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: automation
plan: authorization-and-visibility
---

# Record the rule that machine-written text is neutralized where it is written

## What

Several write boundaries pass text a plugin or the model wrote through `neutralizeMacros` before it is stored or becomes a macro body, and their comments cite a spec rule that no law or decision record holds. The places and their writers: a guest's lore entry in `packages/server/src/domain/plugin/substrate/bridge.ts`; a guest's macro answer in `packages/server/src/domain/plugin/substrate/plugin-macros.ts`; and the model's lore entries, suggestion text and rewrite text in `packages/server/src/domain/automation/engine/analysis-arm.ts`, including the confirm stash. A confirmed plugin act re-runs the bridge's write rather than a neutralizer of its own. D352 and D353 cover reads of documents and stored story text, not these writes.

## Why

A rule with no home cannot be amended or cited, and item 3018 cannot repoint the comments until one exists.

## Done when

A decision record states the write-time rule, lists each place and its writer, and names its homes; every comment that cites the old spec rule cites the record instead, and the comment-path citation test resolves each cite (closes 3018).

## Evidence

Filled at landing: what ran and where its output is.
