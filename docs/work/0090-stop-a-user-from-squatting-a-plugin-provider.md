---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: connection
---

# Stop a user from squatting a plugin provider id

## What

The first definition of a plugin:<slug>/<id> provider row is permanent (provider-rows.ts:65-67,136-152). A user who installs and enables a plugin with slug foo blocks every later genuine foo plugin: its activation fails with 'already has a different definition' and lands errored (activate.ts:229-237). Nothing reaps the definition. The conflicting id written to the victim's lastError is also an existence oracle.

## Why

Medium availability risk found by the security review of c26bbc295. The fix changes the provider-identity ruling, so it needs a ledger decision first.

## Done when

A ledger row picks one of: definitionHash recorded on user_connections and checked at resolve, so a definition is released once no enabled contribution references it; or definitions keyed by providerId and ownerId. Plus a stopgap admin verb that reaps an unreferenced plugin definition. Tests show a second user can enable a genuine foo plugin after a squat, and lastError reveals nothing.

## Evidence

Filled at landing: what ran and where its output is.
