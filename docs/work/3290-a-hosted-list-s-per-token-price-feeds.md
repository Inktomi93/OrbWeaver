---
kind: work
status: doing
updated: 2026-11-15
priority: P3
area: inference
lane: wt/agent-a5487884af20f9847
---

# A hosted list's per-token price feeds the cost estimate

## What

The NanoGPT reader now lists each model's prompt and completion price in the catalog entry. The per-turn cost estimate reads only `features.pricing` or OpenRouter's metadata. Feed the listed price into the estimate for a hosted openai-compatible row.

## Why

NanoGPT turns show no cost although the list states every price.

## Done when

A NanoGPT turn on a model with a listed price reports an estimated cost, and a model with a null price reports none.

## Evidence

Filled at landing: what ran and where its output is.
