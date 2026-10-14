// @subject tooling/src/floor/code-facts/drizzle-sql.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-origin.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-projection.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-native.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-constructors.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-stability.ts
// @subject tooling/src/verify/lib/tenancy-join.ts
import { nativeFixture, SCOPE_HEAD, statementObservations } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readSqlOperandContainment } from "@orb/tooling/floor/code-facts/drizzle-sql";
import { readStatementOf } from "@orb/tooling/floor/code-facts/drizzle-statement";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import { sqliteFragmentContained } from "@orb/tooling/floor/code-facts/sqlite-lexical";
import { StringChunk, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SyntaxKind } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { readDrizzleClientCall } from "../../../../tooling/src/verify/lib/drizzle-client-call.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const R1_GENERATION_HELPER = `import { characterEmbeddings, embedSpaceState, embedGenerationTargets } from "@orb/db";
import type { SQLWrapper } from "drizzle-orm";
function currentGeneration(rowGeneration: SQLWrapper, owner: SQLWrapper, scope: string) {
const task = scope === "images" ? "imageEmbed" : "embed";
return sql\`\${rowGeneration} = coalesce(
(select \${embedSpaceState.activeGenerationId} from \${embedSpaceState} where \${embedSpaceState.ownerId} = \${owner} and \${embedSpaceState.scope} = \${scope}),
(select \${embedGenerationTargets.generationId} from \${embedGenerationTargets} where \${embedGenerationTargets.ownerId} = \${owner} and \${embedGenerationTargets.task} = \${task}))\`;
}
`;
const R1_CURRENT_BODY =
  R1_GENERATION_HELPER +
  `const currentCard = currentGeneration(characterEmbeddings.generationId, characters.ownerId, "cards");
export async function owned(db: Db, ownerId: string) {
return await db.select({id: characters.id}).from(characterEmbeddings).innerJoin(characters, eq(characterEmbeddings.characterId, characters.id))
.leftJoin(assets, eq(assets.id, characters.avatarAssetId)).where(and(eq(characters.ownerId, ownerId), currentCard));
}`;
const R1_PORTRAIT_BODY =
  R1_GENERATION_HELPER +
  `import {imageEmbeddings, embedGenerations} from "@orb/db";
import {notInArray} from "drizzle-orm";
const currentCard = currentGeneration(characterEmbeddings.generationId, characters.ownerId, "cards");
const currentImage = currentGeneration(imageEmbeddings.generationId, assets.ownerId, "images");
export async function owned(db: Db, ownerId: string, shared: string[], characterId?: string) {
return await db.select({id:characters.id, name:characters.name, avatarHash:assets.hash, fingerprint:embedGenerations.fingerprint})
.from(imageEmbeddings).leftJoin(embedGenerations, and(eq(embedGenerations.id,imageEmbeddings.generationId), eq(embedGenerations.ownerId,ownerId)))
.innerJoin(characters,eq(characters.avatarAssetId,imageEmbeddings.assetId)).innerJoin(assets,eq(assets.id,imageEmbeddings.assetId))
.innerJoin(characterEmbeddings,and(eq(characterEmbeddings.characterId,characters.id),eq(characterEmbeddings.model,imageEmbeddings.model),eq(characterEmbeddings.dim,imageEmbeddings.dim)))
.where(and(eq(characters.ownerId,ownerId),eq(assets.ownerId,ownerId),eq(imageEmbeddings.lens,"visual"), shared.length === 0 ? undefined : notInArray(characters.avatarAssetId,shared),currentImage,currentCard,...(characterId === undefined ? [] : [eq(characters.id,characterId)])));
}`;
const R1_CAPTION_BODY =
  R1_GENERATION_HELPER +
  `import {imageEmbeddings, imageAnalyses} from "@orb/db";
const currentImage = currentGeneration(imageEmbeddings.generationId, assets.ownerId, "images");
export async function owned(db: Db, ownerId: string, path: string, value: string, isList: boolean) {
const extra = isList ? sql\`exists (select 1 from json_each(\${imageAnalyses.captionMeta}, \${path}) je where je.value = \${value})\` : sql\`json_extract(\${imageAnalyses.captionMeta}, \${path}) = \${value}\`;
return await db.select({id:characters.id,name:characters.name,avatarHash:assets.hash,caption:imageAnalyses.caption,captionMeta:imageAnalyses.captionMeta})
.from(imageEmbeddings).innerJoin(characters,eq(characters.avatarAssetId,imageEmbeddings.assetId)).innerJoin(assets,eq(assets.id,imageEmbeddings.assetId))
.innerJoin(imageAnalyses,and(eq(imageAnalyses.assetId,assets.id),eq(imageAnalyses.contentHash,assets.hash)))
.where(and(eq(characters.ownerId,ownerId),eq(assets.ownerId,ownerId),eq(imageEmbeddings.lens,"caption"),currentImage,extra));
}`;
const R1_MESSAGE_BODY = `import { gte, max } from "drizzle-orm"; import { messages, messageVariants } from "@orb/db";
import { alias } from "drizzle-orm/sqlite-core"; const seats = alias(chatParticipants, "seats");
const hiddenTags = [{tag: "lie"}, {tag: "ofilter"}] as const;
function history() { return sql\`case when \${chatParticipants.role} <> 'host' and \${chatParticipants.joinHistoryVisibility} = 'from-join' then max(\${chatParticipants.joinSeq}, 0) else 0 end\`; }
function hidden() { return or(eq(chatParticipants.role, "host"), and(...hiddenTags.map((def) => sql\`lower(\${messageVariants.content}) not like \${\`%<\${def.tag}%\`}\`))); }
function search(db: Db, needle: string) { return or(sql\`lower(\${chats.id}) like \${needle}\`,
exists(db.select({named: sql\`1\`}).from(seats).innerJoin(characters, eq(characters.id, seats.characterId)).where(and(eq(seats.chatId, chats.id), sql\`lower(\${characters.name}) like \${needle}\`))),
exists(db.select({said: sql\`1\`}).from(messages).innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId)).where(and(eq(messages.chatId, chats.id),
sql\`\${messages.seq} = (\${db.select({tail: max(messages.seq)}).from(messages).where(eq(messages.chatId, chats.id))})\`, gte(messages.seq, history()), hidden(), sql\`lower(\${messageVariants.content}) like \${needle}\`)))); }
export async function owned(db: Db, ownerId: string) { return await db.select().from(chats).innerJoin(chatParticipants, eq(chatParticipants.chatId, chats.id)).where(and(eq(chatParticipants.userId, ownerId), isNull(chatParticipants.leftSeq), search(db, ownerId))); }`;
const R1_STANDING_BODY = `function standing(ownerId: string, id: string, roles: readonly string[]) {
return sql\`exists (select 1 from \${characters} where \${characters}.\${sql.identifier("id")} = \${id} and \${characters}.\${sql.identifier("owner_id")} = \${ownerId} and \${characters}.\${sql.identifier("id")} in (\${sql.join(roles.map((role) => sql\`\${role}\`), sql\`, \`)}))\`;
}
export async function owned(db: Db, ownerId: string, id: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), standing(ownerId, id, ["host", "member"]))); }`;
const R1_OUTPUT_BODY = `import { notExists } from "drizzle-orm"; import {imageryGenerations} from "@orb/db";
function allOwned(db: Db, ownerId: string, ids: string[]) { return sql\`(\${db.select({count: sql<number>\`count(*)\`}).from(assets).where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids)))}) = \${ids.length}\`; }
function claim(db: Db, ownerId: string, id: string) { return exists(db.select({one: sql\`1\`}).from(assets).where(and(eq(assets.ownerId, ownerId), eq(assets.id, id)))); }
export async function owned(db: Db, ownerId: string, ids: string[], id: string) { return await db.select({id: assets.id}).from(assets).where(and(eq(assets.id, id), eq(assets.ownerId, ownerId), allOwned(db, ownerId, ids), claim(db, ownerId, id), sql\`not (\${claim(db, ownerId, id)})\`, notExists(db.select({one: sql\`1\`}).from(imageryGenerations).where(and(eq(imageryGenerations.assetId, id), eq(imageryGenerations.importHash, id)))))); }`;
const R1_CTE_BODY = `import { max } from "drizzle-orm"; import { characterEmbeddings } from "@orb/db";
export async function owned(db: Db, ownerId: string, id: string) {
const activity = db.$with("activity").as(db.select({characterId: characterEmbeddings.characterId, lastAt: max(characterEmbeddings.id).as("last_at")}).from(characterEmbeddings).groupBy(characterEmbeddings.characterId));
return await db.with(activity).select({id: characters.id}).from(characters).leftJoin(activity, eq(activity.characterId, characters.id)).where(and(eq(characters.ownerId, ownerId), sql\`coalesce(\${activity.lastAt}, \${characters.id}) > \${id}\`));
}`;
const R1_CASES = [
  {
    name: "R1 review full caption native ascending order retains complete emitted clauses",
    body: R1_CAPTION_BODY.replace(
      "import {imageEmbeddings, imageAnalyses}",
      'import {asc} from "drizzle-orm"; import {imageEmbeddings, imageAnalyses}',
    ).replace("currentImage,extra));", "currentImage,extra)).orderBy(asc(characters.name));"),
    tokens: [],
  },
  {
    name: "R1 review native descending subselect order retains actual operand origin",
    body: 'import {desc} from "drizzle-orm"; export async function owned(db: Db, ownerId: string) { const observed = sql`(${db.select({one:sql`1`}).from(characters).orderBy(desc(characters.id))}) > 0`; return await db.select().from(characters).where(and(eq(characters.ownerId,ownerId),observed)); }',
    tokens: [],
  },

  {
    name: "R1 review append containing escape cannot retain shared child chunks",
    body: 'import type {SQL} from "drizzle-orm"; declare function escape(value: SQL): void; export async function owned(db: Db, ownerId: string) { const child = sql`1`; const parent = sql`0`.append(child); escape(parent); return await db.select().from(characters).where(and(eq(characters.ownerId,ownerId),sql`${child}`)); }',
    tokens: ["characters"],
  },
  {
    name: "R1 review direct shared-child escape refuses containment",
    body: 'import type {SQL} from "drizzle-orm"; declare function escape(value: SQL): void; export async function owned(db: Db, ownerId: string) { const child = sql`1`; escape(child); return await db.select().from(characters).where(and(eq(characters.ownerId,ownerId),sql`${child}`)); }',
    tokens: ["characters"],
  },
  ...(["orderBy", "groupBy", "having"] as const).flatMap((method) => [
    {
      name: `R1 review actual-column ${method} emitted operand remains contained`,
      body: `export async function owned(db: Db, ownerId: string) { const observed = sql\`(\${db.select({one:sql\`1\`}).from(characters).${method}(${method === "having" ? "eq(characters.id,ownerId)" : "characters.id"})}) > 0\`; return await db.select().from(characters).where(and(eq(characters.ownerId,ownerId),observed)); }`,
      tokens: [],
    },
    {
      name: `R1 review unknown SQL ${method} emitted operand refuses containment`,
      body: `import type {SQL} from "drizzle-orm"; export async function owned(db: Db, ownerId: string, emitted: SQL) { const observed = sql\`(\${db.select({one:sql\`1\`}).from(characters).${method}(emitted)}) > 0\`; return await db.select().from(characters).where(and(eq(characters.ownerId,ownerId),observed)); }`,
      tokens: ["characters"],
    },
  ]),

  { name: "R1 full portrait cross-modal/current-avatar clauses retain independent asset ownership and nullable metadata", body: R1_PORTRAIT_BODY, tokens: [] },
  { name: "R1 full caption facet alternatives retain actual metadata/asset FK origin", body: R1_CAPTION_BODY, tokens: [] },
  {
    name: "R1 caption SQL formal without supplied origins remains explicitly unproved",
    body: R1_CAPTION_BODY.replace("path: string, value: string, isList: boolean", 'extra: import("drizzle-orm").SQL').replace(
      /const extra = isList[^;]+;/u,
      "",
    ),
    tokens: ["characters", "assets"],
  },

  {
    name: "R1 native literal joins preserve complete adjacent fragment boundaries",
    body: "export async function owned(db: Db, ownerId: string) { const child = sql`1`; const pieces = [child]; const joined = sql.join(pieces, sql``); return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), joined)); }",
    tokens: [],
  },
  {
    name: "R1 native join input mutation cannot retain its original chunks",
    body: "export async function owned(db: Db, ownerId: string) { const pieces = [sql`1`]; pieces.push(sql` OR 1`); return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql.join(pieces, sql``))); }",
    tokens: ["characters"],
  },
  {
    name: "R1 native join containing result cannot escape chunk stability",
    body: 'import type {SQL} from "drizzle-orm"; declare function escape(value: SQL): void; export async function owned(db: Db, ownerId: string) { const child = sql`1`; const pieces = [child]; const joined = sql.join(pieces, sql``); escape(joined); return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), child)); }',
    tokens: ["characters"],
  },
  {
    name: "R1 joined SQL fragments cannot form OR across their native delimiter",
    body: "export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1 ${sql.join([sql`O`, sql`R`], sql``)} 1`)); }",
    tokens: ["characters"],
  },
  {
    name: "R1 foreign aggregate annotation cannot replace installed constructor identity",
    body: 'import {max} from "drizzle-orm"; declare const foreign: typeof max; export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`${foreign(characters.id)} > ${ownerId}`)); }',
    tokens: ["characters"],
  },
  {
    name: "R1 borrowed native signature from a foreign module refuses constructor origin",
    body: 'import {max as foreignMax} from "drizzle-orm-foreign"; export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`${foreignMax(characters.id)} > ${ownerId}`)); }',
    tokens: ["characters"],
  },
  {
    name: "R1 overwritten native array map cannot borrow default-library identity",
    body: 'export async function owned(db: Db, ownerId: string) { const roles = ["host"]; roles.map = (() => [sql` OR 1`]) as never; return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql`1 ${sql.join(roles.map(role => sql`${role}`), sql`, `)}`)); }',
    tokens: ["characters"],
  },
  {
    name: "R1 a mutated native CTE cannot retain its original projection containment",
    escapes: true,
    body: R1_CTE_BODY.replace("return await db.with(activity)", "activity._.sql.append(sql` OR 1`); return await db.with(activity)"),
    tokens: ["characters"],
  },
  { name: "R1 current-generation tables and supplied column formals retain owner and avatar FK", body: R1_CURRENT_BODY, tokens: [] },
  {
    name: "R1 contained generation selection never supplies a missing owner",
    body: R1_CURRENT_BODY.replace("eq(characters.ownerId, ownerId), currentCard", "eq(characters.id, ownerId), currentCard"),
    tokens: ["characters", "assets"],
  },
  {
    name: "R1 unknown same-typed generation table cannot borrow native table origin",
    body: R1_CURRENT_BODY.replace("from ${embedSpaceState}", "from ${({ getSQL() { return sql`1 OR 1`; } }) as never}"),
    tokens: ["characters", "assets"],
  },
  {
    name: "R1 complete generation predicate never repairs a severed avatar FK",
    body: R1_CURRENT_BODY.replace("eq(assets.id, characters.avatarAssetId)", "eq(assets.id, ownerId)"),
    tokens: ["assets"],
  },
  { name: "R1 full hidden message-tail and history CASE retain correlated current membership", body: R1_MESSAGE_BODY, tokens: [] },
  {
    name: "R1 full tail cannot inherit departed caller membership",
    body: R1_MESSAGE_BODY.replace("isNull(chatParticipants.leftSeq),", ""),
    tokens: ["characters"],
  },
  { name: "R1 full tail cannot borrow a severed room correlation", body: R1_MESSAGE_BODY.replace("eq(seats.chatId, chats.id),", ""), tokens: ["characters"] },
  { name: "R1 standing table identifiers and native parameter joins narrow owned rows", body: R1_STANDING_BODY, tokens: [] },
  {
    name: "R1 native filtered standing role registry retains driver-only list origin",
    body: R1_STANDING_BODY.replace('["host", "member"])', '(["host", "member"] as const).filter(role => role !== ownerId))'),
    tokens: [],
  },
  {
    name: "R1 supplied driver array with an overwritten mapper cannot borrow a formal annotation",
    body: R1_STANDING_BODY.replace(
      "return await db.select().from(characters)",
      'const roles = ["host"]; roles.map = (() => [sql` OR 1`]) as never; return await db.select().from(characters)',
    ).replace('["host", "member"])', "roles)"),
    tokens: ["characters"],
  },
  {
    name: "R1 supplied driver array escape refuses mapped SQL chunk origin",
    body:
      "declare function escape(value: string[]): void; " +
      R1_STANDING_BODY.replace(
        "return await db.select().from(characters)",
        'const roles = ["host"]; escape(roles); return await db.select().from(characters)',
      ).replace('["host", "member"])', "roles)"),
    tokens: ["characters"],
  },
  {
    name: "R1 mapped callback cannot mutate its supplied array through the third formal",
    body: R1_STANDING_BODY.replace(
      "roles.map((role) => sql`${role}`)",
      "roles.map((role, index, values) => { values.map = (() => [sql` OR 1`]) as never; return sql`${role}`; })",
    ),
    tokens: ["characters"],
  },
  {
    name: "R1 parameter joins cannot contain a dynamic raw separator",
    body: R1_STANDING_BODY.replace("sql`, `", "sql.raw(ownerId)"),
    tokens: ["characters"],
  },
  { name: "R1 complete imagery count and competing-output subselect guards remain contained", body: R1_OUTPUT_BODY, tokens: [] },
  { name: "R1 genuine native aggregate CTE fields narrow a separately owned character", body: R1_CTE_BODY, tokens: [] },
  {
    name: "R1 CTE metadata does not authorize a severed owner predicate",
    body: R1_CTE_BODY.replace("eq(characters.ownerId, ownerId)", "eq(characters.id, ownerId)"),
    tokens: ["characters"],
  },
  {
    name: "R1 unknown formal column annotation never proves supplied runtime origin",
    body: 'import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core"; import { isNotNull } from "drizzle-orm"; export async function owned(db: Db, ownerId: string, column: AnySQLiteColumn) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), isNotNull(column))); }',
    tokens: ["characters"],
  },
] as const;
for (const scenario of R1_CASES) {
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
test("R1 pure installed DISTINCT QueryBuilder retains exact native carrier containment, not authority", async ({ plantedTree, repoRoot }) => {
  const producer =
    SCOPE_HEAD +
    `import {QueryBuilder} from "drizzle-orm/sqlite-core"; import {isNotNull} from "drizzle-orm";
function carrier(ownerId: string) {
const relation = new QueryBuilder().selectDistinct({chatId: chatParticipants.chatId, ownerId: characters.ownerId}).from(chatParticipants)
.innerJoin(characters, eq(characters.id, chatParticipants.characterId)).innerJoin(chats, eq(chats.id, chatParticipants.chatId))
.where(and(eq(chatParticipants.kind, "character"), isNotNull(chats.startedAt))).as("retained_chat_membership");
return new QueryBuilder().select({chatId: relation.chatId}).from(relation).where(eq(sql\`\${relation.ownerId}\`, ownerId)).getSQL();
}
export async function owned(db: Db, ownerId: string) { return await db.select().from(characters).where(and(eq(characters.ownerId, ownerId), sql\`\${characters.id} in (\${carrier(ownerId)})\`)); }`;
  const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer, recipient: "" });
  const carrier = fixture.source.getFunctionOrThrow("carrier");
  const value = carrier.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => call.getExpression().getText().endsWith(".getSQL"));
  if (value === undefined) {
    throw new Error("the exact installed carrier did not load");
  }
  expect(readDrizzleClientCall(fixture.anchor)).toMatchObject({ kind: "drizzle", method: "from" });
  beginReferencePass();
  try {
    expect(readSqlOperandContainment(value)).toBe(false);
    expect(readSqlOperandContainment(value, new Map(), statementObservations(fixture.root, fixture.project))).toBe(true);
  } finally {
    endReferencePass();
  }
});

