---
kind: adr
status: active
updated: 2026-10-17
---

# Foundation env posture APIs have an owned contract

## Context

Foundation owns boot policy inputs and verdicts. These APIs cross server tiers without an explicit type home. Factory-local placement does not cover that exposure.

## Decision

Foundation env owns the bind, owner-fallback peer, diagnostics posture and diagnostics owner-fallback credential policy APIs. Put their cross-tier input and verdict declarations in its contract.ts module. Keep the diagnostics exposure tuple and derived union together there. Policy functions and env reads stay in their existing modules. Preserve supported type exports through type-only reexports. This home admits no client wire contract, other foundation API or generic server contract folder.

## Consequences

The contract home and its native enforcement are not yet built. Preserve secret-bearing input boundaries and existing runtime admission. Judge inferred and nested API exposure as well as named imports.

## Alternatives rejected

Keep cross-tier shapes under the factory-local exception: that ignores their consumers. Move boot policy inputs into application contracts: that misclassifies internal configuration and secret-bearing inputs.
