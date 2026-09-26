---
kind: adr
status: active
updated: 2026-09-26
---

# A plugin provider id is claimed per owner

## Context

A plugin provider id is namespaced by plugin slug, and any user may install a plugin with any slug (D147). A deployment-global definition per id would let the first user to enable a slug fix its provider ids for every other user.

## Decision

A `plugin:` provider id resolves per user. Each user who enables a plugin that declares the id holds their own claim on it in `plugin_provider_claims`, keyed by owner and provider id and bound to one definition hash. `provider_rows` stores plugin definitions as content keyed by id and definition hash, so two users' different definitions of one id are two rows. A user reaches a plugin row only through their own claim, and only while the claim's install is enabled (D147).

A claim is permanent for its owner. A connection and a credential keep only the provider id, so the owner's id never re-points at a different definition. The owner's activation that changes a claimed definition fails, and a changed definition needs a new provider id. The claim outlives the install as a tombstone and is deleted with the user.

No user's claim affects another user's activation, so a refused activation's `lastError` names only the caller's own id. Admin rows stay deployment-wide and unique by id. A CHECK keeps admin ids and `plugin:` ids disjoint, and built-in ids stay unshadowable. No admin verb deletes another user's claim.

Homes: `packages/db/src/schema/connection-bindings.ts`, `packages/server/src/domain/connection/persistence/provider-rows.ts`, `packages/inference/src/registry/providers.ts`. Enforcers: `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts`, `tests/server/domain/connection/persistence/provider-rows.int.test.ts`, `tests/inference/registry/providers.test.ts`.

## Consequences

The store's reconciliation reaps a plugin definition row that no claim references. Identical definitions from several owners share one content row. A plugin author who changes a provider definition publishes it under a new id, or each owner who enabled the old one refuses the upgrade.

## Alternatives rejected

Recording the definition hash on `user_connections` and releasing a definition once no enabled install references it: a squatter who keeps their plugin enabled still holds the id for every user. An admin verb that reaps another user's definition: it is a cross-owner write on plugin state that D147 declines, and per-owner claims leave nothing for it to release.
