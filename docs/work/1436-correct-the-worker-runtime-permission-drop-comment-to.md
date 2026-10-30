---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: plugins
---

# Correct the worker-runtime permission-drop comment to match finding 4

## What

Rewrite the header comment in `packages/server/src/infra/plugin-host/worker-runtime.ts` (near line 46) that calls a separate OS user for the broker "the complete fix".

## Why

`docs/law/container-deployment-security.md` its fourth finding states that the WASM sandbox is the plugin boundary and OS-user separation is not planned. The comment contradicts the law. Route to `security-executor`.

## Done when

The comment names the WASM sandbox as the boundary, cites finding 4, and names no OS-user fix.

## Evidence

- The comment in `packages/server/src/infra/plugin-host/worker-runtime.ts` now names the QuickJS WASM sandbox as the plugin boundary and cites finding 4 of `docs/law/container-deployment-security.md`. It names no OS-user fix.
- A search of `packages/server/src/infra/plugin-host`, `packages/server/src/domain/plugin`, `docker` and `scripts` found no other comment that calls OS-user separation a fix.
