---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
---

# A lint rule forbids a domain contract error that extends Error directly

## What

The transport maps a failure to a client answer by its base class in the domain error tree. A class under packages/server/src/domain/\*/contract/ that extends Error directly is unclassified and answers as an unknown fault. The census test for item 2485 reaches the contracts and kit packages only, because a transport suite may not import a domain and most domain doors do not re-export their errors. The errors lane rebases the existing classes; nothing stops the next one.

## Why

A census cannot see these files without a door added for a test, which the testing law forbids. A native lint selector on the directory closes the case at the declaration, and ADR 0333 allows maintained native lint rules.

## Done when

A `no-restricted-syntax` entry in the server block of eslint.config.ts refuses a class under the domain contract directories whose superclass is Error, composed with the block's existing entries, with a planted test like its sibling rule tests. The tree passes with no suppression.

## Evidence

Filled at landing: what ran and where its output is.
