// @subject tooling/src/floor/code-facts/call-returns.ts
// @subject tooling/src/floor/code-facts/value-carrier.ts
// @subject tooling/src/floor/code-facts/drizzle-predicate.ts
// @subject tooling/src/floor/code-facts/drizzle-sql.ts
// @subject tooling/src/floor/code-facts/drizzle-sql-stability.ts
import { nativeFixture, statementObservations } from "@orb/testkit/node/native-drizzle.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { exists, SQL, Subquery, sql } from "drizzle-orm";
import { QueryBuilder, SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SyntaxKind } from "ts-morph";
import { observeCallReturns } from "../../../../tooling/src/floor/code-facts/call-returns.ts";
import { readSqlOperandContainment } from "../../../../tooling/src/floor/code-facts/drizzle-sql.ts";
import { beginReferencePass, endReferencePass } from "../../../../tooling/src/floor/code-facts/reference-fact.ts";
import { readReturnedValue } from "../../../../tooling/src/floor/code-facts/value-carrier.ts";
import { gate } from "../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const HEAD = 'import {and,eq,isNotNull,sql,type SQL} from "drizzle-orm"; import {personas,type Db} from "@orb/db";';
const CAPTION = `async function caption(db: Db, ownerId: string, extra?: SQL) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),extra)); }
export async function ordinary(db: Db, ownerId: string) { return await caption(db,ownerId); }
export async function facet(db: Db, ownerId: string, value: string) { const extra = sql\`length(\${personas.id}) > \${value}\`; return await caption(db,ownerId,extra); }`;
const COLUMN = `async function facet(db: Db, ownerId: string, col: typeof personas.id | typeof personas.ownerId) {
return await db.select({value:col,count:sql<number>\`count(*)\`}).from(personas).where(and(eq(personas.ownerId,ownerId),isNotNull(col))).groupBy(col);
}

export async function facets(db: Db,ownerId:string) { return await Promise.all([facet(db,ownerId,personas.id),facet(db,ownerId,personas.ownerId)]); }`;
const RETURNED = `const fragment = sql\`length(\${personas.id}) > 0\`;
function extra() { return sql\`\${fragment}\`; }
export async function owned(db:Db,ownerId:string) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),extra())); }`;
const CASES = [
  {
    name: "review inline getSQL mutation cannot hide before its actual native executor",
    body: "export function read(db:Db,ownerId:string) { return db.run(db.select().from(personas).where(eq(personas.ownerId,ownerId)).getSQL().append(sql` OR 1`)); }",
    findings: 1,
  },
  {
    name: "review native fluent factory result retains shared SQL consumer closure",
    body:
      RETURNED +
      'function make(db:Db,ownerId:string) {return db.select().from(personas).where(eq(personas.ownerId,ownerId)).$dynamic();} declare function escape(query:import("drizzle-orm").SQLWrapper):void; export function unsafe(db:Db,ownerId:string) {escape(make(db,ownerId).where(and(eq(personas.ownerId,ownerId),fragment)));}',
    findings: 2,
  },
  {
    name: "review native alias construction is not SELECT execution",
    body: 'declare function escape(query:import("drizzle-orm").SQLWrapper):void; export function read(db:Db,ownerId:string) { escape(db.select().from(personas).where(eq(personas.ownerId,ownerId)).as("wrapped")); }',
    findings: 1,
  },
  {
    name: "review awaiting native getSQL is not SELECT execution",
    body: "declare function escape(query:SQL):void; export async function read(db:Db,ownerId:string) { escape(await db.select().from(personas).where(eq(personas.ownerId,ownerId)).getSQL()); }",
    findings: 1,
  },
  {
    name: "review recursive inline wrapper consumers refuse without a tool error",
    body: 'import {exists} from "drizzle-orm"; function loop(db:Db,ownerId:string):SQL { if(ownerId.length>0) return exists(db.select().from(personas).where(eq(personas.ownerId,ownerId))); return loop(db,ownerId); } export function read(db:Db,ownerId:string) { return loop(db,ownerId); }',
    findings: 1,
  },
  {
    name: "review shadowed undefined actual is not the runtime default trigger",
    body: 'async function helper(db:Db,ownerId:string,extra:SQL|undefined=sql.raw("1")) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),extra)); } export async function read(db:Db,ownerId:string,undefined:SQL) { return await helper(db,ownerId,undefined); }',
    findings: 1,
  },
  {
    name: "review inline native SELECT direct opaque handoff refuses",
    body: 'declare function escape(query:import("drizzle-orm").SQLWrapper):void; export function read(db:Db,ownerId:string) { escape(db.select().from(personas).where(eq(personas.ownerId,ownerId))); }',
    findings: 1,
  },
  {
    name: "review inline native EXISTS opaque handoff refuses without shared aliases",
    body: 'import {exists} from "drizzle-orm"; declare function escape(query:SQL):void; export function read(db:Db,ownerId:string) { escape(exists(db.select().from(personas).where(eq(personas.ownerId,ownerId)))); }',
    findings: 1,
  },
  {
    name: "review inline native template opaque handoff refuses without shared aliases",
    body: "declare function escape(query:SQL):void; export function read(db:Db,ownerId:string) { escape(sql`(${db.select().from(personas).where(eq(personas.ownerId,ownerId))})`); }",
    findings: 1,
  },
  {
    name: "review inline native wrappers close at actual awaited SELECT execution",
    body: 'import {exists} from "drizzle-orm"; export async function read(db:Db,ownerId:string) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),exists(db.select().from(personas).where(eq(personas.ownerId,ownerId))),sql`(${db.select().from(personas).where(eq(personas.ownerId,ownerId))})`)); }',
    findings: 0,
  },
  {
    name: "R3 native EXISTS and hoisted notExists preserve shared SQL through closed awaited readers",
    body:
      RETURNED +
      'import {exists,notExists} from "drizzle-orm"; export async function nested(db:Db,ownerId:string) { const query=db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment)); return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),exists(query),notExists(db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment))))); }',
    findings: 0,
  },
  {
    name: "R3 native EXISTS containing escape refuses the shared SQL origin transitively",
    body:
      RETURNED +
      'import {exists} from "drizzle-orm"; declare function escape(query:SQL):void; export function nested(db:Db,ownerId:string) { escape(exists(db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment)))); }',
    findings: 2,
  },
  {
    name: "R3 native SQL-template containing mutation refuses the shared SQL origin transitively",
    body:
      RETURNED +
      "export function nested(db:Db,ownerId:string) { const holder=sql`(${db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment))})`; holder.append(sql` limit 1`); }",
    findings: 2,
  },
  {
    name: "R3 shared SQL inside escaped native WHERE refuses both readers",
    body:
      RETURNED +
      'declare function escape(query:import("drizzle-orm").SQLWrapper):void; export function escapeWhere(db:Db,ownerId:string) { escape(db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment))); }',
    findings: 2,
  },
  {
    name: "R3 shared SQL projected into escaped native select refuses both readers",
    body:
      RETURNED +
      'declare function escape(query:import("drizzle-orm").SQLWrapper):void; export function escapeProjection(db:Db,ownerId:string) { escape(db.select({shared:fragment}).from(personas).where(eq(personas.ownerId,ownerId))); }',
    findings: 2,
  },
  { name: "R3 optional supplied caption SQL preserves all complete caller alternatives", body: CAPTION, findings: 0 },
  {
    name: "R3 inline supplied SQL refuses mutation through its formal",
    body: "async function caption(db:Db,ownerId:string,extra:SQL) { extra.append(sql` OR 1`); return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),extra)); } export async function ordinary(db:Db,ownerId:string) { return await caption(db,ownerId,sql`1`); }",
    findings: 1,
  },
  {
    name: "R3 supplied SQLWrapper formal cannot erase actual SQL mutation through getSQL",
    body: 'async function caption(db:Db,ownerId:string,extra:import("drizzle-orm").SQLWrapper) { extra.getSQL().append(sql` OR 1`); return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),sql`${extra}`)); } export async function ordinary(db:Db,ownerId:string) { return await caption(db,ownerId,sql`1`); }',
    findings: 1,
  },
  {
    name: "R3 unknown caption caller refuses whole supplied-origin proof",
    body: CAPTION + "export async function unsafe(db:Db,ownerId:string,extra:SQL) { return await caption(db,ownerId,extra); }",
    findings: 1,
  },
  {
    name: "R3 an escaping caption callable refuses closed caller evidence",
    body: CAPTION + "declare function escape(fn:typeof caption):void; escape(caption);",
    findings: 1,
  },
  { name: "R3 named column formal retains both actual native origins", body: COLUMN, findings: 0 },
  {
    name: "R3 same-typed foreign column cannot join supplied native origins",
    body: COLUMN + "declare const foreign:typeof personas.id; export async function unsafe(db:Db,ownerId:string) { return await facet(db,ownerId,foreign); }",
    findings: 1,
  },
  { name: "R3 returned containing SQL closes actual caller lifetime", body: RETURNED, findings: 0 },
  {
    name: "R3 returned containing SQL escape invalidates shared original fragment",
    body: RETURNED + "declare function escape(value:SQL):void; escape(extra());",
    findings: 1,
  },
  { name: "R3 returned containing SQL mutation invalidates shared original fragment", body: RETURNED + "extra().append(sql` OR 1`);", findings: 1 },
  {
    name: "R3 primitive native tuple cannot erase mandatory owner",
    body: 'import {inArray} from "drizzle-orm"; const allowed=["owned","retained"] as const; export async function owned(db:Db,ownerId:string) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),inArray(personas.id,allowed))); }',
    findings: 0,
  },
] as const;
const DEFAULT_INPUTS = [
  { name: "omitted", argument: "", usesDefault: true, refused: false, unsafe: false, value: "default" },
  { name: "undefined", argument: ",undefined", usesDefault: true, refused: false, unsafe: false, value: "default" },
  { name: "possible", argument: ",possible", usesDefault: false, refused: true, unsafe: false, value: undefined },
  { name: "defined-safe", argument: ',sql.raw("1")', usesDefault: false, refused: false, unsafe: false, value: "1" },
  { name: "defined-unsafe", argument: ',sql.raw("1 OR 1")', usesDefault: false, refused: false, unsafe: true, value: "1 OR 1" },
  { name: "declared-undefined", argument: ",unknown()", usesDefault: false, refused: true, unsafe: false, value: undefined },
] as const;
const DEFAULT_CASES = [false, true].flatMap((safeDefault) =>
  DEFAULT_INPUTS.map((actual) => {
    const defaultSql = safeDefault ? "1" : "1 OR 1";
    const findings = actual.refused || actual.unsafe || (!safeDefault && actual.usesDefault) ? 1 : 0;
    return {
      name: `review ${safeDefault ? "safe" : "unsafe"} SQL default with ${actual.name} actual`,
      body: `declare function unknown():undefined; async function helper(db:Db,ownerId:string,extra:SQL|undefined=sql.raw(${JSON.stringify(defaultSql)})) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),extra)); } export async function read(db:Db,ownerId:string,possible?:SQL) { return await helper(db,ownerId${actual.argument}); }`,
      findings,
    };
  }),
);
for (const scenario of [...CASES, ...DEFAULT_CASES]) {
  test(scenario.name, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer: HEAD + scenario.body, recipient: "" });
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
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(Array.from({ length: scenario.findings }, () => "personas"));
  });
}

