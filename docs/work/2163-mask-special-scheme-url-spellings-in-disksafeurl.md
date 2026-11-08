---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Mask special-scheme URL spellings in diskSafeUrl

## What

Spellings such as http:\h?token=T and http\:/h/?token=T skip the argv mask in tooling/src/snap/lib/disk-safe-argv.ts because SCHEME_AUTHORITY wants ://.

## Why

The token stays in run.json argv although the URL parser reads these forms as http.

## Done when

A URL flag value without scheme:// after the lead strip is refused, or the mask reads from URL.parse.

## Evidence

Filled at landing: what ran and where its output is.
