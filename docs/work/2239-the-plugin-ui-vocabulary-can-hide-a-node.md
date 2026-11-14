---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: plugins
plan: cross-surface-consistency
---

# The plugin UI vocabulary can hide a node or bind a grid's empty text

## What

A plugin UI node can be hidden by state. The node base in `packages/contracts/src/plugin/ui.ts` gains an optional `when` field typed as `PluginBoundBoolean`, the binding `disabled` and `loading` use. The renderer skips a node whose `when` resolves false; a missing path shows the node. The SDK types in `packages/plugin-sdk`, the generated support map and the file header change with it. The field is named `when` so a later predicate form extends the same field. Card Atlas hides its pager with it when a browse has one page.

## Why

A plugin cannot remove a control that does not apply, so Card Atlas shows a pager with nowhere to go. The guest already computes its state and can publish a boolean, so no evaluator is needed in the renderer.

## Done when

A contract test accepts a literal and a state-bound `when` and refuses any other shape. A component test on the production plugin renderer shows a node hidden while its bound state is false and shown when the state flips, and shows a node with a missing path. Card Atlas shows no pager for a one-page result. The SDK type test covers the field.

## Evidence

Filled at landing: what ran and where its output is.
