---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The optional-input scanners read the plugin author worlds from their tsconfigs

## What

tooling/src/unwired/optional-population.ts AUTHOR_SOURCE and SDK_SOURCE decide which files are plugin author and SDK source by path pattern; the optional-\* scanners and brand-flow use them. The author tsconfigs' parsed file lists answer the same question from the program.

## Why

Owner ruling: a library or package answer comes from the program, never a path regex.

## Done when

Both sets come from the parsed file lists of the author and SDK tsconfigs; the patterns are deleted; a planted author file outside the old pattern is classed author; the optional scanners' reports match before and after row for row.

## Evidence

Filled at landing: what ran and where its output is.
