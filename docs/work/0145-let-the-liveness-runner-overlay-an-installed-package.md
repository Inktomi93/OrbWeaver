---
kind: tooling
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# Let the liveness runner overlay an installed package

## What

Give the real-corpus liveness runner a way to plant into an installed package, so `no-manual-memo-compiler-health` can get a pin. Its subject is the installed React Compiler under `packages/client/node_modules/`. The runner plants through the ResourceHost overlay, and that overlay refuses to change a non-authored tree, so no current overlay kind can take the compiler's denylist away.

## Why

It is the one `@tooling` policy left without a real-corpus pin, and item 0042 cannot finish until every policy has one. Letting the overlay reach `node_modules` changes a rule of the production reader, so it is more than a small runner change.

## Done when

`no-manual-memo-compiler-health` has a pin that passes in both directions on the one runner. The reader's rule about non-authored trees is either kept with its reason recorded or changed on purpose.

## Evidence

Filled at landing: what ran and where its output is.
