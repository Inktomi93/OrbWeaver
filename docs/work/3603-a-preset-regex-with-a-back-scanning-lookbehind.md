---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: chat
plan: chat-html-and-presets
---

# A preset regex with a back-scanning lookbehind stops on long many-tag replies

## What

A large imported preset carries a display script whose variable-length lookbehind rescans back to the start of the text. On a long synthetic text with many tags it ran for seconds; on realistic reply lengths it ran in under a millisecond, and the Worker's per-script deadline cuts it when it runs long.

## Why

If a real reply reaches that shape, the guard cuts a script the user expects to run and the panel it draws goes missing.

## Done when

The text shape that triggers the cost is bisected; the report states whether a real reply reaches it; the regex runtime either bounds it for every script of this kind or the item closes with that evidence.

## Evidence

Filled at landing: what ran and where its output is.
