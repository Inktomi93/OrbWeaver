---
kind: adr
status: active
updated: 2026-11-22
---

# The relational query API is reserved for nested-tree reads

## Context

Drizzle offers two read dialects: explicit select and join, and the relational query API (`db.query.<table>.findMany({ with })`), which reads the `relations()` config the client is handed. The persistence layer reads through explicit select and join. The relational API's strength is assembling a nested entity tree in one read; it cannot express a GROUP BY or a computed projection. The owner kept the relations seam over deleting it.

## Decision

The relational query API is reserved for the nested-tree read class, and `packages/db/src/schema/relations.ts` is its seam. It is not yet used by any read.

- **Two dialects, split by read shape.** A flat or aggregate read (a list, a join, a count, a GROUP BY, a computed projection) is explicit select and join. A read that assembles a nested entity tree, such as a databank document tree, an export or portability bundle (chat to messages to variants to attachments; character to chats to games) or a deep nested search, may adopt `db.query` for that read only, with a citation of this decision at the read.
- **Relations grow per consumer.** `relations.ts` holds the `users` root only. A nested-tree read adds the `relations(...)` rows it needs in the same change. Relations are runtime metadata, not DDL, so adding one is never a migration; referential integrity stays the `.references()` foreign keys in each table file.
- **The schema is handed whole.** `packages/db/src/client/index.ts` passes the `#schema` namespace to `drizzle(client, { schema })`, which is how Drizzle reads the relations config, and types `Db` from `typeof schema`.
- **Ownership still holds.** `orb/owned-table` refuses the relational door to another domain's tables like every other door (`tooling/src/eslint/owned-table.ts`, `tests/tooling/eslint-owned-table-doors.test.ts`).

## Consequences

The relations root is live through the whole-schema hand-off though no code names it, and an unused-code scan must treat the namespace passed to Drizzle as using every value export. A nested-tree feature has one place to grow its joins and one dialect to use.

The seam is written against Drizzle 0.45's relational API (`relations()` and the `schema` option). Drizzle 1.0, beta-only at this ruling, replaces both with `defineRelations` and a `relations` option; the upgrade moves this seam onto that form and keeps the ruling. Not yet done.

## Alternatives rejected

- **Delete `relations.ts` and the relational API.** The nested-tree reads would each hand-assemble their tree from flat joins.
- **Adopt `db.query` everywhere.** It cannot express the aggregate reads, so the layer would carry two dialects with no rule for which to use.
