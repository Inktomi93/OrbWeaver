// Gate: table-scoping-class — EVERY schema table declares HOW a caller's tenancy reaches it (AGENTS §1
// "ownership is INHERITED, not stamped"; D18/D20/D23). Five classes: ownerId · membership · junction ·
// parent · global. A new table with no row is RED AT BIRTH; a row naming no live table is RED (stale); a row
// whose class CONTRADICTS the derived schema shape (an `ownerId` class with no ownerId column, a
// `membership` class with no chatId) is RED. HARD authority, no exemption vocabulary: the only way to change
// the verdict is a reviewed edit to TABLE_SCOPING_ROWS in lib/tenancy-scope.ts. DECLARED LIMIT: this gate proves the DECLARATION
// is coherent with the schema — it does NOT prove any read actually applies the class's predicate (the
// membership rung is control-flow-dependent; the cross-tenant behavioral sweep stays that proof).
//
// FAMILY `tenancy-scope` — the shared reader is `lib/tenancy-scope.ts`, and this member is the one that
// DECLARES the data the other three consume: `TABLE_SCOPING_ROWS` plus `tableScopingClasses` /
// `tableShapeOf`. It is the family's coherence check, which is why it alone is HARD with no exemption
// vocabulary — the three `owner-scoped-*` members can waive a call site, but nothing may waive the
// classification their (a)-class set is read from.
// POPULATION PORT: the same set, byte-for-byte in membership. The legacy
// `scanRoot: (p) => p.includes("packages/db/src/schema/")` (40223a0915eda72dd8ab35fbdeaf9e9892089717 —
// the whole family converted in one commit, `b54b2c34e`) becomes `DRIZZLE_SCHEMA_POPULATION`
// (`{ in: ["@db"], under: ["packages/db/src/schema/**"] }`); the only change is substring matching
// becoming anchored, and 30 tracked paths contain that segment while the same 30 begin with it. Note which
// population that is: this member declares the DRIZZLE-SCHEMA family's shared constant while belonging to
// THIS family. The classification data is tenancy's, the files it reads are the schema's, and the two are
// deliberately not merged — the shared reader's header records the same split.
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { ReadySchemaFact, SchemaModel, SchemaTable } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";
import type { ScopingClass, TableShape } from "../lib/tenancy-scope.ts";
import { TABLE_SCOPING_ROWS, tableScopingClasses, tableShapeOf } from "../lib/tenancy-scope.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
/** The room table is its OWN membership anchor — it carries `id`, not `chatId`. Name-keyed, so this gate
 *  carries a tripwire: if the real tree stops declaring it, this gate has gone blind (§4.6). */
export const ROOM_TABLE = "chats";

const MESSAGE =
  "every schema table must declare HOW a caller's tenancy reaches it — the scoping class (ownerId / " +
  "membership / junction / parent / global) that an authorization predicate is built from. Ownership is " +
  "INHERITED, not stamped (AGENTS §1): a table without an `ownerId` is not unscoped, its scope derives " +
  "through the FK chain — but WHICH chain has to be written down, once, where a reader and a gate can both " +
  "see it. Add a row to TABLE_SCOPING_ROWS in tooling/src/verify/lib/tenancy-scope.ts. " +
  'A bare `"table"` token = UNCLASSIFIED (no row yet). Any other message = an INCOHERENCE: the row ' +
  "exists but the schema shape contradicts it — either the column/FK shape changed (re-classify the row) or " +
  "the declaration was always wrong.";

const FIX =
  "classify the table: `ownerId` (it carries the D23 stamp) · `membership` (it carries a chatId — authority " +
  "is chat_participants, D18) · `junction` (a pure link; BOTH parents must be reachable) · `parent` (scope " +
  "inherits ONE owning FK) · `global` (a system table with no tenancy). Write the reason — what an " +
  "authorization check for this table actually predicates on.";

