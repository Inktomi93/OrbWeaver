// schema/relations — drizzle `relations()` for the relational query API (`db.query.*.findMany({ with })`).
// CONSUMER-DRIVEN: relations are runtime-only metadata (NOT DDL — adding one is never a migration, and the
// real referential integrity is the `.references()` FKs in each table file). Phase 3 (the schema layer) has
// NO query-API consumers — those arrive with the `@orb/server` domain/persistence layer (Phase 4), which
// adds each `relations(...)` here as its readers need a `with`-join. This is deliberately the `users` root
// only, not a stub awaiting Phase-3 work. The FK graph is already complete in the table files; this file
// grows lazily, per-join, when a consumer exists.

import { relations } from "drizzle-orm";
import { users } from "./users";

// The owner root. Outgoing `many(...)` relations to the owned tables are added in Phase 4 alongside the
// first reader that joins them (FKs already enforce ownership at the DB level regardless).
export const usersRelations = relations(users, () => ({}));
