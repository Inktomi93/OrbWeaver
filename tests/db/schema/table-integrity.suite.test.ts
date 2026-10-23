// @subject packages/db/src/schema/index.ts
// Table-level schema invariants judged on the real drizzle objects (Tier-1-DB.md §Invariants). Every predicate also
// runs on small synthetic tables, so a predicate that stopped seeing the real schema cannot pass by seeing nothing.
// biome-ignore lint/performance/noNamespaceImport: the census denominator is every schema export, including tables a named import would omit.
import * as schema from "@orb/db/schema";
import { expect, test } from "@orb/testkit/node";
import { is } from "drizzle-orm";
import {
  blob,
  foreignKey,
  getTableConfig,
  index,
  primaryKey,
  SQLiteColumn,
  SQLiteTable,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

type TableConfig = ReturnType<typeof getTableConfig>;

interface TableView {
  readonly name: string;
  readonly config: TableConfig;
  /** Maps each column object to the JS property key the schema author wrote. */
  readonly keyOf: ReadonlyMap<SQLiteColumn, string>;
}

function tableViews(exports: Readonly<Record<string, unknown>>): readonly TableView[] {
  const tables = new Set(Object.values(exports).filter((value): value is SQLiteTable => is(value, SQLiteTable)));
  return [...tables].map((table) => ({
    name: getTableConfig(table).name,
    config: getTableConfig(table),
    keyOf: new Map(Object.entries(table).flatMap(([key, value]) => (is(value, SQLiteColumn) ? [[value, key] as const] : []))),
  }));
}

const REAL = tableViews(schema);

/** A column that starts an index, a primary key or a unique constraint: SQLite can seek on it. */
function leadingColumns({ indexes, primaryKeys, uniqueConstraints }: TableConfig): ReadonlySet<SQLiteColumn> {
  const leading = new Set<SQLiteColumn>();
  for (const { config } of indexes) {
    const first = config.columns[0];
    if (first !== undefined && is(first, SQLiteColumn)) {
      leading.add(first);
    }
  }
  for (const { columns } of [...primaryKeys, ...uniqueConstraints]) {
    const first = columns[0];
    if (first !== undefined) {
      leading.add(first);
    }
  }
  return leading;
}

function label({ name, keyOf }: TableView, column: SQLiteColumn): string {
  return `${name}.${keyOf.get(column) ?? column.name}`;
}

// ── primary keys ───────────────────────────────────────────────────────────────────────
function keylessTables(views: readonly TableView[]): readonly string[] {
  return views.filter(({ config }) => !(config.columns.some((column) => column.primary) || config.primaryKeys.length > 0)).map(({ name }) => name);
}

// ── foreign-key indexes ───────────────────────────────────────────────────────────────────────────────
// SQLite indexes only the parent side of an FK, so the child's leading column must start an index, a unique
// constraint or the primary key, or every parent delete scans the child table.
function unindexedForeignKeys(views: readonly TableView[]): readonly string[] {
  return views.flatMap((view) => {
    const leading = leadingColumns(view.config);
    return view.config.foreignKeys.flatMap((key) => {
      const child = key.reference().columns[0];
      return child !== undefined && (child.primary || child.isUnique || leading.has(child)) ? [] : [child === undefined ? view.name : label(view, child)];
    });
  });
}

// ── foreign-key onDelete ───────────────────────────────────────────────────────────────────────────────
// SQLite's silent default is NO ACTION; the policy must be stated at the column.
function foreignKeysWithoutOnDelete(views: readonly TableView[]): readonly string[] {
  return views.flatMap((view) =>
    view.config.foreignKeys
      .filter((key) => key.onDelete === undefined)
      .map((key) =>
        key
          .reference()
          .columns.map((column) => label(view, column))
          .join("+"),
      ),
  );
}

// ── soft references ──────────────────────────────────────────────────────────────────────────────
const ID_COLUMN_TYPES: ReadonlySet<string> = new Set(["SQLiteText", "SQLiteTextJson", "SQLiteInteger", "SQLiteTimestamp", "SQLiteBoolean"]);

/** An id-shaped column (its JS key ends `Id`) with no foreign key: the shape D24 outlaws. */
function softReferences(views: readonly TableView[]): readonly string[] {
  return views.flatMap((view) => {
    const foreignChildren = new Set(view.config.foreignKeys.flatMap((key) => key.reference().columns));
    return view.config.columns
      .filter((column) => {
        const key = view.keyOf.get(column);
        return key?.endsWith("Id") === true && ID_COLUMN_TYPES.has(column.columnType) && !column.primary && !foreignChildren.has(column);
      })
      .map((column) => label(view, column));
  });
}

/** Each is a reviewed exception to D24: the referent is not an orbweaver row, so there is nothing to point a foreign key at. */
const SOFT_REFERENCES = {
  "audit_logs.entityId": "the append-only audit log must outlive a referent of unknown type, so the one polymorphic soft reference lives here",
  "automation_rules.creationRequestId": "an owner-local birth-request identity validated at the authored boundary; no request row exists",
  "automation_rules.rulePresetId": "a member of the closed RULE_PRESET_IDS code tuple, not a table row",
  "chat_generation_observations.generationId": "the upstream provider's opaque generation handle, not an orbweaver row",
  "chat_generation_observations.turnId": "the internally minted turn-grouping identity in the (chatId, turnId, ordinal) key; no turn row exists",
  "chat_stream_events.generationId": "an internally minted correlation identity for one token-stream generation; no generation entity exists",
  "embedding_calls.invocationId": "groups the physical batches of one logical embedding invocation; no invocation row exists",
  "imagery_generations.callId": "groups the output rows of one physical generation call; a native call has no execution row",
  "message_variants.generationId": "the upstream OpenRouter generation handle a variant was billed under, an external provider id",
  "roster_preset_rules.rulePresetId": "the same RULE_PRESET_IDS code-tuple member on the saved-roster side",
  "session_entries.sdkSessionId": "the Claude Agent SDK's own resume handle, owned by the vendor runtime",
  "user_connections.providerId": "a provider-registry id: built-in providers have no row to reference, and plugin rows are runtime data",
  "users.externalId": "an external IdP subject identifier minted by another system",
} as const satisfies Readonly<Record<string, string>>;

// ── rejected shapes ─────────────────────────────────────────────────────────────────────────────
type RejectedShape =
  | { readonly kind: "table"; readonly table: string; readonly cite: string }
  | { readonly kind: "column"; readonly table: string; readonly column: string; readonly cite: string }
  | { readonly kind: "column-pattern"; readonly table: string; readonly pattern: RegExp; readonly cite: string };

const MESSAGE_ECONOMICS = [
  "content",
  "reasoning",
  "model",
  "provider",
  "costUsd",
  "promptSnapshot",
  "rawRequest",
  "rawResponse",
  "tokensIn",
  "tokensOut",
  "contextWindow",
  "maxOutputTokens",
  "ttftMs",
] as const;

/** Tables are judged by SQL name and columns by JS property key: the identity a reintroduction re-spells. */
const REJECTED_SHAPES: readonly RejectedShape[] = [
  { kind: "column", table: "chats", column: "ownerId", cite: "D18 (chats are membership-scoped)" },
  { kind: "column", table: "chats", column: "memoryEnabled", cite: "D293 (memory on/off is a global setting and a per-user switch, not per-chat)" },
  { kind: "column", table: "chats", column: "sessionId", cite: "D25 (agent-sdk cache -> sdk-session.ts)" },
  { kind: "column", table: "chats", column: "sessionDirty", cite: "D25 (agent-sdk cache -> sdk-session.ts)" },
  { kind: "column-pattern", table: "chats", pattern: /presetId/iu, cite: "D58 (never bind a preset to a chat)" },
  { kind: "column", table: "messages", column: "parentId", cite: "D27 (one branch axis: chat forks, not a message DAG)" },
  ...MESSAGE_ECONOMICS.map((column) => ({
    kind: "column" as const,
    table: "messages",
    column,
    cite: "D26 (messages is a pure slot; content and economics live on message_variants)",
  })),
  { kind: "table", table: "character_versions", cite: "D28 (the card is a flat characters row)" },
  { kind: "column", table: "characters", column: "currentVersionId", cite: "D28 (no character_versions, no currentVersionId)" },
];

function rejectedShapes(views: readonly TableView[]): readonly string[] {
  return views.flatMap((view) =>
    REJECTED_SHAPES.filter((shape) => shape.table === view.name).flatMap((shape) => {
      if (shape.kind === "table") {
        return [`${view.name} — ${shape.cite}`];
      }
      return [...view.keyOf.values()]
        .filter((key) => (shape.kind === "column" ? key === shape.column : shape.pattern.test(key)))
        .map((key) => `${view.name}.${key} — ${shape.cite}`);
    }),
  );
}

// ── the real schema ──────────────────────────────────────────────────────────────────────────────────
test("the census reaches tables and foreign keys, so the checks below cannot pass over nothing", () => {
  expect(REAL.length).toBeGreaterThan(0);
  expect(REAL.some(({ config }) => config.foreignKeys.length > 0)).toBe(true);
  expect(REAL.some(({ config }) => config.indexes.length > 0)).toBe(true);
});

test("every table declares a primary key", () => {
  expect(keylessTables(REAL)).toEqual([]);
});

test("every foreign-key child column leads an index, a unique constraint or the primary key", () => {
  expect(unindexedForeignKeys(REAL)).toEqual([]);
});

test("every foreign key states its onDelete action", () => {
  expect(foreignKeysWithoutOnDelete(REAL)).toEqual([]);
});

test("an id-shaped column without a foreign key is exactly a reviewed soft reference", () => {
  expect(softReferences(REAL).toSorted()).toEqual(Object.keys(SOFT_REFERENCES).toSorted());
});

test("no ledger-rejected table or column is reintroduced", () => {
  expect(rejectedShapes(REAL)).toEqual([]);
});

// ── controls: each predicate flags what it exists for and passes its twin ───────────────────────────────
const parents = sqliteTable("parents", { id: text("id").primaryKey() });
const others = sqliteTable("others", { id: text("id").primaryKey() });

test("the primary-key check flags a keyless table and an index that is not a key, and passes inline and composite keys", () => {
  const keyless = sqliteTable("chat_locks", { chatId: text("chat_id"), holder: text("holder") });
  const indexedOnly = sqliteTable("character_tags", { characterId: text("character_id"), tagId: text("tag_id") }, (t) => [index("tag_idx").on(t.tagId)]);
  const inline = sqliteTable("chats", { id: text("id").primaryKey(), title: text("title") });
  const composite = sqliteTable("tags", { characterId: text("character_id"), tagId: text("tag_id") }, (t) => [
    primaryKey({ columns: [t.characterId, t.tagId] }),
  ]);
  expect(keylessTables(tableViews({ keyless, indexedOnly }))).toEqual(["chat_locks", "character_tags"]);
  expect(keylessTables(tableViews({ inline, composite }))).toEqual([]);
});

test("the FK-index check flags an unindexed FK, an uncovered sibling, a non-leading composite term and a composite key's second term", () => {
  const bare = sqliteTable("bare", { chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }) });
  const sibling = sqliteTable(
    "sibling",
    {
      chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }),
      characterId: text("character_id").references(() => others.id, { onDelete: "set null" }),
    },
    (t) => [index("sibling_chat_idx").on(t.chatId)],
  );
  const secondTerm = sqliteTable(
    "second_term",
    {
      chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }),
      userId: text("user_id").references(() => others.id, { onDelete: "cascade" }),
    },
    (t) => [uniqueIndex("chat_user_unique").on(t.chatId, t.userId)],
  );
  const keySecond = sqliteTable(
    "key_second",
    {
      chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }),
      tagId: text("tag_id").references(() => others.id, { onDelete: "cascade" }),
    },
    (t) => [primaryKey({ columns: [t.chatId, t.tagId] })],
  );
  expect(unindexedForeignKeys(tableViews({ bare }))).toEqual(["bare.chatId"]);
  expect(unindexedForeignKeys(tableViews({ sibling }))).toEqual(["sibling.characterId"]);
  expect(unindexedForeignKeys(tableViews({ secondTerm }))).toEqual(["second_term.userId"]);
  expect(unindexedForeignKeys(tableViews({ keySecond }))).toEqual(["key_second.tagId"]);
});