const UNCLASSIFIED = "no TABLE_SCOPING_ROWS row — classify it";

/** The INCOHERENCE KINDS — a closed vocabulary naming the SHAPE FACT that contradicts the declared class, so
 *  it does not move when a table gains an unrelated column. */
const INCOHERENCE_KINDS = ["no-owner-id", "stamped", "no-chat-id", "room-gated", "too-few-fks"] as const;
type IncoherenceKind = (typeof INCOHERENCE_KINDS)[number];

const INCOHERENCE_MESSAGE: Readonly<Record<IncoherenceKind, string>> = {
  "no-owner-id": "declared ownerId-scoped but declares no `ownerId` column",
  stamped: "carries an `ownerId` column, so its scope is the stamp, not the roster / two parents / a parent",
  "no-chat-id": "declared membership-scoped but carries no `chatId` column and is not the room table itself",
  "room-gated": "carries a `chatId` column, so the room gates it and it is `membership`-scoped",
  "too-few-fks": "a junction needs TWO independently-scoped parents (a parent needs one), and it declares fewer",
};

/** Which shape fact contradicts this table's declared class — or undefined when they agree. The check is
 *  FALSIFIABILITY, not derivation: `junction` vs `parent` is a judgment the row's reason carries, but a class
 *  whose defining column/FK is absent is a lie the machine CAN catch. */
function incoherence(sqlName: string, cls: ScopingClass, s: TableShape): IncoherenceKind | undefined {
  const checks: Readonly<Record<ScopingClass, () => IncoherenceKind | undefined>> = {
    ownerId: () => (s.hasOwnerId ? undefined : "no-owner-id"),
    membership: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      return s.hasChatId || sqlName === ROOM_TABLE ? undefined : "no-chat-id";
    },
    junction: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      if (s.hasChatId) {
        return "room-gated";
      }
      return s.fkCount >= 2 ? undefined : "too-few-fks";
    },
    parent: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      if (s.hasChatId) {
        return "room-gated";
      }
      return s.fkCount >= 1 ? undefined : "too-few-fks";
    },
    global: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      return s.hasChatId ? "room-gated" : undefined;
    },
  };
  return checks[cls]();
}

const BLIND =
  'table-scoping-class is keyed on the room table name "chats", which the schema no longer declares — the ' +
  "`membership` arm has gone blind (a name-keyed gate that resolves to nothing reports ✓ forever). Re-point " +
  "ROOM_TABLE in tooling/src/verify/gates/table-scoping-class.ts";

function stale(name: string): string {
  return `TABLE_SCOPING_ROWS names "${name}" but the schema declares no such table — delete the stale row in tooling/src/verify/lib/tenancy-scope.ts (two-direction ratchet).`;
}

/** Judge one schema table's row against its shape; reports and returns nothing — the caller only needs the
 *  `seen` bookkeeping, which it already has via `table.sqlName`. */
function judgeTable(ctx: GatePolicyContext, table: SchemaTable): void {
  const nameArg = table.call.getArguments()[0];
  if (nameArg === undefined) {
    return;
  }
  const token = nameArg.getText();
  const row = tableScopingClasses().get(table.sqlName);
  if (row === undefined) {
    ctx.report.node(nameArg, { token, offset: 0, message: UNCLASSIFIED });
    return;
  }
  const bad = incoherence(table.sqlName, row.scope, tableShapeOf(table));
  if (bad !== undefined) {
    ctx.report.node(nameArg, { token, offset: 0, message: `${bad} — ${INCOHERENCE_MESSAGE[bad]}` });
  }
}

/** The stale + blindness arms are WHOLE-SCHEMA claims, name-keyed against the LIVE registry: a conformance
 *  mini-project declares one table and would "prove" every other row dead. Guard on the real schema barrel actually
 *  being in the loaded population (own-tables-only's precedent). */
