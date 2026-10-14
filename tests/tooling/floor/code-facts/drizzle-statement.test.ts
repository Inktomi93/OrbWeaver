// @subject tooling/src/floor/code-facts/drizzle-statement.ts
// @subject tooling/src/verify/gates/owner-scoped-reads.ts
// @subject tooling/src/floor/code-facts/drizzle-sql.ts
// @subject tooling/src/floor/code-facts/drizzle-predicate.ts
// @subject tooling/src/floor/code-facts/drizzle-predicate-argument.ts

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { closeDb, createDb } from "@orb/db";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { readSqlAliasStability } from "@orb/tooling/floor/code-facts/drizzle-sql";
import { readStatementOf } from "@orb/tooling/floor/code-facts/drizzle-statement";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { CallExpression, Project, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { readDrizzleClientCall } from "../../../../tooling/src/verify/lib/drizzle-client-call.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const PRODUCER = "packages/server/src/domain/persona/persistence/producer.ts";
const RECIPIENT = "packages/server/src/domain/persona/persistence/recipient.ts";
const CONFIG = "packages/server/tsconfig.json";
const SCHEMA = `import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
`;
const DATABASE = `export * from "./schema/persona.js";
import * as schema from "./schema/persona.js";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
export type Db = LibSQLDatabase<typeof schema>;
`;
const BUILDER = `import { eq } from "drizzle-orm";
import { personas, type Db } from "@orb/db";
export function owned(db: Db, ownerId: string) { return db.select().from(personas).where(eq(personas.ownerId, ownerId)); }
`;
const RECIPIENT_HEAD = `import { and, eq } from "drizzle-orm";
import { personas, type Db } from "@orb/db";
import { owned } from "./producer.js";
`;

const SCOPE_SCHEMA = `
export const users = sqliteTable("users", { id: text("id").primaryKey() });
export const assets = sqliteTable("assets", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
export const characters = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), avatarAssetId: text("avatar_asset_id").references(() => assets.id) });
export const tags = sqliteTable("tags", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
export const characterTags = sqliteTable("character_tags", { characterId: text("character_id").references(() => characters.id), tagId: text("tag_id").references(() => tags.id) });
export const chatParticipants = sqliteTable("chat_participants", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id), userId: text("user_id").references(() => users.id), leftSeq: text("left_seq"), characterId: text("character_id").references(() => characters.id) });
`;
const SCOPE_HEAD = `import { and, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { assets, characters, characterTags, tags, chats, chatParticipants, type Db } from "@orb/db";
`;
const CORRELATED_BODY = `import { alias } from "drizzle-orm/sqlite-core"; const seats = alias(chatParticipants, "seats");
function search(db: Db) { return or(sql\`lower(\${chats.id}) like \${"needle"}\`, exists(db.select({named: sql\`1\`}).from(seats).innerJoin(characters, eq(characters.id, seats.characterId)).where(and(eq(seats.chatId, chats.id), sql\`lower(\${characters.id}) like \${"needle"}\`)))); }
function member(db: Db, userId: string) { return and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq), search(db)); }
export async function owned(db: Db, ownerId: string) { return await db.select().from(chats).innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id)).where(member(db, ownerId)); }`;
const SCOPE_CASES = [
  {
    name: "adjacent child SQL fragments cannot compose an owner-bypassing OR",
    body: 'export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1 ${sql`O`}${sql`R`} ${characters.id} = ${"foreign"}`)); }',
    tokens: ["characters"],
  },
  {
    name: "literal and nested fragment boundaries cannot compose OR",
    body: 'export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1 O${sql`R`} ${characters.id} = ${"foreign"}`)); }',
    tokens: ["characters"],
  },
  {
    name: "native single-condition AND preserves its unparenthesized child boundary",
    body: 'export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1 ${and(sql`O`)}R ${characters.id} = ${"foreign"}`)); }',
    tokens: ["characters"],
  },
  {
    name: "undefined native AND arguments cannot create synthetic parentheses",
    body: 'export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1 ${and(sql`O`, undefined)}R ${characters.id} = ${"foreign"}`)); }',
    tokens: ["characters"],
  },
  {
    name: "nested fragments can compose safe parentheses without being individually balanced",
    body: 'export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`${sql`(`}1 ${sql`O`}${sql`R`} ${characters.id} = ${"foreign"}${sql`)`}`)); }',
    tokens: [],
  },
  {
    name: "primitive string interpolations remain parameters rather than textual SQL chunks",
    body: 'export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`${"O"}${"R"} = ${"OR"}`)); }',
    tokens: [],
  },
  {
    name: "SQL fragments cannot compose a numeric-adjacent line comment",
    body: "export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1${sql`-`}${sql`- note`}`)); }",
    tokens: ["characters"],
  },
  {
    name: "stable nested SQL aliases preserve complete lexical composition",
    body: 'export async function owned(db: Db, ownerId: string) { const narrow = sql`(${characters.id} = ${"first"} OR ${characters.id} = ${"foreign"})`; return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`${narrow}`)); }',
    tokens: [],
  },
  {
    name: "owned helper and opaque keyset retain avatar FK ancestry",
    body: `function owner(ownerId: string) { return and(eq(characters.ownerId, ownerId), sql\`lower(\${characters.id}) like \${ownerId}\`); }
export async function owned(db: Db, ownerId: string, cursor?: string) { const scope = owner(ownerId); const page = cursor === undefined ? scope : and(scope, sql\`(\${characters.id} > \${cursor})\`); return await db.select().from(characters).leftJoin(assets, eq(characters.avatarAssetId, assets.id)).where(page); }`,
    tokens: [],
  },
  {
    name: "junction other parent is pinned through an owned helper",
    body: `function owner(ownerId: string) { return and(eq(characters.ownerId, ownerId), sql\`lower(\${characters.id}) like \${ownerId}\`); }
export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).innerJoin(characterTags, eq(characterTags.characterId, characters.id)).innerJoin(tags, eq(characterTags.tagId, tags.id)).where(owner(ownerId)); }`,
    tokens: [],
  },
  {
    name: "hoisted native owner subselect retains its actual pinned membership source",
    body: `export async function owned(db: Db, ownerId: string) { const owners = db.select({userId: chatParticipants.userId}).from(chatParticipants).where(eq(chatParticipants.chatId, ownerId)); return await db.select().from(characters).where(and(eq(characters.id, "control"), inArray(characters.ownerId, owners))); }`,
    tokens: [],
  },
  {
    name: "changed native owner subselect cannot retain its original membership pin",
    escapes: true,
    body: `export async function owned(db: Db, ownerId: string) { const owners = db.select({userId: chatParticipants.userId}).from(chatParticipants).where(eq(chatParticipants.chatId, ownerId)).$dynamic(); owners.where(eq(chatParticipants.userId, ownerId)); return await db.select().from(characters).where(and(eq(characters.id, "control"), inArray(characters.ownerId, owners))); }`,
    tokens: ["characters"],
  },
  {
    name: "escaped native owner subselect cannot borrow its original membership pin",
    escapes: true,
    body: `declare function opaque(q: object): void; export async function owned(db: Db, ownerId: string) { const owners = db.select({userId: chatParticipants.userId}).from(chatParticipants).where(eq(chatParticipants.chatId, ownerId)).$dynamic(); opaque(owners); return await db.select().from(characters).where(and(eq(characters.id, "control"), inArray(characters.ownerId, owners))); }`,
    tokens: ["characters"],
  },
  {
    name: "correlated character EXISTS inherits the outer current member room",
    body: CORRELATED_BODY,
    tokens: [],
  },
  {
    name: "one unpinned consumer refuses the correlated helper",
    body: `${CORRELATED_BODY} export async function unsafe(db: Db) { return await db.select().from(chats).where(search(db)); }`,
    tokens: ["characters"],
  },
  {
    name: "an escaping predicate helper refuses correlation",
    body: `${CORRELATED_BODY} export function expose() { return search; }`,
    tokens: ["characters"],
  },
  {
    name: "departed memberships cannot pin the correlated room",
    body: CORRELATED_BODY.replace("isNull(chatParticipants.leftSeq),", ""),
    tokens: ["characters"],
  },
  {
    name: "native OR requires current membership on every arm",
    body: CORRELATED_BODY.replace(
      "return and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq), search(db));",
      "return or(and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq), search(db)), sql`1`);",
    ),
    tokens: ["characters"],
  },
  {
    name: "missing correlation cannot borrow an outer membership pin",
    body: CORRELATED_BODY.replace("eq(seats.chatId, chats.id),", ""),
    tokens: ["characters"],
  },
  {
    name: "raw JOIN OR cannot borrow a readable FK branch",
    body: `export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).leftJoin(assets, sql\`\${assets.id} = \${characters.avatarAssetId} OR \${assets.id} = \${"foreign"}\`).where(eq(characters.ownerId, ownerId)); }`,
    tokens: ["assets"],
  },
  {
    name: "native JOIN OR requires the declared FK in every arm",
    body: `export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).leftJoin(assets, or(eq(assets.id, characters.avatarAssetId), eq(assets.id, "foreign"))).where(eq(characters.ownerId, ownerId)); }`,
    tokens: ["assets"],
  },
  {
    name: "spread native OR cannot turn one owner arm into AND authority",
    body: "export async function owned(db: Db, ownerId: string) { const conds = [eq(characters.ownerId, ownerId), eq(characters.id, ownerId)]; return await db.select().from(characters).where(or(...conds)); }",
    tokens: ["characters"],
  },
  {
    name: "immutable conditions with narrowing pushes retain avatar FK ancestry",
    body: "export async function owned(db: Db, ownerId: string, cursor?: string) { const conds = [eq(characters.ownerId, ownerId)]; if (cursor !== undefined) conds.push(sql`lower(${characters.id}) like ${cursor}`); const scope = and(...conds); const page = cursor === undefined ? scope : and(scope, sql`(${characters.id} > ${cursor})`); return await db.select().from(characters).leftJoin(assets, eq(assets.id, characters.avatarAssetId)).where(page); }",
    tokens: [],
  },
  {
    name: "raw OR cannot bypass a mandatory owner conjunct",
    body: `export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql\`\${characters.id} = \${"first"} OR \${characters.id} = \${"foreign"}\`)); }`,
    tokens: ["characters"],
  },
  {
    name: "SQL append cannot retain a const fragment's original containment",
    body: `export async function owned(db: Db, ownerId: string) { const cond = sql\`\${characters.id} = \${"first"}\`; cond.append(sql\` OR \${characters.id} = \${"foreign"}\`); return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), cond)); }`,
    tokens: ["characters"],
  },
  {
    name: "a driver string containing OR stays a parameter rather than SQL syntax",
    body: `export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).leftJoin(assets, eq(assets.id, characters.avatarAssetId)).where(and(eq(characters.ownerId, ownerId), sql\`lower(\${characters.id}) like \${"OR ) --"}\`)); }`,
    tokens: [],
  },
  {
    name: "an unknown SQLWrapper interpolation cannot borrow column containment",
    body: "const wrapper = { getSQL() { return sql`1 OR 1`; } }; export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`${wrapper}`)); }",
    tokens: ["characters"],
  },
  {
    name: "an unknown SQL projection refuses correlated EXISTS containment",
    body: `declare function opaque(): ReturnType<typeof eq>; ${CORRELATED_BODY.replace("named: sql`1`", "named: opaque()")}`,
    tokens: ["characters"],
  },
  {
    name: "same-spelled distinct SQL aliases cannot pin an inherited avatar",
    body: `import { alias } from "drizzle-orm/sqlite-core"; const anchored = alias(characters, "a"); function owner(ownerId: string) { const anchored = alias(characters, "b"); return and(eq(anchored.ownerId, ownerId), sql\`lower(\${anchored.id}) like \${ownerId}\`); } export async function owned(db: Db, ownerId: string) { return await db.select().from(anchored).leftJoin(assets, eq(assets.id, anchored.avatarAssetId)).where(owner(ownerId)); }`,
    tokens: ["anchored", "assets"],
  },
  {
    name: "conditional owner push is not a mandatory condition",
    body: "export async function owned(db: Db, ownerId: string, flag: boolean) { const conds = [eq(characters.id, ownerId)]; if (flag) conds.push(eq(characters.ownerId, ownerId)); return await db.select().from(characters).where(and(...conds)); }",
    tokens: ["characters"],
  },
  {
    name: "mutating conditions cannot retain an initial owner predicate",
    body: "export async function owned(db: Db, ownerId: string) { const conds = [eq(characters.ownerId, ownerId)]; conds.splice(0, 1, eq(characters.id, ownerId)); return await db.select().from(characters).where(and(...conds)); }",
    tokens: ["characters"],
  },
  {
    name: "escaping conditions cannot retain an initial owner predicate",
    body: `function replace(conds: ReturnType<typeof eq>[], id: string) { conds.splice(0, 1, eq(characters.id, id)); }
export async function owned(db: Db, ownerId: string) { const conds = [eq(characters.ownerId, ownerId)]; replace(conds, ownerId); return await db.select().from(characters).where(and(...conds)); }`,
    tokens: ["characters"],
  },
  {
    name: "unresolved SQL callee cannot preserve owner AND authority",
    body: `declare function opaque(): ReturnType<typeof eq>;
export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), opaque())); }`,
    tokens: ["characters"],
  },
] as const;

const CASES = [
  {
    name: "imported filtered return replaced by recipient id",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(eq(personas.id, id)); }`,
    findings: 1,
  },
  {
    name: "recipient retains id and owner",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(and(eq(personas.id, id), eq(personas.ownerId, ownerId))); }`,
    findings: 0,
  },
  {
    name: "unmodified returned filter executes",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "async producer returns rows not an editable builder",
    producer: BUILDER.replace("export function owned", "export async function owned"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { const rows = await owned(db, ownerId); return rows.map((row) => row.id); }`,
    findings: 0,
  },
  {
    name: "const callable alias and split recipient replace owner",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}const factory = owned; export async function read(db: Db, ownerId: string, id: string) { const q = factory(db, ownerId).$dynamic(); q.where(eq(personas.id, id)); return await q; }`,
    findings: 1,
  },
  {
    name: "long immutable recipient chain retains replacement alternatives",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { const q0 = owned(db, ownerId).$dynamic(); ${Array.from({ length: 64 }, (_, i) => `const q${i + 1} = q${i};`).join(" ")} q64.where(eq(personas.id, id)); return await q64; }`,
    findings: 1,
  },
  {
    name: "split recipient self assignment retains scoped replacement",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { let q = owned(db, ownerId).$dynamic(); q = q.where(and(eq(personas.id, id), eq(personas.ownerId, ownerId))); return await q; }`,
    findings: 0,
  },
  {
    name: "renamed genuine table receiver scopes recipient",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD.replace("personas, type Db", "personas as realPersonas, type Db")}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(and(eq(realPersonas.id, id), eq(realPersonas.ownerId, ownerId))); }`,
    findings: 0,
  },
  {
    name: "foreign same-spelled table does not scope producer",
    producer: BUILDER.replace("import { eq }", "import { and, eq }")
      .replace("personas, type Db", "personas, characters, type Db")
      .replace(
        ".from(personas).where(eq(personas.ownerId, ownerId))",
        ".from(personas).innerJoin(characters, eq(personas.id, characters.id)).where(and(eq(personas.ownerId, ownerId), eq(characters.ownerId, ownerId)))",
      ),
    recipient: `${RECIPIENT_HEAD.replace("personas, type Db", "characters as personas, personas as realPersonas, type Db")}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(and(eq(realPersonas.id, id), eq(personas.ownerId, ownerId))); }`,
    findings: 1,
  },
  {
    name: "distinct SQL alias with same spelling does not scope producer",
    producer: BUILDER.replace("import { eq }", "import { aliasedTable, and, eq }")
      .replace(
        "export function owned",
        "export const first = aliasedTable(personas, 'first'); export const second = aliasedTable(personas, 'second'); export function owned",
      )
      .replace(
        ".from(personas).where(eq(personas.ownerId, ownerId))",
        ".from(first).innerJoin(second, eq(first.id, second.id)).where(and(eq(first.ownerId, ownerId), eq(second.ownerId, ownerId)))",
      ),
    recipient: `${RECIPIENT_HEAD}import { second as first, first as realFirst } from "./producer.js"; export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(and(eq(realFirst.id, id), eq(first.ownerId, ownerId))); }`,
    findings: 1,
    token: "first",
  },
  {
    name: "synchronous return cycle is an explicit unresolved fact",
    producer: `${BUILDER}export function recurse(db: Db, ownerId: string, flag: boolean): ReturnType<typeof owned> { if (flag) return owned(db, ownerId); return recurse(db, ownerId, flag); }`,
    recipient: `${RECIPIENT_HEAD}import { recurse } from "./producer.js"; export async function read(db: Db, ownerId: string) { return await recurse(db, ownerId, false); }`,
    findings: 1,
    refusal: "cycle",
  },
  {
    name: "wrapped conditional factory return stays editable",
    producer: BUILDER.replace(
      "return db.select().from(personas).where(eq(personas.ownerId, ownerId));",
      "const q = db.select().from(personas).where(eq(personas.ownerId, ownerId)); return (ownerId.length ? q : q);",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(eq(personas.id, id)); }`,
    findings: 1,
  },
  {
    name: "object predicate helper keeps by-id term",
    producer: BUILDER.replace("export function owned", "const predicates = { byId: (id: string) => eq(personas.id, id) }; export function owned").replace(
      "eq(personas.ownerId, ownerId)",
      "predicates.byId(ownerId)",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "namespace and immutable table alias retain owner scope",
    producer: BUILDER.replace("export function owned", "import * as schema from '@orb/db'; const table = schema.personas; export function owned").replace(
      ".from(personas).where(eq(personas.ownerId, ownerId))",
      ".from(table).where(eq(table.ownerId, ownerId))",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(and(eq(personas.id, id), eq(personas.ownerId, ownerId))); }`,
    findings: 0,
  },
  {
    name: "returned unfiltered factory gets caller by-id judgment",
    producer: BUILDER.replace(".where(eq(personas.ownerId, ownerId))", ""),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).where(eq(personas.id, id)); }`,
    findings: 1,
  },
  {
    name: "caller SQL leaf remains unproven",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}import { sql } from 'drizzle-orm'; export async function read(db: Db, ownerId: string, id: string) { return await owned(db, ownerId).$dynamic().where(sql\`\${personas.id} = \${id}\`); }`,
    findings: 1,
  },
  {
    name: "typed table parameter by-id read is not silently foreign",
    producer: BUILDER.replace("ownerId: string)", "ownerId: string, table: typeof personas = personas)").replace(
      ".from(personas).where(eq(personas.ownerId, ownerId))",
      ".from(table).where(eq(table.id, ownerId))",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
    token: "table",
  },
  {
    name: "FK OR alternative can select another owners persona",
    producer: BUILDER.replace("import { eq }", "import { eq, or }")
      .replace("personas, type Db", "personas, chats, type Db")
      .replace(
        ".from(personas).where(eq(personas.ownerId, ownerId))",
        ".from(chats).innerJoin(personas, eq(personas.id, chats.anchorPersonaId)).where(or(eq(chats.anchorPersonaId, ownerId), eq(chats.id, ownerId)))",
      ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "FK SQL leaf remains unproven",
    producer: BUILDER.replace("import { eq }", "import { eq, sql }")
      .replace("personas, type Db", "personas, chats, type Db")
      .replace(
        ".from(personas).where(eq(personas.ownerId, ownerId))",
        ".from(chats).innerJoin(personas, eq(personas.id, chats.anchorPersonaId)).where(sql`${chats.anchorPersonaId} = ${ownerId}`)",
      ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "genuine FK chain inherits the pinned chat row",
    producer: BUILDER.replace("personas, type Db", "personas, chats, type Db").replace(
      ".from(personas).where(eq(personas.ownerId, ownerId))",
      ".from(chats).innerJoin(personas, eq(personas.id, chats.anchorPersonaId)).where(eq(chats.id, ownerId))",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "const relational receiver preserves by-id judgment",
    producer: BUILDER.replace("export function owned", "export async function owned").replace(
      "return db.select().from(personas).where(eq(personas.ownerId, ownerId));",
      "const rows = db.query.personas; return rows.findFirst({where: eq(personas.id, ownerId)});",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "relabeled subquery owner does not authorize another source row",
    producer: BUILDER.replace("personas, type Db", "personas, characters, type Db").replace(
      "return db.select().from(personas).where(eq(personas.ownerId, ownerId));",
      "const sq = db.select({id: personas.id, ownerId: characters.ownerId}).from(personas).innerJoin(characters, eq(personas.id, characters.id)).where(eq(characters.ownerId, ownerId)).as('sq'); return db.select().from(sq).where(eq(sq.id, ownerId));",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
    token: "sq",
  },
  {
    name: "relabeled CTE owner does not authorize another source row",
    producer: BUILDER.replace("personas, type Db", "personas, characters, type Db").replace(
      "return db.select().from(personas).where(eq(personas.ownerId, ownerId));",
      "const sq = db.$with('sq').as(db.select({id: personas.id, ownerId: characters.ownerId}).from(personas).innerJoin(characters, eq(personas.id, characters.id)).where(eq(characters.ownerId, ownerId))); return db.with(sq).select().from(sq).where(eq(sq.id, ownerId));",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
    token: "sq",
  },
  {
    name: "full-row owner scoped native CTE remains admitted",
    producer: BUILDER.replace(
      "return db.select().from(personas).where(eq(personas.ownerId, ownerId));",
      "const sq = db.$with('sq').as(db.select().from(personas).where(eq(personas.ownerId, ownerId))); return db.with(sq).select().from(sq).where(eq(sq.id, ownerId));",
    ),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "predicate helper retains its real table argument for by-id attribution",
    producer: BUILDER.replace(
      "export function owned",
      "function byId(table: typeof personas, id: string) { return eq(table.id, id); } export function owned",
    ).replace("eq(personas.ownerId, ownerId)", "byId(personas, ownerId)"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "owner predicate helper retains its real table argument",
    producer: BUILDER.replace(
      "export function owned",
      "function owner(table: typeof personas, id: string) { return eq(table.ownerId, id); } export function owned",
    ).replace("eq(personas.ownerId, ownerId)", "owner(personas, ownerId)"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "unresolved mutable factory call cannot retain filtered-return trust",
    refusal: "unsupported",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string, id: string) { let factory = owned; factory = owned; return await factory(db, ownerId).$dynamic().where(eq(personas.id, id)); }`,
    findings: 1,
  },
  {
    name: "sealed get returns rows even through an unresolved caller",
    producer: BUILDER.replace(".where(eq(personas.ownerId, ownerId));", ".where(eq(personas.ownerId, ownerId)).get();"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { let factory = owned; factory = owned; return await factory(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "sealed all then retains settled rows rather than editable continuation",
    producer: BUILDER.replace(".where(eq(personas.ownerId, ownerId));", ".where(eq(personas.ownerId, ownerId)).all().then((rows) => rows);"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { let factory = owned; factory = owned; return await factory(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "settled owner cannot authorize an unknown SQL-producing AND operand",
    producer: BUILDER.replace("import { eq }", "import { and, eq, type SQL }")
      .replace("export function owned(db: Db, ownerId: string)", "export async function owned(db: Db, ownerId: string, cond: SQL = eq(personas.id, ownerId))")
      .replace(".where(eq(personas.ownerId, ownerId))", ".where(and(eq(personas.ownerId, ownerId), cond))"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "review unsafe mutable caller remains unproven beside independent direct safe caller",
    refusal: "unsupported",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function unsafe(db: Db, ownerId: string, id: string) { let factory = owned; factory = owned; return await factory(db, ownerId).$dynamic().where(eq(personas.id, id)); } export async function safe(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 1,
  },
  {
    name: "review unsafe mutable caller remains unproven when safe caller appears first",
    refusal: "unsupported",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function safe(db: Db, ownerId: string) { return await owned(db, ownerId); } export async function unsafe(db: Db, ownerId: string, id: string) { let factory = owned; factory = owned; return await factory(db, ownerId).$dynamic().where(eq(personas.id, id)); }`,
    findings: 1,
  },
  {
    name: "review unrelated unresolved call does not taint direct safe factory caller",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function safe(db: Db, ownerId: string) { Math.random(); return await owned(db, ownerId); }`,
    findings: 0,
  },
  {
    name: "review immutable factory alias with unmodified filter remains admitted",
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}const factory = owned; export async function safe(db: Db, ownerId: string) { return await factory(db, ownerId); }`,
    findings: 0,
  },
] as const;

interface NativeFixture {
  readonly root: string;
  readonly project: Project;
  readonly source: SourceFile;
  readonly anchor: CallExpression;
}

async function nativeFixture(
  { plantedTree, repoRoot }: Pick<ToolFixtures, "plantedTree" | "repoRoot">,
  scenario: { readonly producer: string; readonly recipient: string },
): Promise<NativeFixture> {
  const root = await plantedTree({
    "package.json": '{"type":"module"}',
    ".gitignore": "node_modules\n",
    "tsconfig.base.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
        paths: { "@orb/db": ["./packages/db/src/index.ts"] },
      },
    }),
    [CONFIG]: '{"extends":"../../tsconfig.base.json","include":["src/**/*.ts"]}',
    "packages/db/src/schema/persona.ts": `${SCHEMA}export const chats = sqliteTable("chats", {id: text("id").primaryKey(), anchorPersonaId: text("anchor_persona_id").references(() => personas.id)});${SCOPE_SCHEMA}`,
    "packages/db/src/index.ts": DATABASE,
    [PRODUCER]: scenario.producer,
    [RECIPIENT]: scenario.recipient,
  });
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet", "--template="]);
  const view = createSemanticWorkspace({ root }).program(CONFIG);
  if (view === undefined) {
    throw new Error("the native fixture's server program was not admitted");
  }
  const project = view.project();
  expect(project.getPreEmitDiagnostics().map((diagnostic) => diagnostic.getMessageText())).toEqual([]);
  const source = view.sourceFile(PRODUCER);
  const anchor = source
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText().endsWith(".from") || call.getExpression().getText().endsWith(".findFirst"));
  if (source === undefined || anchor === undefined) {
    throw new Error("the genuine producer's table anchor was not loaded");
  }
  expect(readDrizzleClientCall(anchor)).toMatchObject({ kind: "drizzle", method: anchor.getExpression().getText().endsWith(".from") ? "from" : "findFirst" });
  const declarations = anchor.getExpression().getSymbol()?.getDeclarations() ?? [];
  expect(declarations).not.toHaveLength(0);
  expect(declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/"))).toBe(true);
  return { root, project, source, anchor };
}

function statementObservations(root: string, project: Project): ReturnType<typeof observeCallReturns> {
  const nodes = project
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile() && file.getFilePath().startsWith(root))
    .flatMap((file) => file.getDescendants());
  return observeCallReturns(nodes.filter(Node.isCallExpression), nodes);
}

const SQL_STABILITY_CASES = [
  { name: "immutable containing template", body: "const holder = sql`${child}`;", stable: true },
  { name: "immutable containing native operator", body: "const holder = and(child)!;", stable: true },
  {
    name: "immutable template operator and ordinary alias chain",
    body: "const template = sql`${child}`; const operator = and(template)!; const holder = operator;",
    stable: true,
  },
  { name: "containing template escape", body: "const holder = sql`${child}`; opaque(holder);", stable: false },
  { name: "containing template append", body: "const holder = sql`${child}`; holder.append(sql`2`);", stable: false },
  { name: "containing template mutable chunk access", body: "const holder = sql`${child}`; holder.queryChunks.pop();", stable: false },
  { name: "containing native operator escape", body: "const holder = and(child)!; opaque(holder);", stable: false },
  { name: "containing native operator append", body: "const holder = and(child)!; holder.append(sql`2`);", stable: false },
  {
    name: "mixed containing chain escape",
    body: "const template = sql`${child}`; const operator = and(template)!; const holder = operator; opaque(holder);",
    stable: false,
  },
  { name: "unprovable containing return", body: "const holder = sql`${child}`;", stable: false, returned: true },
  { name: "erased containing template escape", body: "const holder: object = sql`${child}`; opaqueObject(holder);", stable: false, erased: true },
  { name: "erased containing operator escape", body: "const holder: object = and(child)!; opaqueObject(holder);", stable: false, erased: true },
] as const;

for (const scenario of SQL_STABILITY_CASES) {
  test(`native SQL alias stability: ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const sink = "returned" in scenario ? "return holder;" : "db.select().from(personas).where(holder);";
    const finalUse = "erased" in scenario ? "" : sink;
    const producer =
      BUILDER.replace("import { eq }", "import { and, eq, sql, type SQL }") +
      `declare function opaque(value: SQL): void; declare function opaqueObject(value: object): void; export function fragments(db: Db) { const child = sql\`1\`; ${scenario.body} db.select().from(personas).where(child); ${finalUse} }`;
    const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer, recipient: "" });
    const child = fixture.source.getDescendantsOfKind(SyntaxKind.VariableDeclaration).find((declaration) => declaration.getName() === "child");
    if (child === undefined) {
      throw new Error("the genuine numeric SQL child must exist");
    }
    expect(readSqlAliasStability(child.getNameNode())).toBe(scenario.stable);
  });
}

for (const scenario of CASES) {
  test(`native Drizzle statement: ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const { root, project, anchor } = await nativeFixture({ plantedTree, repoRoot }, scenario);
    const observations = statementObservations(root, project);
    const statement = readStatementOf(anchor, observations);
    expect([...new Set(statement.refusals.map(({ reason }) => reason))]).toEqual("refusal" in scenario ? [scenario.refusal] : []);
    expect(statement.escapes).toBe("refusal" in scenario);
    const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.effectiveFindings.map(({ file, token }) => ({ file, token }))).toEqual(
      scenario.findings === 0 ? [] : [{ file: PRODUCER, token: "token" in scenario ? scenario.token : "personas" }],
    );
  });
}

for (const scenario of SCOPE_CASES) {
  test(`native tenancy facts: ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer: SCOPE_HEAD + scenario.body, recipient: "" });
    const statement = readStatementOf(fixture.anchor, statementObservations(fixture.root, fixture.project));
    expect(statement.refusals).toEqual([]);
    expect(statement.escapes).toBe("escapes" in scenario ? scenario.escapes : false);
    const result = runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root: fixture.root,
      project: fixture.project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.policies[0]?.owner.status).toBe("success");
    expect(result.authority.authorityAlarms).toEqual([]);
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(scenario.tokens);
  });
}

