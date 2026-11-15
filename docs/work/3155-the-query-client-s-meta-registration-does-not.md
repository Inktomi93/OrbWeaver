---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
---

# The query client's meta registration does not type query meta

## What

`packages/client/src/data/query-client.ts` registers `AppMeta` as TanStack's `queryMeta`, but `AppMeta` is an interface, and TanStack accepts the registration only for a type that is assignable to `Record<string, unknown>`. An interface has no index signature, so the registration falls back and every `meta` read and write is typed as an open record.

## Why

A misspelled `errorToast` or `shownInline` on a query compiles, and the global error toast then ignores it silently.

## Done when

`AppMeta` is declared so the registration takes effect, a misspelled meta key fails the client typecheck, and every existing meta site compiles.

## Evidence

Filled at landing: what ran and where its output is.
