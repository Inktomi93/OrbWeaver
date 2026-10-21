---
kind: bug
status: blocked
updated: 2026-10-21
priority: P2
area: security
blocked: owner
---

# Principal assertion rules miss import-type spellings

## What

The Principal assertion and return-site rules in eslint.config.js match only TSTypeReference, so row as import("@orb/contracts/identity").Principal passes both.

## Why

An asserted Principal mints authority without the resolver; one unmatched spelling reopens the hole the rules close.

## Done when

Both rules match TSImportType spellings of Principal with red-first rows, and existing rows hold.

## Evidence

Filled at landing: what ran and where its output is.

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