for (const actual of DEFAULT_INPUTS.filter((input) => !input.unsafe)) {
  test(`review returned value normalizes ${actual.name} default input`, async ({ plantedTree, repoRoot }) => {
    const argument = actual.argument.slice(1);
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer:
          HEAD +
          `declare function unknown():undefined; function choose(value:SQL|undefined=sql.raw("default")) {return value;} export async function read(db:Db,ownerId:string,possible?:SQL) { const selected=choose(${argument}); return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),selected)); }`,
        recipient: "",
      },
    );
    const call = fixture.source
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((declaration) => declaration.getName() === "selected")
      ?.getInitializer();
    if (call === undefined) {
      throw new Error("the actual returned default consumer is missing");
    }
    const terminals = new Set(
      fixture.source
        .getDescendantsOfKind(SyntaxKind.CallExpression)
        .filter((candidate) => candidate.getExpression().getText() === "sql.raw")
        .map((candidate) => candidate.compilerNode),
    );
    beginReferencePass();
    try {
      const fact = readReturnedValue(call, [], statementObservations(fixture.root, fixture.project), terminals);
      expect(fact.kind).toBe(actual.refused ? "unresolved" : "resolved");
      const values = fact.kind === "resolved" ? fact.value.map((source) => source.value.getText()) : undefined;
      expect(values).toEqual(actual.refused ? undefined : [`sql.raw(${JSON.stringify(actual.value)})`]);
    } finally {
      endReferencePass();
    }
  });
}

