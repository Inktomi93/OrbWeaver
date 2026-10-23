---
kind: tooling
status: open
updated: 2026-10-23
priority: P3
area: tests
---

# Six non-integration test files import the server warm module

## What

`tests/support/node/composed-real.ts` is the integration project's import-phase warm, now loaded through that project's `setupFiles`. Six files outside that project still import it by hand: two `.contract.test.ts`, two `.dom.test.ts` (browser world), one `.test.ts` and `tests/support/node/corpus-read-responder.test.ts`.

## Why

A browser-world or unit test that needs the composed server graph is in the wrong project, or does not need the warm at all; either way the import is a smell the project split should make impossible.

## Done when

Each of the six either moves to the integration suffix, or drops the import with its tests still green; no file outside the integration project imports `composed-real.ts`.

## Evidence

Filled at landing: what ran and where its output is.
