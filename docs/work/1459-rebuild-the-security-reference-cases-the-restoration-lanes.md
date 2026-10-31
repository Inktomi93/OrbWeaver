---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: security
plan: test-foundation
---

# Rebuild the security reference cases the restoration lanes moved

## What

Restoration lanes moved these legacy cases to a security batch. From plugin bridge.test.ts, through a real built guest (a showcase plugin or a toolchain-built test guest) on the production host: lore write first (macro neutralization, attached-book gate, per-plugin title namespace, 64-entry cap), then installer closure, viewer-visibility clamp, snippet identity, imagery, ingest and card-state slug stamping. From boot and env: the kept-keyfile and stranded session-secret warnings, the AUTH_FALLBACK-in-.env boot refusal, the inert SESSION_COOKIE_INSECURE cases and the processEnvSnapshot copy (tests/support/node/env-file-child.ts drives the .env cases). The case maps in docs/plans/test-foundation/design.md name each case.

## Why

These cases test plugin capability enforcement and secrets and auth posture, which is security-role work; route to security-executor. A real guest is available in tests, so nothing blocks them. The lore-write case pins a capability bypass and goes first.

## Done when

Each case is rebuilt through production with a planted-defect red, and the bridge, data-layout, env-file-load and floor-defaults register rows name no security remainder.

## Evidence

The [bridge case map](../plans/test-foundation/design.md#bridge) and the [boot case map](../plans/test-foundation/design.md#selected-case-map-boot-migration-data-layout-and-env-floors) record each decision and its home. The bridge cases run real guests on the production host through the command door:

- [Guest lore write](../../tests/server/domain/plugin/substrate/guest-lore-write.suite.int.test.ts)
- [Guest installer scope](../../tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts)
- [Guest room reads](../../tests/server/domain/plugin/substrate/guest-room-reads.suite.int.test.ts)
- [Guest call floors](../../tests/server/domain/plugin/substrate/guest-call-floors.suite.int.test.ts)

The boot and env cases are in the data-layout move suite, the env file load suite and [host env allowlist](../../tests/server/foundation/env/host-env-allowlist.int.test.ts). Each guarded behavior was planted in production in a worktree, the named case failed for its reason, and the file was restored byte for byte.

The lore case shows the bypass is real: with neutralization removed, a guest holding only `worldinfo.write` set a chat variable on the next turn. The asset scope has two layers, the owner filter and the per-owner storage key; only removing both let another owner's bytes through. The 64-entry ceiling moved to `PLUGIN_LORE_ENTRIES_PER_BOOK_MAX` in `@orb/contracts/plugin` so the case imports it from production.

The cross-owner `search.query` scope landed with [1466](1466-prove-a-guest-s-document-search-ranks-only.md) in the installer scope suite, so the bridge register row names no remainder.
