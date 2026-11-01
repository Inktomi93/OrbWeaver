---
kind: tooling
status: open
updated: 2026-10-31
priority: P3
area: tooling
plan: unwired-code
---

# The derived-port rule misreads overridden and nested spreads

## What

spreadFlow in tooling/src/unwired/restated-port.ts ignores properties written after a spread, so { ...sessions, revoke: other } reports a restatement of SessionsService.revoke although other fills the slot; the same false flow feeds reach counting in language-service.ts. A nested spread ({ inner: { ...sessions } }) and two spreads of one owner each report twice, because propertyFlow does not skip an object literal value.

## Why

A false finding teaches authors to suppress the rule; a double report is noise.

## Done when

A later property overrides the spread's flow for that member, a nested spread reports once, and the rule and census tests carry a found case and a control for each.

## Evidence

Red on the old source, green after: `pnpm test:tools tests/tooling/unwired tests/tooling/eslint-derived-port-member.test.ts`.

- `tests/tooling/eslint-derived-port-member.test.ts`: `a member a later property overrides after the spread` (found, was 1 finding, now 0), `a spread whose other member no later property overrides` (control, was 2, now 1), `a spread nested in a literal property` (was 2, now 1), `two spreads of one owner` (was 2, now 1).
- `tests/tooling/unwired/port-census.int.test.ts`: `a property after a spread fills its slot` (was `revoke` in the plan, now absent; `drop` stays as the control). The census and reach counting share `flowsAt`.
- Fix: `spreadFlow` and `propertyFlow` in `tooling/src/unwired/restated-port.ts`.
- `pnpm typecheck packages/server/tsconfig.json tooling/tsconfig.json`, `pnpm lint:eslint packages tooling tests` and `pnpm depcruise` pass.
