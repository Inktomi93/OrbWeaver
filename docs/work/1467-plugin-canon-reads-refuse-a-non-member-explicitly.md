---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: security
---

# Plugin canon reads refuse a non-member explicitly instead of failing on a TypeError

## What

With the visibility check removed, the bridge's canon read for a non-member installer throws a TypeError rather than returning nothing, so it fails closed by accident. Found by the 1459 lane's planted defect. The read should refuse or return empty through an explicit check.

## Why

A fail-closed outcome that depends on a crash breaks the moment the null path changes.

## Done when

The canon read returns the explicit empty or refusal for a non-member, and the room-reads suite asserts that outcome rather than any error. Route to security-executor.

## Evidence

The canon read already refuses a non-member through an explicit check: `listMessages` in `packages/server/src/domain/plugin/substrate/bridge.ts` returns `[]` when chat's `resolveViewerVisibility` answers `null`. The TypeError came from a planted removal that `tsc` refuses, because the verdict type is `ViewerVisibility | null`. No product change was needed.

A removal that compiles must substitute a floor for the missing verdict. With the check removed and `NO_HISTORY_FLOOR` substituted, the kicked installer's guest read the host's opening line.

[Guest room reads](../../tests/server/domain/plugin/substrate/guest-room-reads.suite.int.test.ts) now asserts the canon bytes: a present member reads the opening line, and the kicked installer reads `[]`. Both plants fail the case for their own reason. The raw removal logs `{ ok: false, name: "TypeError" }`, and the compiling bypass returns the opening line. The bridge was restored byte for byte after each plant.
