---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# A plugin upgrade from its stored address has a test

## What

`packages/server/src/domain/plugin/verbs/upgrade-from-stored-url.ts` has no test. The bundle fetch guard in `packages/server/src/domain/plugin/context.ts` covers it by construction, and nothing proves the owner check runs before the fetch.

## Why

An upgrade fetches an address a plugin's installer supplied. A change that fetched before the owner check would pass every test.

## Done when

A server case through the composed root shows a caller who is not the owner is refused with no request sent, and a failed fetch is refused with one logged cause.

## Evidence

Filled at landing: what ran and where its output is.
