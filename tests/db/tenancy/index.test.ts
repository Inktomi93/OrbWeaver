// @subject packages/db/src/tenancy/index.ts
// biome-ignore lint/performance/noNamespaceImport: the census denominator is every native schema export, including future tables that named imports would omit.
import * as schema from "@orb/db/schema";
import type { ScopingRow } from "@orb/db/tenancy";
import { ROOM_TABLE, TABLE_SCOPING } from "@orb/db/tenancy";
import { expect, test } from "@orb/testkit/node";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable, sqliteTable, text } from "drizzle-orm/sqlite-core";

const OWNER_COLUMN = "ownerId";
const CHAT_COLUMN = "chatId";
const REQUIRED_FOREIGN_KEYS = { junction: 2, parent: 1, global: 0 } as const;

type Tables = ReadonlyMap<string, SQLiteTable>;
type Registry = Readonly<Partial<Record<string, ScopingRow>>>;

function tablesOf(module: Readonly<Record<string, unknown>>): Tables {
  const tables = new Map<string, SQLiteTable>();
  for (const [name, value] of Object.entries(module)) {
    if (is(value, SQLiteTable)) {
      tables.set(name, value);
    }
  }
  return tables;
}

const LIVE_TABLES = tablesOf(schema);

/** The schema fact that contradicts a row's declared class, or undefined when they agree. */
function incoherence(table: SQLiteTable, row: ScopingRow): string | undefined {
  const columns = Object.keys(getTableColumns(table));
  const stamped = columns.includes(OWNER_COLUMN);
  if (row.scope === "ownerId") {
    return stamped ? undefined : "no-owner-id";
  }
  if (stamped) {
    return "stamped";
  }
  const roomGated = columns.includes(CHAT_COLUMN);
  if (row.scope === "membership") {
    // biome-ignore lint/performance/noDynamicNamespaceImportAccess: The schema census follows the canonical room-table key across all namespace exports.
    return roomGated || getTableName(table) === getTableName(schema[ROOM_TABLE]) ? undefined : "no-chat-id";
  }
  if (roomGated) {
    return "room-gated";
  }
  return getTableConfig(table).foreignKeys.length >= REQUIRED_FOREIGN_KEYS[row.scope] ? undefined : "too-few-fks";
}

/** Every disagreement between a set of table exports and a scoping registry, as `<kind>:<export>`. */
function scopingFindings(tables: Tables, registry: Registry): readonly string[] {
  const findings: string[] = [];
  for (const [name, table] of tables) {
    const row = registry[name];
    if (row === undefined) {
      findings.push(`unclassified:${name}`);
      continue;
    }
    if (row.sqlName !== getTableName(table)) {
      findings.push(`misnamed:${name}`);
    }
    const contradiction = incoherence(table, row);
    if (contradiction !== undefined) {
      findings.push(`${contradiction}:${name}`);
    }
    const reasons = row.scope === "ownerId" ? [row.why, row.stamp] : [row.why];
    if (reasons.some((reason) => reason.trim().length === 0)) {
      findings.push(`unreasoned:${name}`);
    }
  }
  for (const [name, row] of Object.entries(registry)) {
    if (row !== undefined && !tables.has(name)) {
      findings.push(`stale:${name}`);
    }
  }
  return findings;
}

function withTables(overrides: Readonly<Record<string, SQLiteTable | undefined>>): Tables {
  const tables = new Map(LIVE_TABLES);
  for (const [name, table] of Object.entries(overrides)) {
    if (table === undefined) {
      tables.delete(name);
    } else {
      tables.set(name, table);
    }
  }
  return tables;
}

test("the live schema and the scoping registry agree on every table, its SQL name, its class and its reasons", () => {
  expect(LIVE_TABLES.size).toBeGreaterThan(0);
  expect(LIVE_TABLES.get(ROOM_TABLE)).toBe(schema.chats);
  expect(scopingFindings(LIVE_TABLES, TABLE_SCOPING)).toEqual([]);
  // Only a drizzle table enters the census: relations and plain objects are not tables.
  expect(tablesOf({ usersRelations: schema.usersRelations, notATable: { ownerId: 1 } }).size).toBe(0);
});

test("every table a foreign key reaches is a schema barrel export, so the barrel is the whole table set", () => {
  const exported = new Set(LIVE_TABLES.values());
  const pending = [...exported];
  const visited = new Set<SQLiteTable>();
  const privateTables: string[] = [];
  for (let table = pending.pop(); table !== undefined; table = pending.pop()) {
    if (visited.has(table)) {
      continue;
    }
    visited.add(table);
    if (!exported.has(table)) {
      privateTables.push(getTableName(table));
    }
    for (const key of getTableConfig(table).foreignKeys) {
      pending.push(key.reference().foreignTable);
    }
  }
  expect(privateTables).toEqual([]);
});

