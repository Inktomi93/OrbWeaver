---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: notifications
---

# An automation notice names the rule or plugin that raised it

## What

notificationEventSchema.source (packages/contracts/src/notifications/index.ts) carries the raising rule or plugin; the inbox row shows the message only.

## Why

A notice whose source is hidden cannot be traced or switched off from where it is read.

## Done when

The inbox row shows from the rule or plugin by name, linked to its settings, with a CT for each source kind.

## Evidence

Filled at landing: what ran and where its output is.
