---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# A CT build inside a mutation sandbox stays out of the real checkout

## What

A CT build run inside a Stryker sandbox rewrote .bin shims in the real checkout through pnpm's dependency check, and the CT gallery output sits under node_modules. Isolate both if CT mutation testing returns.

## Why

A mutation run that writes into the checkout it reads can corrupt the tree that other runs and lanes share.

## Done when

A CT build in a sandbox leaves the real checkout byte for byte unchanged, shown by a git status and a node_modules hash before and after.

## Evidence

Filled at landing: what ran and where its output is.
