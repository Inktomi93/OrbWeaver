---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: verify
---

# Make the CT config mirror order-checked and retire hand copies

## What

ct-config-mirror-parity compares configSections and the CT mirror realSettingsSections as multisets, so an order drift (2617d03278 put attachments first) passed it and only a CT caught it. Compare each anchor sequence of (anchor, nav.id) too. Separately, config-section-partition.dom.test.ts realDoorSections() is a third hand copy of the door that lacks several sections; import the door or bring it to the full list.

## Why

Door order is render order by law in compose/config-sections.ts; hand copies drift silently.

## Done when

A mustFlag row with two swapped sections is flagged, the clean mirror passes, and the partition test reads the real door or a complete list.

## Evidence

Filled at landing: what ran and where its output is.

Also: knip.ts patternList duplicates patternsOf in tooling/src/verify/ops/knip-negative-liveness.ts and a third copy in its test; tooling already imports config from knip.ts, so export one helper there and consume it.
