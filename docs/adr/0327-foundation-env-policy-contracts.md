---
kind: adr
status: active
updated: 2026-10-17
supersedes: docs/adr/0326-foundation-env-posture-contract.md
---

# Foundation env policy APIs have an owned contract

## Context

Foundation policy APIs cross server tiers. Their inputs need an explicit owner without becoming application wire contracts.

## Decision

Foundation env owns the bind, owner-fallback peer, diagnostics posture, diagnostics owner-fallback credential, configured hostname admission and public-address derivation policy APIs. Put their cross-tier input and verdict declarations in its contract.ts module. Keep the diagnostics exposure tuple and derived union together there. Policy functions and env reads stay in their existing modules. Preserve supported type exports through type-only reexports. This home admits no client wire contract, other foundation API or generic server contract folder.

## Consequences

Configured hostname policy inputs are not yet moved to this home. Native enforcement must preserve secret-bearing input boundaries and runtime admission. Judge inferred and nested API exposure as well as named imports.

## Alternatives rejected

Factory-local placement does not cover cross-tier exposure. Application contracts do not own internal configuration or secret-bearing policy inputs.
