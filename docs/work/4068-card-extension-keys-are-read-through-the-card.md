---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: import
lane: wt/agent-adf56b71cc859a547
plan: unwired-code
---

# Card extension keys are read through the card schema

## What

data.extensions depth_prompt, fav and regex_scripts are still read by hand (parseDepthPrompt in the card serde).

## Why

They are the last hand-read card fields, so import and export can drift on them.

## Done when

The extension keys the export writes are typed in the card schema, import reads them through it, and export validates them.

## Evidence

Filled at landing: what ran and where its output is.
