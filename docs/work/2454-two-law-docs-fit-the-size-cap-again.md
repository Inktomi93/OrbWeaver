---
kind: work
status: open
updated: 2026-11-11
priority: P2
area: docs
---

# Two law docs fit the size cap again

## What

`docs/law/client-architecture-lockdown.md` and `docs/law/UI-Architecture-and-Layout.md` are each just over the law size cap that `tooling/src/doc/lib/rules.ts` sets, so `tests/tooling/doc/ops/check.int.test.ts` fails on them. Recent additions to the suspending-read row and the dialog composites paragraph of the first, and to the voice table of the second, took them over.

## Why

The doc check cannot go green, or run before a push, while two law docs fail it.

## Done when

Both files are under the cap with no ruling lost: wording is cut, or a section moves to its own law doc with every citer repointed. The doc check test passes on the tree.

## Evidence

Filled at landing: what ran and where its output is.
