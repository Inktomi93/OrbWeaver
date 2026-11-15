---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: plugin
---

# A trigger fact withheld at the cascade depth is logged only to the server, never to the plugin's own log

## What

When a plugin's own command raises a domain trigger past the cascade depth bound, packages/server/src/domain/plugin/verbs/registrar-ops.ts withholds the delivery and writes a server warn line. The plugin's log, which its owner reads on the plugin page, records nothing.

## Why

The owner of a plugin whose handler stopped firing has no way to learn that the host withheld the fact on purpose, and will read it as a broken plugin.

## Done when

A withheld delivery also writes one line to the subscribing plugin's own log naming the trigger type and the bound, with a case through the composed root that reads it back.

## Evidence

Filled at landing: what ran and where its output is.
