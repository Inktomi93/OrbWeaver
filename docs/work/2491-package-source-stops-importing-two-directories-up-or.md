---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: architecture
lane: wt/agent-a672cae2c753c5fe3
---

# Package source stops importing two directories up, or the law drops the limit

## What

`docs/law/Core-0-Architecture-and-Structure.md` forbids a relative import that climbs more than one directory inside a package. The check that enforced it was deleted with the custom verification, and many package files now import through `../../`. Only review holds the rule.

## Why

A law the tree breaks in many places is not a rule, and deep relative imports are what the package subpath imports exist to replace.

## Done when

The sites are counted by package and judged: each is rewritten to the package's subpath import form by a codemod, or the law is amended to the rule the tree follows. If the limit stays, a native dependency-cruiser or lint rule holds it, with a planted test.

## Evidence

Filled at landing: what ran and where its output is.
