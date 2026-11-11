---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
---

# The host types tooling test holds its time budget inside a large batch

## What

`tests/tooling/platform-host-types.test.ts` compiles real programs. One case finished in under three seconds alone and timed out at the default five-second budget when run in a batch of tooling files on a loaded machine.

## Why

A timeout under load reads as a failure of the types it checks.

## Done when

The compile cases carry the scaled budget the load-budget helper provides, or share one compile, and the file passes inside the tooling batch on a loaded machine.

## Evidence

Filled at landing: what ran and where its output is.
