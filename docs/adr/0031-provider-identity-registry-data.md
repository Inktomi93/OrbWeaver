---
kind: adr
status: active
updated: 2026-09-23
---

# Provider identity is registry data

## Context

Not recorded in the ledger row.

## Decision

Provider identity is registry data, not a credential routing axis. The two credential tuples — CRED_SOURCES / CredentialSource (the dispatch axis) and CRED_PROVIDERS / CredentialProvider (the storage axis) — are retired and are spelled here in plain prose because no declaration answers to either name any more; `user_credentials.provider` stores the provider registry id and is domain-validated rather than closed by a credential tuple or database CHECK. Provider rows are extensible data; `ChatApi` and `Wire` remain separate closed protocol/implementation axes. Homes: `@orb/contracts/inference` provider schema and built-in rows · `@orb/inference/registry/providers` (`createProviderRegistry`) · `@orb/inference` wire registry.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
