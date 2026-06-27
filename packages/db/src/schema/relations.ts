// schema/relations — drizzle `relations()` for the relational query API (reserved cross-cutting).
// Wave 0 declares only the `users` root; each Wave-1 slice ADDS its own `relations(...)` for the tables
// it lands (e.g. characters→users owner, chat_participants→chats/users) in this file. relations are
// runtime-only metadata (NOT DDL) — adding one is never a migration.

import { relations } from "drizzle-orm";
import { users } from "./users";

// The owner root. No outgoing relations yet — the owned tables (characters/personas/presets/… ) are
// Wave-1 stubs; their slice agents add the `many(...)` side here when they land.
export const usersRelations = relations(users, () => ({}));
