---
kind: tooling
status: doing
updated: 2026-10-11
priority: P2
area: architecture
lane: wt/agent-ab4068ef65b2864f9
---

# Only the kit package is called kit

## What

packages/inference/src/backends/kit, packages/db/src/kit and packages/server/src/kit (and their test mirrors) sit beside the @orb/kit package and hold non-primitives: fetch-json, retry, sse, response-cache (inference), query builders such as chat-visibility and fetch-owned (db), embedding-generation and stored-config (server). Law 3 says kit is pure primitives only.

## Why

Owner ruling: only @orb/kit is kit; package-local folders are named by role.

## Done when

No folder named kit exists outside packages/kit and its test mirror; the former contents live in role-named folders with # subpath imports updated; law 3 is amended to say only the kit package is kit; tests mirror the new paths.

## Evidence

Filled at landing: what ran and where its output is.
