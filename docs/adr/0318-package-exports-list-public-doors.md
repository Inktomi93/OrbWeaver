---
kind: adr
status: active
updated: 2026-10-12
---

# Package exports list their public doors by hand

## Context

Core-0 section 2 gave kit, contracts, db, server and client one wildcard exports map, `"./*": "./src/*/index.ts"`, so a module could grow without editing an import path. The wildcard matches any depth, so every folder with an index file is importable from another package, internals included, and no package declares what is public. Dead-code tools then read every folder as an entry, and tests import deep internals that production never uses.

## Decision

Each workspace package lists its public doors in its package.json `exports` map by hand, the way @orb/ui already does. The `imports` map keeps its wildcards (`#*`, `#src/*`), because they serve only the package itself. A test-only seam is a declared testing door. An import of an undeclared path fails to resolve; that is the enforcement. knip reads the declared exports as the public surface, with tests outside the production run, so an export no production package uses is reported. Homes: each `packages/*/package.json`, `docs/law/Core-0-Architecture-and-Structure.md` section 2, `knip.ts`.

## Consequences

A new public door costs one line in package.json; an internal folder costs nothing. Cross-package imports of internal folders, today found only in tests, stop resolving and move to a declared door or a testing door. The custom reachability reader proposed for dead-code detection is not needed.

## Alternatives rejected

Keep the wildcard and compute liveness from production roots with a custom reader: rejected by the owner, because it is more custom tooling to maintain when the resolver and knip already do the job once the surface is declared.
