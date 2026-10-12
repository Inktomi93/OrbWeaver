---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Legacy tests move to tests/legacy and leave the inner loop

## What

Every test file not yet rebuilt moves, by `git mv`, to `tests/legacy/` at its same mirror path. The folder is the ledger: no list to maintain. Lane floors, commit hooks and the strict gates exclude `tests/legacy/**` by population; CI runs it as its own project, so the regression net stays up. Legacy files reach package internals through the root raw-reach map (`#<package>/<path>`) without grants, because `tests-raw-package-reach` and its grant tables exclude the folder. A domain's legacy folder is deleted when its rebuilt suite in the real mirror carries every case. New tests go only into the real mirror, at full strictness.

## Why

The test bulk sets the cost of every step, and per-site waivers on legacy tests hide the standard new tests must meet.

## Done when

`tests/legacy/` holds every un-rebuilt test; the inner-loop runners and the strict gates skip it; a CI project runs it; nothing outside it may be added under it (a gate refuses a new file there); the raw-reach grants for legacy files are deleted; item 983 can narrow the exports maps without breaking a legacy test.

## Evidence

Filled at landing: what ran and where its output is.
