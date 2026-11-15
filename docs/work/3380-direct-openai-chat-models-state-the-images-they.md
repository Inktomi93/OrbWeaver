---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Direct OpenAI chat models state the images they take

## What

No curated row in packages/inference/src/capability/sources/curated/openai.ts states `input` for the chat families (gpt-4.1, gpt-4o, gpt-5); only the gpt-image row does. The direct OpenAI row lists no modalities either, so every OpenAI chat model resolves text-only, now marked assumed (3296).

## Why

A direct OpenAI user cannot send an image to a model that takes one unless they turn the switch on themselves.

## Done when

Each OpenAI chat family row states its input from OpenAI's model pages with a cite, and a case shows gpt-4.1 resolving image input with no assumed mark.

## Evidence

Filled at landing: what ran and where its output is.
