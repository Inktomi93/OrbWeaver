---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: preset
plan: typed-enforcers
---

# One preset control registry in contracts derives the control, capability, adjusted and chat-only lists

## What

A preset control's facts are split by key spelling across INTENT_CONTROL and CHAT_ONLY_INTENT_FIELDS (packages/contracts/src/preset/index.ts), CAPABILITY_KNOBS and STATED_CONTROL (packages/contracts/src/inference/capability/reads.ts) and ADJUSTED_KNOBS (packages/contracts/src/chat/adjusted-knobs.ts). Samplers derive from SAMPLER_KNOBS, but a new intent field is not forced into the capability or adjusted lists, and the chat-only list defaults a new field to background tasks silently. The connection facts bannedStrings and samplerOrder share the sampler names though they mean the server's spelling.

## Why

One concept spelled in several tables drifts; the compiler should refuse a control that has not declared its kind, scope and capability question.

## Done when

A PRESET_CONTROLS table mapped over every UserIntent field holds a union on kind (sampler, intent with its required capability question and whether a drop is reported, ours) and a required chat or role scope; INTENT_CONTROL, CAPABILITY_KNOBS, STATED_CONTROL, ADJUSTED_KNOBS and the chat-only and role lists derive from it and are deleted as hand lists; the connection fact keys become bannedStringsSpelling and samplerOrderSpelling with a numbered migration for stored declared features and the curated rows; funnel, preset and capability tests pass unchanged; a new intent field without an entry fails tsc.

## Evidence

Filled at landing: what ran and where its output is.
