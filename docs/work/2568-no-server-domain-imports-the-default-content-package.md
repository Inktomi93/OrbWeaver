---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: server
plan: checked-law
---

# No server domain imports the default-content package, and a dependency rule holds it

## What

The default-content ledger ruling says the composition root closes over the package's readers and injects them, so no domain module imports the package. packages/server/src/domain/embeddings/substrate/seed-embedding.ts imports findSeedEmbedding from it as a value, and packages/server/src/domain/settings/contract/seeder.ts imports a type from it. The server-cake dependency rule allows both, so nothing fails.

## Why

The ruling keeps seeders unaware of where bytes come from. A direct import is the sideways reach the ruling refuses, and with no rule the next author copies it.

## Done when

The seed embedding lookup reaches the embeddings domain as an injected op typed in the domain's contract and wired in entry/compose. The plate shape the settings seeder needs has a home the domain may import. A dependency-cruiser rule from packages/server/src/domain to packages/default-content fails on a planted import and passes on the tree. The path rule for the package names that rule.

## Evidence

Filled at landing: what ran and where its output is.
