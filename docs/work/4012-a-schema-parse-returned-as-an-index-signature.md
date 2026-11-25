---
kind: tooling
status: doing
updated: 2026-11-25
priority: P3
area: tooling
lane: wt/agent-aaf6aadf0c94b6f15
plan: unwired-code
---

# A schema parse returned as an index-signature type keeps its member reads

## What

packages/inference/src/backends/openai-compat/ollama-native.ts parseLine returns Json, so the reads at call\["function"], call\["id"] and fn\["name"] are string-key reads on Record values that neither the graph nor fields credits to ollamaChatResponseSchema.message.tool_calls members.

## Why

Those members are read in production and report as validated-only.

## Done when

A member read by a literal string key on a value the schema's parse produced is credited to that schema member, with a planted case and a twin where an unrelated Record read credits nothing, and the three ollama rows read as used on the real tree.

## Evidence

Filled at landing: what ran and where its output is.
