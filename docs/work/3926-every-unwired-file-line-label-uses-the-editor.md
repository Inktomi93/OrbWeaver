---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a153864a73f49fb3e
plan: unwired-code
---

# Every unwired file:line label uses the editor's line

## What

Unwired labels built from getLineAndCharacterOfPosition (why.ts, sites.ts, verify.ts, the trial, routes, keys, unions, dom, variants, build, procedures, shapes, port-targets) number lines by TypeScript's line table, which also breaks at CR, U+2028 and U+2029. Literal hits number lines by LF, as git and editors do. tooling/src/ui-facts/recipe-check.ts feeds a site line into getPositionOfLineAndCharacter from a source not yet checked.

## Why

In a file with a raw CR, U+2028 or U+2029, a label sits above the editor line and disagrees with a literal hit for the same site, so a reader opens the wrong line.

## Done when

One home converts a program position to an LF editor line and every unwired file:line label uses it; recipe-check's line source is checked and fixed if it mixes conventions; a planted file with U+2028 before a site gives the same line from a label and from a literal hit.

## Evidence

Filled at landing: what ran and where its output is.