for (const escaped of [false, true]) {
  test(`R3 imported SQL original ${escaped ? "refuses foreign containing escape" : "retains complete native consumer"}`, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture(
      { plantedTree, repoRoot },
      {
        producer:
          HEAD +
          "export const fragment=sql`length(${personas.id}) > 0`; export async function original(db:Db,ownerId:string) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment)); }",
        recipient:
          HEAD +
          'import {fragment} from "./producer.js"; export async function imported(db:Db,ownerId:string) { return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),fragment)); }' +
          (escaped ? "declare function escape(value:SQL):void; escape(sql`${fragment}`);" : ""),
      },
    );
    const result = runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root: fixture.root,
      project: fixture.project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(escaped ? ["personas", "personas"] : []);
  });
}

test("R3 native returned tuple keeps the actual destructured slot", async ({ plantedTree, repoRoot }) => {
  const fixture = await nativeFixture(
    { plantedTree, repoRoot },
    {
      producer:
        HEAD +
        'function pair() { return [sql.raw("1"),sql.raw("2")] as const; } export function use(db:Db,ownerId:string) { const [first,second]=pair(); return db.select().from(personas).where(and(eq(personas.ownerId,ownerId),first,second)); }',
      recipient: "",
    },
  );
  const source = fixture.project.getSourceFiles().find((file) => file.getFunction("use") !== undefined);
  if (source === undefined) {
    throw new Error("the supplied tuple consumer is missing");
  }
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const terminals = new Set(calls.filter((call) => call.getExpression().getText() === "sql.raw").map((call) => call.compilerNode));
  const observed = observeCallReturns(calls);
  for (const [name, expectedArgument] of [
    ["first", "1"],
    ["second", "2"],
  ] as const) {
    const use = source
      .getFunctionOrThrow("use")
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getExpression().getText() === "and")
      ?.getArguments()
      .find((argument) => argument.getText() === name);
    if (use === undefined) {
      throw new Error("the returned tuple slot is missing");
    }
    const fact = readReturnedValue(use, [], observed, terminals);
    expect(fact.kind).toBe("resolved");
    expect(fact.kind === "resolved" ? fact.value.map((leaf) => [leaf.value.getText(), leaf.path, leaf.present]) : []).toEqual([
      [`sql.raw("${expectedArgument}")`, [], true],
    ]);
  }
});