function reportStaleRows(ctx: GatePolicyContext, schemaFact: ReadySchemaFact<SchemaModel>, seen: ReadonlySet<string>): void {
  if (!schemaFact.receipt.paths.includes(SCHEMA_BARREL)) {
    return;
  }
  const anchor = ctx.files[0];
  if (anchor === undefined) {
    throw new Error("table-scoping-class received an empty effective population");
  }
  const anchorPath = ctx.relativePath(anchor);
  if (!seen.has(ROOM_TABLE)) {
    ctx.report.file(anchorPath, { message: BLIND });
  }
  for (const { table: name } of TABLE_SCOPING_ROWS) {
    if (!seen.has(name)) {
      ctx.report.file(anchorPath, { message: stale(name) });
    }
  }
}

export const gate = defineGate({
  id: "table-scoping-class",
  family: "tenancy-scope",
  authority: "hard",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const schemaFact = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, schemaFact);
      const seen = new Set<string>();
      for (const table of schemaFact.value.tables) {
        seen.add(table.sqlName);
        judgeTable(ctx, table);
      }
      reportStaleRows(ctx, schemaFact, seen);
    },
  }),

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("brand_new_table", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 1, token: '"brand_new_table"', messageIncludes: "classify it" },
      why: "the founding shape — a NEW table is unauthorizable until someone writes down which predicate scopes it. RED at birth, exactly like ownerid-registry's stamp arm",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("characters", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 1, token: '"characters"', messageIncludes: "no-owner-id" },
      why: "the COHERENCE arm: `characters` is declared ownerId-scoped, so losing the stamp column must RED — a class map that only checked NAMES would silently keep asserting a dead predicate",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("messages", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
      },
      expect: { count: 1, token: '"messages"', messageIncludes: "stamped" },
      why: "the D18 inversion: stamping an owner onto a membership-scoped chat child changes WHAT authorizes a read — the declaration and the schema must not silently disagree",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
        "packages/db/src/schema/tag.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { characters } from "./character.ts";\nexport const t = sqliteTable("character_tags", { id: text("id").primaryKey(), characterId: text("character_id").references(() => characters.id) });\n',
      },
      expect: { count: 1, token: '"character_tags"', messageIncludes: "too-few-fks" },
      why: "a junction that lost a parent FK is no longer a junction — the derived arm catches the class drifting away from the shape",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
      },
      why: "the (a) shape agreeing with its row — a stamped table declared ownerId-scoped",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("chats", { id: text("id").primaryKey() });\n',
      },
      why: "the ROOM table is its own membership anchor — it carries `id`, not `chatId`, and must NOT red (the name-keyed special case; its blindness tripwire only fires when the real schema barrel is loaded)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/db/src/schema/message.ts":
          'import { chats } from "./chat.ts";\nexport const t = sqliteTable("messages", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id) });\n',
      },
      why: "the (b) shape agreeing with its row — a chatId-bearing child is membership-scoped (D18)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("settings", { key: text("key").primaryKey() });\n',
      },
      why: "the (e) shape — a system table with no owner column, no chatId and no FK is legitimately un-scoped",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("chat_tags", { chatId: text("chat_id"), tagId: text("tag_id"), ownerId: text("owner_id") });\n',
      },
      why: "DECLARED LIMIT / precedence: a row satisfying TWO classes takes the one an auth check actually spells. chat_tags carries BOTH chatId and ownerId and is (a) — D30 makes the tagger the scope subject, so the `membership` coherence check must not claim it",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const settings = sqliteTable("settings", { key: text("key").primaryKey() });\n',
        "packages/db/src/schema/x.ts": "export const notATable = someOtherFn({ ownerId: 1 });\n",
      },
      why: "only `sqliteTable(name, {…})` calls are tables — no other call shape may enter the registry (the shared schema fact's own discovery, not this gate's, is what proves this); a real classified table rides along so the fact's own zero-member floor is not what this row is testing",
    },
  ],
});
