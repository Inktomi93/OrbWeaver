---
kind: work
status: open
updated: 2026-10-11
priority: P2
area: tests
plan: test-mirror
---

# Clear the test-side waivers from the widened type gates

## What

Burn down the @orb-waive markers item 900 placed in tests for no-inline-types (fixture shapes), testid-typed-only (CT stories), platform-spellings, no-loose-id-cast and no-vanity-alias. Fixture shapes derive from contracts or production types; story test ids come from the typed testid registry; platform strings use the platform constants; ids are minted through real builders, never cast; aliases are deleted in favour of the source type. Work by directory alongside 888, 891 and 894 where the same file is touched.

## Why

Tests that hand-spell types and ids do not follow product changes, which is the drift Spine-Testing section 10 forbids.

## Done when

No @orb-waive marker naming this item remains in tests for any of the five gates.

## Evidence

Filled at landing: what ran and where its output is.
