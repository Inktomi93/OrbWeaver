---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Name the cleared scripts in the bulk change toast when the library list is not cached

## What

The bulk change toast in `packages/client/src/features/regex/components/regex-bulk-bar.tsx` takes the names of the cleared scripts from the cached `listScripts`. When that list is not cached, the description ends in ": ." and names nothing.

## Why

The toast is how the user learns which scripts lost their depth and author scope. With no names it says something was cleared but not what.

## Done when

The toast names every cleared script whether or not the library list is cached, or its line is worded so it needs no names.

## Evidence

Filled at landing: what ran and where its output is.
