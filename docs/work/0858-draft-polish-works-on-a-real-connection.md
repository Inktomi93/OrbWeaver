---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: plugin
lane: wt/agent-aec39868550065a7a
---

# Every plugin failure reaches the server log with its plugin and cause

## What

Owner turned Draft Polish off after it kept failing on his v0.2.0 container. The container log shows plugin broker errors ('plugin broker: synchronous parent call timed out', from entry/compose/automation-plugin.ts:950 on chatOpened) but no Draft Polish-specific line. Draft Polish is the composer-action showcase plugin (packages/showcase-plugins/bundles/draft-polish/main.ts).

## Why

A shipped showcase plugin that fails teaches users plugins are broken.

## Done when

Every plugin failure path (command invoke, event delivery, display transform overrun, host-call deadline, broker timeout, guest crash or quarantine, client frame errors that reach the server) logs once at warn or error with the plugin slug, the failure kind and the cause; a test per path asserts the fields. Draft Polish itself makes no model call and showed no failure in the owner's log, so no Draft Polish fix is owed.

## Evidence

Filled at landing: what ran and where its output is.

Owner ruling: a plugin failing should report into the server logs. Investigation found Draft Polish never ran in the owner's log window and event delivery failures did not name the plugin (fixed in 8cbeb8837a).
