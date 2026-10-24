---
kind: bug
status: open
updated: 2026-10-24
priority: P3
area: databank
---

# The databank maintenance group loses its name after a failed census recovers

## What

Observed in a CT aria snapshot (tests/client/features/databank/hooks/databank-list-header.ct.tsx): after databank.bankHealth fails and then recovers into an empty bank, the list header's maintenance menu group renders with an empty accessible name; a fresh mount of an empty bank names it correctly. The reasons are inline JSX in packages/client/src/features/databank/hooks/use-databank-list-header.tsx.

## Why

A screen-reader user hears an unnamed group of disabled actions and cannot tell why they are disabled.

## Done when

The group is named by the current reason after any census transition (failed to empty, failed to stocked, empty to stocked), proven by a CT that drives the failed-then-recovered sequence, red first.

## Evidence

Cause: a failed re-read keeps the last census, so an empty bank rendered both group labels at once. The group's `aria-labelledby` holds one id; when the read recovered, the failed label unmounted and cleared it, and the surviving empty-bank label never re-registered.

Fix: one `MenuGroupLabel` whose text is the current reason (failed outranks empty), with the two reasons hoisted to `databank-copy.ts`. Only the header hook uses them; the census and sweep hooks share no strings.

Test: `tests/client/features/databank/hooks/databank-list-header.ct.tsx`, "the maintenance group is named after every census transition", one mount through failed, empty, stocked, failed, empty and empty-failed-empty. Red on the old source (group name empty after empty to failed to empty); green on the fix, three runs.

Ran: `pnpm test:ct tests/client/features/databank/hooks/databank-list-header.ct.tsx` (6 passed), `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json`, `pnpm lint:eslint` on the changed files.
