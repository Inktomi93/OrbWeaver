---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: import
---

# A restored card re-exported from the target box does not hash-match its restored row

## What

Found by the 1278/1280 lane in one probe: a card restored on box B and re-exported from B does not match B's own restored row by import hash. Within one export the hashes are self-consistent, so 1280's seat binding holds; across a restore round trip they drift. Cause unverified; possibly a lossy card round trip (fields normalized or dropped on import, re-rendered differently on export).

## Why

Item 1279's ruled fix moves asset and card referrers onto content-hash identity; hashes that drift across a restore round trip would make that identity unstable and break dedup on a second restore.

## Done when

Reproduced or refuted with a composed round trip (export A, restore into B, export B, compare identities); if real, the drifting field is named and either the import preserves it or the identity excludes it, with the round trip as the test. Must be settled before 1279's hash-identity legs land.

## Evidence

Filled at landing: what ran and where its output is.
