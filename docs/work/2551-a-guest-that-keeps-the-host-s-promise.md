---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# A guest that keeps the host's promise resolve function leaks handles and breaks teardown

## What

When the host resolves a guest promise, the engine binding reads the guest's global Promise and hands guest code the binding's own resolve function (packages/server/src/infra/plugin-host, the sandbox and marshal modules). A guest that keeps that function and calls it again leaks handles. When that plugin's runtime is torn down the engine module in its worker aborts, and closing the worker pool then fails. Found with a real guest on main and on the CPU window branch. Source: the leg-six security review of the security lane under reports/review.

## Why

A plugin can make its own teardown, and the pool's shutdown, fail. Host handle accounting should not depend on guest behavior.

## Done when

The host settles a guest promise without exposing a function the guest can call twice to leak a handle, or a second call is refused without a leak. A real-guest test calls the kept function again, then retires the plugin and closes the pool cleanly, red before the change.

## Evidence

Filled at landing: what ran and where its output is.
