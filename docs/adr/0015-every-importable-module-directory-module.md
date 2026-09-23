---
kind: adr
status: active
updated: 2026-09-23
---

# Every importable module is a directory module

## Context

Not recorded in the ledger row.

## Decision

Uniform directory-modules: every importable module is a directory with `index.ts`; internals are flat + relative-imported. The app packages use the identical `exports`/`imports` maps (`"./*": "./src/*/index.ts"`, `"#*"` likewise, `.` → `./src/index.ts`). Two bounded exceptions preserve deliberate package shapes: `@orb/ui` uses an explicit per-subpath `exports` map for its nested `primitives/`/`charts/`/`content/` tree — every target is still a directory `index.ts` front door; and `@orb/inference` exposes only `.` while its exact package-root `src/deps.ts` file is the injected composition seam beside `src/index.ts`. Inference types live in `src/contract/`; `deps.ts` only re-exports the composition contract and does not create a second type home. The `package-layout` gate permits exactly those two inference root files and rejects any additional loose root module. Constraint: Node `exports` wildcards resolve ONE template with no flat→dir fallback, so an unruled mixed flat/dir layout forces exception lists that rot — never widen either exception by analogy.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
