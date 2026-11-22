// schema/relations: drizzle `relations()` for the relational query API (`db.query.*.findMany({ with })`).
// D356 reserves that API for nested-tree reads; flat and aggregate reads stay explicit select and join. Relations are
// runtime metadata, not DDL (adding one is never a migration; the `.references()` FKs in each table file are the
// referential integrity), and this file grows one `relations(...)` row per nested-tree read, in that read's change.

import { relations } from "drizzle-orm";
import { users } from "./users.ts";

// The owner root this file grows from (D356). No code names it: drizzle reads it from the `#schema` namespace the
// client hands over whole as `drizzle(client, { schema })`.
export const usersRelations = relations(users, () => ({}));
