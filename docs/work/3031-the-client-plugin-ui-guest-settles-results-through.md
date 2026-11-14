---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: security
---

# The client plugin UI guest settles results through the guest's own Promise

## What

The browser guest Worker settles an event's result with the binding's resolvePromise, which reads the guest's global Promise and hands guest code the binding's own resolve functions. The server host replaced the same call with a settlement through handles captured before guest code ran.

## Why

A guest that keeps those functions and calls them again copies a handle on every call. In the browser the leak stays inside that plugin's own Worker, but the guest also runs its own code inside the host's settlement.

## Done when

The client guest settles through Promise.resolve and Promise.prototype.then captured before guest code, and a CT guest that swaps its Promise and keeps every function it is handed holds only the engine's resolvers, red on the binding's resolvePromise.

## Evidence

Filled at landing: what ran and where its output is.
