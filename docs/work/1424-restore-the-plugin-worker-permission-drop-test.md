---
kind: bug
status: open
updated: 2026-10-30
priority: P1
area: security
plan: test-foundation
---

# Restore the plugin worker permission-drop test

## What

`docs/law/container-deployment-security.md` states that a plugin guest Worker drops its own permission to start Workers before QuickJS loads. The test that pinned it, `legacy-source/server/infra/plugin-host/process-permission.test.ts`, is not in this repository, and no live test exercises `process.permission.drop` in `packages/server/src/infra/plugin-host/worker-runtime.ts`.

## Why

A sandbox guarantee with no running test can regress silently. The WASM sandbox is the plugin security boundary.

## Done when

A production-entry integration test starts the real `worker-runtime.ts` and proves the guest cannot start a Worker after the drop, with a control that fails when the drop is removed; the restoration register records the case; the law paragraph cites the live test. Route to security-executor.

## Evidence

- Test: `tests/server/infra/plugin-host/worker-permission-drop.int.test.ts`, server integration layer. It spawns `packages/server/src/infra/plugin-host/broker-entry.ts` with `pluginBrokerExecArgv()` and the watchdog's launch arguments, in a private working directory. The broker starts the real `worker-runtime.ts` Worker for a snippet command. A `data:` preload, inherited by the Worker through the broker's exec arguments, observes the Worker after the runtime has registered its port listener.
- Why not the composed root: the watchdog starts the broker with a fixed argument list and an environment of `NODE_ENV` alone, so the harness's `pluginSpawn` seam cannot reach the Worker. The drop is per thread: a probe showed the broker's main thread keeps `worker` after a Worker drops it, so only code in the guest Worker can observe it.
- Positive control: the snippet's `variables.get` host call reaches the test, which answers only after the observer reports, and the snippet completes with its log line.
- Drop case: the guest Worker reports no `worker` permission, a denied read of a key file outside the grants, and `ERR_ACCESS_DENIED` for a nested `execArgv: []` Worker.
- Refusal case: the preload removes `process.permission.drop`. The runtime refuses to load, so the observer never runs and the guest makes no host call. The broker answers with the "could not drop the permission to start Workers" error. The same case passed with the broker on a real Node 24.11.1, which has no `drop`.
- Defect controls, each a scratch edit of `worker-runtime.ts` restored with no diff:
  - Drop and guard removed: the drop case fails. The guest Worker kept `worker`, and its nested Worker ran with no permission model and read the key file the guest Worker could not read.
  - Guard removed: the refusal case fails, because the runtime on a Node without `drop` served the host call.
  - Drop removed: the drop case fails at its positive control, because the guard failed the runtime closed.
- Dependency-cruiser: `TEST_CONSTANT_HOMES` in `.dependency-cruiser.ts` lists the four plugin-host files the suite reads past its door, each with its reason.
- The restoration register row for `server/infra/plugin-host/process-permission.test.ts` is Partial and lists the remaining read, sqlite, spawn and network denials.
