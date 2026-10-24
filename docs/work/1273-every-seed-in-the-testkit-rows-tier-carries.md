---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: testkit
---

# Every seed in the testkit rows tier carries the Rows suffix

## What

The testkit rows tier (the `rows` door, landing with the cake reads branch) holds the seeds that read rows back for persistence suites. Four of them were renamed to `<seed>Rows` when their verb-only door twins were split out; about fifty-five others (for example `seedTag`, `seedWorldBook`, `seedCharacterHistory`) still carry a plain seed name although they read rows. Owner ruling: the suffix means the function reads rows, not that a door twin exists.

## Why

One naming rule for one concept; a reader that reads like a verb seed hides the row read from the suite that imports it.

## Done when

Every export of the rows tier that reads rows ends in `Rows`; the rename runs through the `rename-identifier` and `move-import-names` codemods with fixtures, not hand edits; `pnpm test tests/support` and the persistence suites pass; the testkit README's rows door row states the rule.

## Evidence

Filled at landing: what ran and where its output is.