// The retired ownerid-registry and table-scoping-class proof rows, each replayed against the real registry
// with the live schema edited the way the row's fixture edited it.
const ownerIdColumn = text("owner_id");
const shorthandOwnerId = text("owner_id");
const characterFk = text("character_id").references(() => schema.characters.id);
const tagFk = text("tag_id").references(() => schema.tags.id);

const FLAGGED: readonly { readonly tables: Readonly<Record<string, SQLiteTable | undefined>>; readonly finding: string; readonly why: string }[] = [
  {
    tables: { planted: sqliteTable("not_classified", { ownerId: ownerIdColumn }) },
    finding: "unclassified:planted",
    why: "an ownerId stamp on a table with no row, including the shorthand and imported-columns spellings",
  },
  {
    tables: { planted: sqliteTable("brand_new_table", { id: text("id").primaryKey() }) },
    finding: "unclassified:planted",
    why: "a new table is unauthorizable until its scoping class is written down",
  },
  {
    tables: { characters: sqliteTable("not_classified", { ownerId: text("owner_id") }) },
    finding: "misnamed:characters",
    why: "a classified binding name cannot launder a stamp onto another SQL table",
  },
  {
    tables: { characters: sqliteTable("characters", { id: text("id").primaryKey() }) },
    finding: "no-owner-id:characters",
    why: "an ownerId row whose table lost the stamp classifies nothing",
  },
  {
    tables: { messages: sqliteTable("messages", { id: text("id").primaryKey(), ownerId: text("owner_id") }) },
    finding: "stamped:messages",
    why: "stamping an owner onto a membership-scoped chat child changes what authorizes a read (D18)",
  },
  {
    tables: { characterTags: sqliteTable("character_tags", { id: text("id").primaryKey(), characterId: characterFk }) },
    finding: "too-few-fks:characterTags",
    why: "a junction that lost a parent foreign key is no longer a junction",
  },
  {
    tables: { chatDigests: undefined },
    finding: "stale:chatDigests",
    why: "a row whose table the schema no longer declares",
  },
];

const ACQUITTED: readonly { readonly tables: Readonly<Record<string, SQLiteTable | undefined>>; readonly registry?: Registry; readonly why: string }[] = [
  {
    tables: { characters: sqliteTable("characters", { id: text("id").primaryKey(), ownerId: shorthandOwnerId }) },
    why: "a stamp on a table classified ownerId, however the column is spelled",
  },
  { tables: { chats: sqliteTable("chats", { id: text("id").primaryKey() }) }, why: "the room is its own membership anchor without a chatId" },
  {
    tables: { messages: sqliteTable("messages", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => schema.chats.id) }) },
    why: "a chatId-bearing child is membership-scoped",
  },
  { tables: { settings: sqliteTable("settings", { key: text("key").primaryKey() }) }, why: "a system table with no owner, room or foreign key is global" },
  {
    tables: { chatTags: sqliteTable("chat_tags", { chatId: text("chat_id"), tagId: tagFk, ownerId: text("owner_id") }) },
    why: "chat_tags carries chatId and ownerId and the stamp wins (D30)",
  },
  {
    tables: { planted: sqliteTable("planted_owner_like", { userOwnerId: text("user_owner_id"), ownerHandle: text("owner_handle") }) },
    registry: { ...TABLE_SCOPING, planted: { sqlName: "planted_owner_like", scope: "global", why: "an owner-like column name is not the stamp" } },
    why: "the stamp is the exact ownerId property, not an owner-like column",
  },
  {
    tables: { characters: undefined, notClassified: sqliteTable("characters", { ownerId: text("owner_id") }) },
    registry: { ...TABLE_SCOPING, characters: undefined, notClassified: TABLE_SCOPING.characters },
    why: "the verdict follows the SQL table: a differently named binding of the classified table passes under its own row",
  },
];

test("each retired ownership and scoping proof row is still caught or still acquitted", () => {
  for (const row of FLAGGED) {
    expect(scopingFindings(withTables(row.tables), TABLE_SCOPING), row.why).toEqual([row.finding]);
  }
  for (const row of ACQUITTED) {
    expect(scopingFindings(withTables(row.tables), row.registry ?? TABLE_SCOPING), row.why).toEqual([]);
  }
});
