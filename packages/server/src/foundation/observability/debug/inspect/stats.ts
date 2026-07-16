// foundation/observability/debug/inspect/stats — row counts for the backbone tables. Reads @orb/db DOWN
// (db is a lower package — no DbInspector port needed, ledger). Labels are driven off the schema objects
// (`getTableName`) so a rename can't silently drift them.

import type { Db } from "@orb/db";
import {
  assets,
  characterEmbeddings,
  characterSnapshots,
  characters,
  characterTags,
  chatEvents,
  chatParticipants,
  chats,
  chatTags,
  imageEmbeddings,
  messages,
  messageVariants,
  notifications,
  personas,
  presets,
  sessionEntries,
  sessions,
  tags,
  userCredentials,
  users,
  workloads,
  worldBooks,
  worldEntries,
} from "@orb/db";
import { count, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

// The owned-entity backbone + the roster/RAG/asset tables.
const COUNTED_TABLES: SQLiteTable[] = [
  users,
  sessions,
  userCredentials,
  personas,
  characters,
  characterSnapshots,
  chats,
  chatParticipants,
  messages,
  messageVariants,
  chatEvents,
  worldBooks,
  worldEntries,
  presets,
  sessionEntries,
  characterEmbeddings,
  imageEmbeddings,
  assets,
  tags,
  characterTags,
  chatTags,
  workloads,
  notifications,
];

async function countRows(db: Db, table: SQLiteTable): Promise<number> {
  const rows = await db.select({ n: count() }).from(table);
  return Number(rows[0]?.n ?? 0);
}

/** Row counts for the backbone tables (label = schema table name). */
export async function tableCounts(db: Db): Promise<Record<string, number>> {
  const entries = await Promise.all(COUNTED_TABLES.map(async (t) => [getTableName(t), await countRows(db, t)] as const));
  return Object.fromEntries(entries);
}
