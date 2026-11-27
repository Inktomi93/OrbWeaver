---
kind: bug
status: doing
updated: 2026-11-27
priority: P2
area: world-info
lane: wt/agent-a909b53dff73d9f07
plan: unwired-code
---

# A machine-written lore entry keeps the prompt position its writer chose

## What

An automation rule's insert lore action offers a Prompt position (packages/client/src/features/automation/components/rule-list-action-fields.tsx) and the plugin PluginWorldEntryUpsert carries position (packages/contracts/src/plugin/host-v1.ts), but UpsertLoreEntryInput has no position and upsertOne in packages/server/src/domain/world-info/verbs/entries/upsert-entries.ts stores only the provenance stamp; packages/server/src/domain/plugin/substrate/bridge.ts says the position is dropped.

## Why

A control that does nothing: every rule and plugin entry lands at the default position whatever the author picked.

## Done when

UpsertLoreEntryInput carries an optional position, the rule executor and the plugin bridge pass it, upsertOne stores it in the entry metadata on insert and update, and a red-first test proves a rule with position after writes an entry stored as after.

## Evidence

Filled at landing: what ran and where its output is.
