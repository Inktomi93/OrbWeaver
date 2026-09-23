---
kind: work
status: done
updated: 2026-09-23
priority: P3
area: docs
evidence: 5f1987b6a2c8feafb3e259a427a40699820ef8ec
---

# Correct the open-json split row in the tooling-size design doc

## What

In the tooling-size split design (now deleted), fix the row for verify/lib/open-json-parity-fact.ts. Change the new-home cell from `verify/lib/open-json-writers.ts` to `verify/lib/open-json-vocabulary.ts`. Also correct the description of what moved: schema derivation (`deriveSchema`, `Schema`) moved into open-json-vocabulary.ts with the writer half. It did not stay in open-json-parity-fact.ts. The row should say that SQL text, reader collection and the verdict are what stayed.

## Why

This design doc is still active. It names a module that does not exist and says schema derivation stayed in a file that now imports it. A reader looking for the writer and schema seam through this doc will search the wrong file.

## Done when

The row names verify/lib/open-json-vocabulary.ts as the new home and lists deriveSchema among the moved symbols. `grep -rn --exclude-dir=node_modules --exclude-dir=.git open-json-writers docs tooling` finds no match outside docs/reviews/. `pnpm check:docs` exits 0.

## Evidence

Filled at landing: what ran and where its output is.