const GALLERY = `import {asc,desc,gt,lt,or} from "drizzle-orm";
interface Order { readonly columns: readonly SQL[]; readonly after: (cursor:{id:string}) => SQL | undefined; }
const orders:Readonly<Record<"newest" | "oldest",Order>> = {
 newest:{columns:[desc(personas.id),desc(personas.ownerId)],after:(cursor)=>or(lt(personas.id,cursor.id),and(eq(personas.id,cursor.id),lt(personas.ownerId,cursor.id)))},
 oldest:{columns:[asc(personas.id),asc(personas.ownerId)],after:(cursor)=>or(gt(personas.id,cursor.id),and(eq(personas.id,cursor.id),gt(personas.ownerId,cursor.id)))}
};
export async function gallery(db:Db,ownerId:string,input:{sort:"newest" | "oldest";cursor:{id:string}}) { const order=orders[input.sort]; return await db.select().from(personas).where(and(eq(personas.ownerId,ownerId),order.after(input.cursor))).orderBy(...order.columns); }`;
for (const scenario of [
  { name: "all literal gallery callees retain mandatory owner", body: GALLERY, findings: 0 },
  { name: "gallery open selector refuses inherited and missing alternatives", body: GALLERY.replaceAll('"newest" | "oldest"', "string"), findings: 1 },
  { name: "gallery severed owner stays unscoped", body: GALLERY.replace("eq(personas.ownerId,ownerId),order.after", "order.after"), findings: 1 },
  {
    name: "gallery projected object escape refuses",
    body: GALLERY.replace("const order=orders[input.sort];", "const order=orders[input.sort]; escape(order);") + "declare function escape(value:Order):void;",
    findings: 1,
  },
  {
    name: "gallery malformed SQL alternative refuses",
    body: GALLERY.replace(
      "after:(cursor)=>or(gt(personas.id,cursor.id),and(eq(personas.id,cursor.id),gt(personas.ownerId,cursor.id)))",
      'after:()=>sql.raw(" OR 1")',
    ),
    findings: 1,
  },
  { name: "gallery opaque record escape refuses", body: GALLERY + "declare function escape(value:typeof orders):void; escape(orders);", findings: 1 },
] as const) {
  test(`R3 ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer: HEAD + scenario.body, recipient: "" });
    const result = runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root: fixture.root,
      project: fixture.project,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings.map(({ token }) => token)).toEqual(Array.from({ length: scenario.findings }, () => "personas"));
  });
}

const RETAINED = `import {QueryBuilder} from "drizzle-orm/sqlite-core"; import {characters,chatParticipants,chats} from "@orb/db";
const membership=new QueryBuilder().selectDistinct({chatId:chatParticipants.chatId,ownerId:characters.ownerId}).from(chatParticipants).innerJoin(characters,eq(characters.id,chatParticipants.characterId)).innerJoin(chats,eq(chats.id,chatParticipants.chatId)).where(and(eq(chatParticipants.kind,"character"),isNotNull(chats.startedAt))).as("retained_chat_membership");
const retained=(chatId:string)=>new QueryBuilder().select({ownerId:membership.ownerId}).from(membership).where(eq(membership.chatId,chatId));
function ownerChatIds(ownerId:string | SQL):SQL {return new QueryBuilder().select({chatId:membership.chatId}).from(membership).where(eq(sql\`\${membership.ownerId}\`,ownerId)).getSQL();}
export async function read(db:Db,ownerId:string,chatId:string) {const cohort=retained(chatId).as("retained_chat_owners"); return await db.select().from(personas).innerJoin(cohort,eq(cohort.ownerId,personas.ownerId)).where(and(eq(personas.ownerId,ownerId),sql\`\${personas.id} in (\${ownerChatIds(sql\`\${cohort.ownerId}\`)})\`));}`;
for (const scenario of [
  { name: "returned native retained cohort and supplied inverse column preserve complete origin", body: RETAINED, contained: true },
  {
    name: "retained containing builder escape refuses shared native carrier lifetime",
    body: RETAINED + 'declare function escape(value:ReturnType<typeof retained>):void; escape(retained("foreign"));',
    contained: false,
  },
  {
    name: "retained unknown supplied SQL refuses native inverse origin",
    body: RETAINED.replace("chatId:string) {const cohort", "chatId:string,extra:SQL) {const cohort").replace(
      "ownerChatIds(sql`${cohort.ownerId}`)",
      "ownerChatIds(extra)",
    ),
    contained: false,
  },
] as const) {
  test(`R3 ${scenario.name}`, async ({ plantedTree, repoRoot }) => {
    const fixture = await nativeFixture({ plantedTree, repoRoot }, { producer: HEAD + scenario.body, recipient: "" });
    const read = fixture.source.getFunctionOrThrow("read");
    const predicate = read
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((call) => call.getExpression().getText().endsWith(".where"))
      ?.getArguments()[0];
    if (predicate === undefined) {
      throw new Error("the native retained consumer predicate is missing");
    }
    beginReferencePass();
    try {
      expect(readSqlOperandContainment(predicate, new Map(), statementObservations(fixture.root, fixture.project))).toBe(scenario.contained);
    } finally {
      endReferencePass();
    }
  });
}

function containsNativeSql(container: SQL, needle: SQL): boolean {
  return (
    container === needle ||
    container.queryChunks.some((chunk) => {
      if (chunk instanceof SQL) {
        return containsNativeSql(chunk, needle);
      }
      return chunk instanceof Subquery && containsNativeSql(chunk._.sql, needle);
    })
  );
}

test("native returned select exposes the same mutable subquery SQL", () => {
  const rows = sqliteTable("retained_rows", { id: text("id"), ownerId: text("owner_id") });
  const relation = new QueryBuilder().select({ ownerId: rows.ownerId }).from(rows).where(sql`1`).as("retained_membership");
  const returned = new QueryBuilder().select({ ownerId: relation.ownerId }).from(relation).where(sql`1`);
  const output = returned.getSQL();
  const dialect = new SQLiteSyncDialect();
  const before = dialect.sqlToQuery(output).sql;
  expect(containsNativeSql(output, relation._.sql)).toBe(true);
  relation._.sql.append(sql` limit 1`);
  expect(dialect.sqlToQuery(output).sql).not.toBe(before);
  expect(dialect.sqlToQuery(output).sql).toContain("limit 1");
});

test("review installed inline wrappers retain the exact editable SELECT builder", () => {
  const rows = sqliteTable("inline_rows", { id: text("id") });
  const query = new QueryBuilder().select().from(rows).where(sql`1`);
  const wrappers = [exists(query), sql`(${query})`];
  const dialect = new SQLiteSyncDialect();
  const before = wrappers.map((wrapper) => dialect.sqlToQuery(wrapper).sql);
  expect(wrappers.map((wrapper) => wrapper.queryChunks.includes(query))).toEqual([true, true]);
  query.limit(1);
  expect(wrappers.map((wrapper, index) => dialect.sqlToQuery(wrapper).sql !== before[index])).toEqual([true, true]);
});
