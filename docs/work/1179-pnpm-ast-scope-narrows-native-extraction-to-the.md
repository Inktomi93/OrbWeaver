---
kind: bug
status: open
updated: 2026-10-20
priority: P1
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

Measured: 10,443 of 10,454 authored files are roots of exactly one world, yet extraction collects facts for every authored file in each world's closure (tooling/src/floor/compiler/semantic-inventory-extract.ts:916-927): the root world has 1,569 roots and extracts 5,716 files, client 1,584 and 4,058, tooling 1,481 and 3,815, server 1,839 and 2,335. Each shared file is extracted 2-4 times. Roots-only extraction, with closures as type context, is the fix direction; importing-world meaning stays at import sites.

Baseline on main 492d691d89 (`reports/review/warm/`): rot server cold 1:44:07 at 14.1 GB; warm with nothing changed 17:01 at 10.9 GB; after a one-line tooling edit 1:29:48 at 14.3 GB.

Measured by the 1179 lane (`reports/review/1179-trace/`): in the root tsconfig.json world, the declarations in its own test roots produce 8.05M reference rows, the dominant cost; imported product and tooling declarations add about 4.5M, which roots-only trims. Program construction is about 12 s. The lever is reference demand: rot needs references only for in-scope value exports and witness carriers. That belongs to 1183 (covering-slice reuse) or a root-limited search in the ts-morph patch. Branch commit 65c6ff5712 (Refs) has identical findings, scoped acquisition and cached membership, and halves tests-dom (12:55 to 6:42).
