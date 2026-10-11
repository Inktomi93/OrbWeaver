---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: plugin
---

# Draft Polish works on a real connection

## What

Owner turned Draft Polish off after it kept failing on his v0.2.0 container. The container log shows plugin broker errors ('plugin broker: synchronous parent call timed out', from entry/compose/automation-plugin.ts:950 on chatOpened) but no Draft Polish-specific line. Draft Polish is the composer-action showcase plugin (packages/showcase-plugins/bundles/draft-polish/main.ts).

## Why

A shipped showcase plugin that fails teaches users plugins are broken.

## Done when

The failure is reproduced with its cause named (host-call deadline, model call, broker timeout or other), fixed, and a test drives Draft Polish end to end against a fake model that answers slower than the old failing bound; the failure the user sees names its cause.

## Evidence

Filled at landing: what ran and where its output is.