test("the FK-index check passes an indexed FK, a leading composite term, an FK that is the key, an inline unique and a table with no FKs", () => {
  const indexed = sqliteTable("indexed", { chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }) }, (t) => [
    index("indexed_idx").on(t.chatId),
  ]);
  const leadingTerm = sqliteTable(
    "leading_term",
    { messageId: text("message_id").references(() => parents.id, { onDelete: "cascade" }), idx: text("idx") },
    (t) => [uniqueIndex("message_idx_unique").on(t.messageId, t.idx)],
  );
  const leadingKey = sqliteTable(
    "leading_key",
    { characterId: text("character_id").references(() => parents.id, { onDelete: "cascade" }), tagId: text("tag_id") },
    (t) => [primaryKey({ columns: [t.characterId, t.tagId] })],
  );
  const leadingConstraint = sqliteTable(
    "leading_constraint",
    { chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }), slot: text("slot") },
    (t) => [unique("leading_constraint_unique").on(t.chatId, t.slot)],
  );
  const isKey = sqliteTable("is_key", {
    ownerId: text("owner_id")
      .primaryKey()
      .references(() => parents.id, { onDelete: "restrict" }),
  });
  const inlineUnique = sqliteTable("inline_unique", {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .unique()
      .references(() => parents.id, { onDelete: "cascade" }),
  });
  const noForeignKeys = sqliteTable("no_fks", { id: text("id").primaryKey(), embedding: text("embedding") });
  expect(unindexedForeignKeys(tableViews({ indexed, leadingTerm, leadingKey, leadingConstraint, isKey, inlineUnique, noForeignKeys }))).toEqual([]);
});

