// schema/agent-principals — the agent-principal registry satellite (D60; agent-principal-design/01 §2). One
// thin table keyed on the agent's `users` row: the dispatch + admin-surface metadata that does NOT belong on
// the reserved identity root (`users` is FK'd by everything; agent-only metadata must not pollute it with
// nullable columns). The owner is DERIVED via `userId → users.ownerUserId` (one FK — no stamp; D23).
//
// Producer = `domain/sessions` (NOT its own domain): `provisionAgentPrincipal` INSERTs the `users` row + this
// satellite row in ONE `db.batch` (agent-principal-design/01 §4). The db-structure gate maps it there.
//
// FLAG[PD-17]: born EMPTY at AP0 (an empty table is baseline-cheap; its FK web must be born, not migrated).
// The ONLY INSERT site is `provisionAgentPrincipal` (AP1); `sourceKind` is the AP3 speaker-source dispatch key.

import { AGENT_SOURCE_KINDS } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// checkList — file-local (the world-info/tag precedent; a CHECK is static DDL and carries no bound params).
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

export const agentPrincipals = sqliteTable(
  "agent_principals",
  {
    // The agent's own principal row — PK IS the FK to `users.id` (the users row IS the principal). CASCADE:
    // owner-delete → users-row-delete → this row deleted (referential physics, no reaper).
    userId: text("user_id")
      .$type<UserId>()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // The speaker-source registry's dispatch key (AP3). `buddy` only in v1.
    sourceKind: text("source_kind", { enum: AGENT_SOURCE_KINDS }).notNull(),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [
    check(
      "agent_principals_source_kind_check",
      sql.raw(`source_kind in (${checkList(AGENT_SOURCE_KINDS)})`),
    ),
  ],
);
