---
kind: bug
status: open
updated: 2026-10-19
priority: P3
---

# tenancy-direct-read union alias sits in the bulk suppression file

## What

The 1041 type-homes-1 shard bulk-suppressed orb/no-inline-union-alias for the OwnerValue union in tooling/src/verify/lib/tenancy-direct-read.ts rather than deriving it from an as-const tuple, because the file is tenancy analysis. It is a real finding, not a false positive. Route with the security-executor batch.

## Why

AGENTS.md allows a suppression only for a verified false positive; this one is a real finding parked in eslint-suppressions.json.

## Done when

OwnerValue derives from an as-const tuple, the eslint-suppressions.json entry is removed, and the tenancy tests still pass.

## Evidence

Filled at landing: what ran and where its output is.
