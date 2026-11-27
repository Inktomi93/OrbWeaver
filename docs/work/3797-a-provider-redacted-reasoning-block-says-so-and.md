---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: chat
plan: unwired-code
---

# A provider-redacted reasoning block says so, and admins see global settings

## What

ChatResult.reasoningRedacted records that the provider redacted the reasoning and no screen says so. The global settings rows (key, value, updatedAt) reach no screen: the admin get and set routes were removed under 3849 as test-only attack surface, so the admin pane builds its own read-only list route and view schema with it.

## Why

Collected data the user would want is not shown: why reasoning is missing, and what the server-wide settings are.

## Done when

The reasoning block says the provider redacted it when it did, the admin settings pane lists the global settings with their update time, and a CT covers each.

## Evidence

Filled at landing: what ran and where its output is.
