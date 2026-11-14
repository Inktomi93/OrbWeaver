---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# Model-derived room text runs macros against the host's global variables

## What

`{{memory}}`, `{{compactSummary}}`, `{{databank}}` and the `{{rpg*}}` values re-evaluate macros with the full registry (`packages/kit/src/macro/registry.ts`). A summary or digest that copies a literal `{{setglobalvar}}` could write the host's global variables. Not reproduced: it needs a scripted summary reply.

## Why

Text the model copied from another person can reach the host's per-user store through the summarizer.

## Done when

Those values render with the global-variable macros inert, with a composed-root case that scripts a summary holding `{{setglobalvar}}` and shows no stored row.

## Evidence

Filled at landing: what ran and where its output is.
