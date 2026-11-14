---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: import
plan: import-robustness
---

# Import a preset's bundled regex scripts with the preset

## What

The single-preset SillyTavern import in `packages/contracts/src/preset/index.ts` never reads `extensions.regex_scripts`. The character card import already lifts the same field (`packages/server/src/primitives/serde/card/index.ts`) and the `preset_regex_scripts` junction in `packages/db/src/schema/regex.ts` already attaches a script to a preset (D53). Import those scripts into the regex library, attach them to the new preset, and list them in the import summary. Reported by a first user importing the public preset Sola V4 Flame Complete as one JSON file: SillyTavern draws styled panels in replies, and here the reply shows the raw tags.

## Why

A preset that draws its panels with bundled regex imports as prompts that emit tags with nothing to render them, and the summary says nothing.

## Done when

Importing the Sola V4 Flame Complete file attaches its scripts to the preset and the summary states how many came over and names any refused. A test pins it with a bundled-regex fixture.

## Evidence

Filled at landing: what ran and where its output is.
