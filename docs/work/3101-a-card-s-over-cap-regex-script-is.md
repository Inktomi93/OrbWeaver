---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: import
plan: import-robustness
---

# A card's over-cap regex script is named, not silently dropped

## What

`parseRegexScripts` in `packages/server/src/primitives/serde/card/index.ts` and `collectGlobalRegexScripts` in `packages/server/src/domain/import/loader/collect.ts` drop a script that fails the card schema, a stored-length cap included, without its name. Report each with `regexScriptLimitBreak` from `packages/contracts/src/regex/schemas.ts`, as the preset path in `packages/server/src/domain/import/substrate/preset.ts` now does.

## Why

The preset path names a script over a length cap; the card and global paths still lose it with no line in the import summary.

## Done when

A card and a settings file each carrying a script past the find-length cap import, and the summary names that script and the cap it broke.

## Evidence

Filled at landing: what ran and where its output is.
