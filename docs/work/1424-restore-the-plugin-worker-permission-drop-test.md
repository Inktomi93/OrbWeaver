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

Filled at landing: what ran and where its output is.
