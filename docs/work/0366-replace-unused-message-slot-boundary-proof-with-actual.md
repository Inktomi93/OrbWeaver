---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: contracts
---

# Replace unused message-slot boundary proof with actual contract checks

## What

Retire the unused messageSlotSchema and MessageSlot export after moving meaningful slot and privacy assertions to their actual owning boundaries. Remove the unused deltaKindSchema while retaining the delta vocabulary and wire eligibility checks.

## Why

Neither validator has a product caller, including in the active output-schema migration. Message-slot tests incorrectly claim their parser protects durable rows and streams. D26 defines the stored slot and variant split, not this unused parser.

## Done when

Confirm consumers through structural, literal, barrel and active-lane checks. Preserve D26 against the actual database row and keep real chat output and stream privacy tests. Reuse the output migration checks where applicable; do not claim they cover subscriptions. Remove helper-only validation tests and stale boundary comments. Preserve DELTA_KINDS, DeltaKind and wire capability assertions. Run affected contract, row-type and actual boundary checks without changing storage or message behavior.

## Evidence

Filled at landing: what ran and where its output is.
