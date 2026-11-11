---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# The plugin sandbox has no test that ambient globals stay absent or that the guest's reachable names are an allow-list

## What

packages/server/src/infra/plugin-host/realm.ts says setTimeout, fetch, process and require must stay absent from the guest context and that what a guest can enumerate is an explicit allow-list asserted by name; packages/server/src/infra/plugin-host/membrane.ts lists a capability gate, an opaque chat handle and a third mechanism it owns. Both headers once said an escape suite pinned these. The tests under tests/server/infra/plugin-host cover the dump depth guard and marker-shaped card state only. No test enumerates the guest global object or asserts a refused capability. Source: the claims lane report, the rv-claims file under reports/lanes.

## Why

The WASM sandbox is the plugin trust boundary. The realm header records that a time source shipped live because absence was assumed and never asserted, and a runtime upgrade can add a global the same way.

## Done when

A test under tests/server/infra/plugin-host boots the production realm, enumerates the guest global object and compares it with one allow-list, and fails when a name is added. A second test shows a call without its capability grant is refused and a foreign chat handle is refused. Both headers name the test files.

## Evidence

Filled at landing: what ran and where its output is.
