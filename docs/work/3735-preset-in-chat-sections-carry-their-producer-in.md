---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: chat-html-and-presets
---

# Preset in-chat sections carry their producer in What this reply sent

## What

Preset in-chat sections carry no producer (packages/server/src/domain/chat/assembly/assemble.ts), so new turns label them Injection in the prompt view, and the injections-label.ts comment wrongly says that label is for old rows only.

## Why

The prompt view cannot tell a preset section from a chat injection.

## Done when

Preset in-chat sections carry a producer and show their own label, with a CT whose turn holds a preset section.

## Evidence

Filled at landing: what ran and where its output is.