test("the onDelete check flags an FK with no options and one whose options omit onDelete, and passes every stated action", () => {
  const unstated = sqliteTable("unstated", { chatId: text("chat_id").references(() => parents.id) });
  const emptyOptions = sqliteTable("empty_options", { chatId: text("chat_id").references(() => parents.id, {}) });
  const tableLevel = sqliteTable("table_level", { a: text("a"), b: text("b") }, (t) => [
    foreignKey({ columns: [t.a, t.b], foreignColumns: [parents.id, parents.id] }),
  ]);
  const stated = sqliteTable("stated", {
    chatId: text("chat_id").references(() => parents.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references(() => parents.id, { onDelete: "set null" }),
    otherId: text("other_id").references(() => parents.id, { onDelete: "restrict", onUpdate: "cascade" }),
  });
  expect(foreignKeysWithoutOnDelete(tableViews({ unstated, emptyOptions, tableLevel }))).toEqual([
    "unstated.chatId",
    "empty_options.chatId",
    "table_level.a+table_level.b",
  ]);
  expect(foreignKeysWithoutOnDelete(tableViews({ stated }))).toEqual([]);
});

test("the soft-reference check flags an id-shaped column without an FK, including beside a composite FK on a sibling, and passes covered or exempt shapes", () => {
  const plain = sqliteTable("plain", { widgetId: text("widget_id") });
  const siblingOnly = sqliteTable("contributions", { providerId: text("provider_id"), hash: text("hash") }, (t) => [
    foreignKey({ columns: [t.hash], foreignColumns: [parents.id] }).onDelete("cascade"),
  ]);
  const covered = sqliteTable("covered", { widgetId: text("widget_id").references(() => parents.id, { onDelete: "cascade" }) });
  const compositeCovered = sqliteTable("composite_covered", { providerId: text("provider_id"), hash: text("hash") }, (t) => [
    foreignKey({ columns: [t.providerId, t.hash], foreignColumns: [parents.id, parents.id] }).onDelete("cascade"),
  ]);
  const notIdShaped = sqliteTable("not_id_shaped", { id: text("id").primaryKey(), name: text("name"), widget: text("widget") });
  const ownKey = sqliteTable("own_key", { widgetId: text("widget_id").primaryKey() });
  const otherBuilder = sqliteTable("other_builder", { widgetId: blob("widget_id") });
  expect(softReferences(tableViews({ plain, siblingOnly }))).toEqual(["plain.widgetId", "contributions.providerId"]);
  expect(softReferences(tableViews({ covered, compositeCovered, notIdShaped, ownKey, otherBuilder }))).toEqual([]);
});

test("the rejected-shape check judges a table by SQL name, flags each banned column once, and leaves unruled tables alone", () => {
  const chats = sqliteTable("chats", {
    id: text("id").primaryKey(),
    ownerId: text("owner_id"),
    sessionId: text("session_id"),
    ["memoryEnabled"]: text("memory_enabled"),
    activePresetId: text("active_preset_id"),
    presetLabel: text("preset_label"),
  });
  const renamedBinding = sqliteTable("chats", { ownerId: text("owner_id") });
  const messages = sqliteTable("messages", { id: text("id").primaryKey(), content: text("content"), role: text("role") });
  const characterVersions = sqliteTable("character_versions", { id: text("id").primaryKey() });
  const unruledOwner = sqliteTable("rooms", { ownerId: text("owner_id"), activePresetId: text("active_preset_id") });
  const bindingNamedChats = sqliteTable("rooms", { ownerId: text("owner_id") });
  const variants = sqliteTable("message_variants", { content: text("content"), model: text("model"), costUsd: text("cost_usd") });
  const compliant = sqliteTable("chats", { id: text("id"), hostUserId: text("host_user_id"), title: text("title") });
  const subjects = (exports: Readonly<Record<string, unknown>>): readonly string[] =>
    rejectedShapes(tableViews(exports)).map((finding) => finding.split(" — ")[0] ?? finding);
  expect(subjects({ chats })).toEqual(["chats.ownerId", "chats.memoryEnabled", "chats.sessionId", "chats.activePresetId"]);
  expect(subjects({ renamedBinding })).toEqual(["chats.ownerId"]);
  expect(subjects({ messages })).toEqual(["messages.content"]);
  expect(subjects({ characterVersions })).toEqual(["character_versions"]);
  expect(subjects({ unruledOwner, bindingNamedChats, variants, compliant })).toEqual([]);
});
