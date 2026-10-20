---
kind: bug
status: doing
updated: 2026-10-20
priority: P1
lane: wt/agent-a2c08a6bd3fb0e5ae
plan: test-foundation
---

# pnpm ast scope narrows native extraction to the worlds it reads

## What

rot server ran 1:44:07 at 14.1 GB peak on main after 1133, 1154 and 1155: the server scope still extracted the whole root tsconfig.json world in one single-core worker, because the scope argument does not narrow which native worlds are extracted. testonly kit took 4:37 at 6.5 GB. Timings are in reports/review/heavy1/.

## Why

One verb over one package must not pay for the whole repository, and 14.1 GB leaves no margin under the 16 GB per-run bar on a standard runner.

## Done when

A scoped verb extracts only the worlds whose files it reads or whose consumers it must count, with identical findings; rot server runs in minutes well under 16 GB, measured with /usr/bin/time beside the 1:44:07 baseline.

## Evidence

Filled at landing: what ran and where its output is.

Prior-art review (`reports/review/semantic-store-prior-art.md`): currentDemandDescriptors returns every program whenever a shape plan is set (tooling/src/floor/code-facts/semantic-inventory.ts:261), demandShapePartitions then runs a membership extraction per descriptor (:519-521), each loading a whole Program, one worker at a time. Scope the acquired worlds first, then make membership a cached cheap read.

Extraction collects authored closure facts beyond each world's roots. Measurements are in `reports/review/1179-trace/`. Roots-only extraction keeps closures as type context and importing-world meaning at import sites.

Baseline on main 492d691d89 (`reports/review/warm/`): rot server cold 1:44:07 at 14.1 GB; warm with nothing changed 17:01 at 10.9 GB; after a one-line tooling edit 1:29:48 at 14.3 GB.

Measured by the 1179 lane (`reports/review/1179-trace/`): in the root tsconfig.json world, the declarations in its own test roots produce 8.05M reference rows, the dominant cost; imported product and tooling declarations add about 4.5M, which roots-only trims. Program construction is about 12 s. The lever is reference demand: rot needs references only for in-scope value exports and witness carriers. That belongs to 1183 (covering-slice reuse) or a root-limited search in the ts-morph patch. Branch commit 65c6ff5712 (Refs) has identical findings, scoped acquisition and cached membership, and halves tests-dom (12:55 to 6:42).

Branch `65c6ff5712` awaits review. The root-world cost target remains unmet. An inference overload-ordering difference remains untraced. Reference-demand work belongs to item 1183; source delivery does not complete this item.