test("native statement observations refuse stale source epochs and other compiler worlds", async ({ plantedTree, repoRoot }) => {
  const scenario = {
    producer: BUILDER,
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
  };
  const original = await nativeFixture({ plantedTree, repoRoot }, scenario);
  const observations = statementObservations(original.root, original.project);
  expect(readStatementOf(original.anchor, observations).refusals).toEqual([]);
  const callsOnly = observeCallReturns(original.project.getSourceFiles().flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression)));
  const incomplete = readStatementOf(original.anchor, callsOnly);
  expect(incomplete.escapes).toBe(true);
  expect(incomplete.refusals.map(({ reason }) => reason)).toEqual(["missing"]);
  const other = await nativeFixture({ plantedTree, repoRoot }, scenario);
  const foreignInventory = other.project
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile())
    .flatMap((file) => file.getDescendants());
  const originalCalls = original.project
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile())
    .flatMap((file) => file.getDescendantsOfKind(SyntaxKind.CallExpression));
  const mismatchedInventory = readStatementOf(original.anchor, observeCallReturns(originalCalls, foreignInventory));
  expect(mismatchedInventory.escapes).toBe(true);
  expect(mismatchedInventory.refusals.map(({ reason }) => reason)).toEqual(["missing"]);
  const foreign = readStatementOf(other.anchor, observations);
  expect(foreign.escapes).toBe(true);
  expect(foreign.refusals.map(({ reason }) => reason)).toEqual(["unsupported"]);
  original.source.insertStatements(0, "// advance the authored source epoch");
  const current = original.source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText().endsWith(".from") || call.getExpression().getText().endsWith(".findFirst"));
  if (current === undefined) {
    throw new Error("the modified native source lost its genuine table anchor");
  }
  const stale = readStatementOf(current, observations);
  expect(stale.escapes).toBe(true);
  expect(stale.refusals.map(({ reason }) => reason)).toEqual(["unsupported"]);
  expect(stale.wheres).toEqual([]);
});