test("R1 supplied SQL origins refuse other compiler worlds and forgotten source epochs", async ({ plantedTree, repoRoot }) => {
  const scenario = {
    producer: `import {eq, sql, type SQLWrapper} from "drizzle-orm"; import {personas, type Db} from "@orb/db"; function narrow(column: SQLWrapper) { return sql\`\${column} > \${"control"}\`; } export async function owned(db: Db, ownerId: string) { return await db.select().from(personas).where(eq(personas.ownerId, ownerId)); } const supplied = narrow(personas.id);`,
    recipient: "",
  };
  const original = await nativeFixture({ plantedTree, repoRoot }, scenario);
  const other = await nativeFixture({ plantedTree, repoRoot }, scenario);
  const fn = original.source.getFunctionOrThrow("narrow");
  const parameter = fn.getParameters()[0];
  const template = fn.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression)[0];
  const native = original.source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "narrow")
    ?.getArguments()[0];
  const foreign = other.source
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "narrow")
    ?.getArguments()[0];
  if (parameter === undefined || template === undefined || native === undefined || foreign === undefined) {
    throw new Error("the native SQL-origin control did not load its actual supplied column");
  }
  expect(readSqlOperandContainment(template, new Map([[parameter, native]]))).toBe(true);
  expect(readSqlOperandContainment(template, new Map([[parameter, foreign]]))).toBe(false);
  const bindings = new Map([[parameter, native]]);
  fn.remove();
  expect(template.wasForgotten()).toBe(true);
  expect(readSqlOperandContainment(template, bindings)).toBe(false);
});

