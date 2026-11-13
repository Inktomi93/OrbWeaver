---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: transport
plan: authorization-and-visibility
---

# Every tRPC request outside POST carries the cross-site header

## What

Queries travel over GET without `x-orb-csrf`, and a query can write: `plugin.transformForDisplay` writes plugin state on every call. It is reachable by a cross-site top-level GET on cookie modes, because the Lax cookie rides the navigation, and from an imported card's image tag under the loopback owner fallback. The fix requires the header on every tRPC request outside POST, one rule for all. It touches the server entry check, the client query link if it sends no header on GET, the request helpers under `tests/support/browser/` and `tests/support/node/`, `tests/e2e/support/trpc.ts` and `tests/e2e/support/sse.ts`, the snap and surface-walk request helpers, and `pnpm sse-tap`.

## Why

A page on another site can make a signed-in browser change plugin state.

## Done when

A header-less GET to any tRPC procedure is refused, the client and every tool send the header, a test through the real HTTP entry shows a cross-site GET to `plugin.transformForDisplay` is refused, and the e2e smoke and both csrf-gates specs pass.

## Evidence

Filled at landing: what ran and where its output is.
