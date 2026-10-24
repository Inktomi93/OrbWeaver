---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: tests
---

# Client, inference, kit, contracts and db test mirrors import only their package door

## What

Item 1255 gave `tests/server/**` a dependency-cruiser rule: a suite imports production only from its mirror's front door, the server's exported subpaths, the primitives and the testkit doors, with type-only imports of other doors allowed and a closed reasoned list for constants. The other test trees (`tests/client`, `tests/inference`, `tests/kit`, `tests/contracts`, `tests/db`) have no equivalent, so a client suite may import another feature's internals or a kit suite another module's private file.

## Why

The cake is a cake only if every test tree obeys it; one enforced mirror and four unenforced ones is the gap item 1255 closed for the server alone.

## Done when

One native dependency-cruiser rule per test tree, modelled on `serverTestMirrorRules()`, with the package door (and for the client, the feature's own `index.ts`) as the allowed import and type-only imports of other doors allowed; a planted sideways import and a planted internal import each fail; the existing sites are swept through the composed root, the harness seams or `move-import-names`, with any closed exceptions reasoned per entry; a tooling test plants trees for each rule; the testkit README's enforcement table lists the rules.

## Evidence

Filled at landing: what ran and where its output is.
