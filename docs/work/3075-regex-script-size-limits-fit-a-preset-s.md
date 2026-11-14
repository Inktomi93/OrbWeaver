---
kind: work
status: open
updated: 2026-11-14
priority: P1
area: import
plan: import-robustness
---

# Regex script size limits fit a preset's panels, and a refused script is named

## What

Ruled under delegation. `MAX_REPLACE_LENGTH` in `packages/contracts/src/regex/schemas.ts` bounds stored text only: a replacement is inert until it renders, and the render tier is its guard. Raise it to 65,536 characters. `MAX_FIND_REGEX_LENGTH` in `packages/kit/src/regex/index.ts` is shared by the storage schema and the executor's pre-compile check. Length is a weak stand-in for cost: the real guards are the stacked-quantifier check in the same file and the server's per-call timeout, and the browser has no timeout at any length. Raise it to 16,384 characters in the one constant, keep both guards, and keep storage and executor equal. The Sola preset's largest replacement is 24,648 characters and its largest find pattern 10,189. A script an import refuses for either limit, or for the quantifier check, is named in the import summary with the limit it broke. State each limit's reason in a comment beside its constant.

## Why

The limits were set for hand-typed scripts. A public HUD preset's main panels exceed them, so they could not be stored even once bundled scripts import.

## Done when

Both constants hold the new values with their reasons, a script at the old limits plus one character stores and runs, a script over a new limit is refused by name in the import summary, and the tests for both limits and for the server timeout on a slow long pattern pass.

## Evidence

Filled at landing: what ran and where its output is.
