---
kind: work
status: doing
updated: 2026-10-12
priority: P1
lane: wt/agent-a3f867943da42e436
plan: test-foundation
---

# Compose holds wiring only: queries and rules move to their domains

## What

Closures inside packages/server/src/entry/compose run database queries and carry business rules: resolveUserPublics, resolveConnectedPersona and the present-host read in chat.ts, the large rpg.ts closures, automation-plugin.ts, search-discovery.ts, the seat writes in session-entries.ts, and query closures in co-participant-assets.ts, emit-chat-changed.ts, event-bus.ts, regex.ts, preset-usage.ts, visible-rooms.ts, roster-preset.ts and imagery.ts. Move each to its owning domain as an exported function, or as an injected op where it crosses domains, and add a gate that a compose module calls no drizzle query builder and holds no branching beyond wiring. Build the gate first, red against the current tree; its findings are the work set.

## Why

Tier-5 law says entry owns no business logic. Rules hidden in compose closures are what test harnesses copied, and the server test composition root (958) cannot test logic it cannot reach.

## Done when

The gate holds with planted controls; no compose module runs a query or carries a rule; each moved rule is exported from its domain and called by compose; item 958 starts from the cleaned compose.

## Evidence

Filled at landing: what ran and where its output is.