test("R1 review native append shares physical chunks and unknown sort changes emitted lexical state", () => {
  const dialect = new SQLiteSyncDialect();
  const child = sql`1`;
  const parent = sql`0`.append(child);
  const shared = parent.queryChunks.find((chunk) => child.queryChunks.includes(chunk));
  expect(sqliteFragmentContained(dialect.sqlToQuery(child).sql)).toBe(true);
  if (!(shared instanceof StringChunk)) {
    throw new Error("installed native append did not share its authored string chunk");
  }
  expect(child.queryChunks.includes(shared)).toBe(true);
  shared.value.push(" OR 1");
  expect(sqliteFragmentContained(dialect.sqlToQuery(child).sql)).toBe(false);
  const rows = sqliteTable("rows", { id: text("id") });
  const db = drizzle.mock({ schema: { rows } });
  const safe = db.select({ one: sql`1` }).from(rows).orderBy(rows.id);
  const unknown = db.select({ one: sql`1` }).from(rows).orderBy(sql.raw(")"));
  expect(sqliteFragmentContained(dialect.sqlToQuery(sql`(${safe}) > 0`).sql)).toBe(true);
  expect(sqliteFragmentContained(dialect.sqlToQuery(sql`(${unknown}) > 0`).sql)).toBe(false);
});
