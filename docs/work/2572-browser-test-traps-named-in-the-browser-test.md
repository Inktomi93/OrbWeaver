---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tests
plan: checked-law
---

# Browser test traps named in the browser test rule fail lint or a dependency rule

## What

The browser test rule bans an e2e import of the client lib barrel, reading a name through innerText, and a bare route.abort. No lint selector or dependency rule covers any of the three.

## Why

Each trap fails late and far from its cause. A selector fails at the line that introduces it.

## Done when

An ESLint selector in the component and e2e test block refuses innerText name reads and a bare route.abort, and a dependency-cruiser rule bars the client lib barrel from tests/e2e. Each fails on a planted case and passes on the tree. The browser test rule names them.

## Evidence

Filled at landing: what ran and where its output is.
