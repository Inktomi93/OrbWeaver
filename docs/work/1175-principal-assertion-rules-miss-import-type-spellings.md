---
kind: bug
status: open
updated: 2026-10-20
priority: P2
area: security
plan: test-foundation
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