test("installed Drizzle dynamic WHERE replaces its owner filter rather than combining it", () => {
  const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
  const db = drizzle.mock({ schema: { personas } });
  const unsafe = db.select().from(personas).where(eq(personas.ownerId, "owner-control")).$dynamic();
  expect(unsafe.toSQL().sql).toContain('"personas"."owner_id"');
  unsafe.where(eq(personas.id, "id-control"));
  expect(unsafe.toSQL().sql).not.toContain('"personas"."owner_id"');
  expect(unsafe.toSQL().params).toEqual(["id-control"]);
  const scoped = db
    .select()
    .from(personas)
    .where(eq(personas.ownerId, "owner-control"))
    .$dynamic()
    .where(and(eq(personas.id, "id-control"), eq(personas.ownerId, "owner-control")));
  expect(scoped.toSQL().sql).toContain('"personas"."owner_id"');
  expect(scoped.toSQL().params).toEqual(["id-control", "owner-control"]);
});

test("installed Drizzle raw OR can escape a sibling owner predicate", () => {
  const personas = sqliteTable("personas", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
  const db = drizzle.mock({ schema: { personas } });
  const unsafe = db
    .select()
    .from(personas)
    .where(and(eq(personas.ownerId, "owner-control"), sql`${personas.id} = ${"first"} OR ${personas.id} = ${"foreign"}`));
  expect(unsafe.toSQL()).toMatchObject({
    sql: 'select "id", "owner_id" from "personas" where ("personas"."owner_id" = ? and "personas"."id" = ? OR "personas"."id" = ?)',
    params: ["owner-control", "first", "foreign"],
  });
  const narrowed = db
    .select()
    .from(personas)
    .where(and(eq(personas.ownerId, "owner-control"), sql`(${personas.id} = ${"first"} OR ${personas.id} = ${"foreign"})`));
  expect(narrowed.toSQL().sql).toBe(
    'select "id", "owner_id" from "personas" where ("personas"."owner_id" = ? and ("personas"."id" = ? OR "personas"."id" = ?))',
  );
});

test("installed libSQL returns foreign bytes for split SQL OR but not its parenthesized control", async () => {
  const rows = sqliteTable("owner_containment_rows", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() });
  const db = await createDb(":memory:");
  try {
    await db.run(sql`CREATE TABLE owner_containment_rows (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL)`);
    await db.insert(rows).values([
      { id: "own", ownerId: "alice" },
      { id: "foreign", ownerId: "bob" },
    ]);
    const split = db
      .select()
      .from(rows)
      .where(and(eq(rows.ownerId, "alice"), sql`1 ${sql`O`}${sql`R`} ${rows.id} = ${"foreign"}`));
    const direct = db
      .select()
      .from(rows)
      .where(and(eq(rows.ownerId, "alice"), sql`1 OR ${rows.id} = ${"foreign"}`));
    const narrow = db
      .select()
      .from(rows)
      .where(and(eq(rows.ownerId, "alice"), sql`(${sql`1 O`}${sql`R`} ${rows.id} = ${"foreign"})`));
    expect(split.toSQL()).toEqual(direct.toSQL());
    expect(await split).toEqual([
      { id: "own", ownerId: "alice" },
      { id: "foreign", ownerId: "bob" },
    ]);
    expect(await direct).toEqual(await split);
    expect(await narrow).toEqual([{ id: "own", ownerId: "alice" }]);
  } finally {
    closeDb(db);
  }
});
