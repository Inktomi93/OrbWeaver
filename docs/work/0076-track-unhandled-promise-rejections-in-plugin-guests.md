---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: infra
---

# Track unhandled promise rejections in plugin guests

## What

Report an unhandled promise rejection inside a QuickJS plugin guest to the plugin's log ring, through `JS_SetHostPromiseRejectionTracker`, when the QuickJS binding exposes it.

## Why

The plugin-host float visibility work deferred this because quickjs-emscripten-core does not expose the tracker. A guest's rejected promise is invisible today.

## Done when

A guest that rejects a promise without a handler produces one log-ring entry naming the plugin, and a test in `tests/server/infra/plugin-host/` pins it.

## Evidence

Filled at landing: what ran and where its output is.
