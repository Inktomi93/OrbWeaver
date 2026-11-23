---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: tooling
plan: unwired-code
---

# A host object literal's method read through its port type is live

## What

The dead-row delete trial refuted createLocalPluginHost.readLog in packages/server/src/infra/plugin-host/port.ts, which the graph calls dead and write-only; the domain reads the host's readLog through the port type (packages/server/src/domain/plugin/verbs/get-plugin-log.ts and the service contract's ProcessPluginHost readLog), and the trial's errors sit on the literal method itself (an excess-property write and a parameter that loses its contextual type).

## Why

A dead verdict on a host method callers reach through its port type is a false delete.

## Done when

The shape that hides the read is named in this item, the graph pairs the literal method with the port member it implements so the read reaches it, readLog leaves the dead list on the real tree, and a planted host literal with a read port member and an unread one is red without the change.

## Evidence

Filled at landing: what ran and where its output is.
