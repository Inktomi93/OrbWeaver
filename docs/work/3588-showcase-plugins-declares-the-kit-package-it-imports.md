---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: tooling
---

# showcase-plugins declares the kit package it imports

## What

`packages/showcase-plugins/package.json` omits `@orb/kit`, which the package direction in `AGENTS.md` allows and which the code imports. The root `package.json` declares every workspace package, so the import resolves anyway and nothing fails. Declare it, and decide whether a check should fail an undeclared workspace import.

## Why

The declared dependencies and the real imports disagree, and the sentence that undeclared imports do not resolve is not enforced.

## Done when

The manifest lists `@orb/kit`, and a named check fails a workspace import missing from the importing package's manifest.

## Evidence

Filled at landing: what ran and where its output is.
