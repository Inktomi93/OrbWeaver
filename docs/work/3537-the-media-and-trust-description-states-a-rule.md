---
kind: bug
status: open
updated: 2026-11-16
priority: P2
area: client
plan: chat-html-and-presets
---

# The Media and trust description states a rule the resolver does not follow

## What

The Media and trust settings text says a character's override may tighten these settings and never loosen them. `resolveRenderPolicy` in `packages/contracts/src/chat/roster.ts` lets a character set to render rich HTML draw styled while the install default is off; only external media is tighten-only.

## Why

A host reads the text, expects a character cannot loosen HTML rendering, and is wrong.

## Done when

The description states the rule each setting really follows, in the words the trust model work rules.

## Evidence

Filled at landing: what ran and where its output is.
