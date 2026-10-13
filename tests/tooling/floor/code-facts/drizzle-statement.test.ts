// @subject tooling/src/floor/code-facts/drizzle-statement.ts
// @subject tooling/src/verify/gates/owner-scoped-reads.ts

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns } from "@orb/tooling/floor/code-facts/call-returns";
import { readStatementOf } from "@orb/tooling/floor/code-facts/drizzle-statement";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { and, eq } from "drizzle-orm";
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
    name: "settled owner and opaque AND conjunct remain admitted",
    producer: BUILDER.replace("import { eq }", "import { and, eq, type SQL }")
      .replace("export function owned(db: Db, ownerId: string)", "export async function owned(db: Db, ownerId: string, cond: SQL = eq(personas.id, ownerId))")
      .replace(".where(eq(personas.ownerId, ownerId))", ".where(and(eq(personas.ownerId, ownerId), cond))"),
    recipient: `${RECIPIENT_HEAD}export async function read(db: Db, ownerId: string) { return await owned(db, ownerId); }`,
    findings: 0,
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
    "packages/db/src/schema/persona.ts": `${SCHEMA}export const characters = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id").notNull() }); export const chats = sqliteTable("chats", {id: text("id").primaryKey(), anchorPersonaId: text("anchor_persona_id").references(() => personas.id)});`,
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
