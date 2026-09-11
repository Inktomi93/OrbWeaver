// The final schema query proves Drizzle identity and refuses every lossy population shape.
import type { Node, SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import type { ReferenceFact } from "../../../../tooling/src/verify/contract/reference-fact.ts";
import type { SchemaFact, SchemaModel, SchemaQuery } from "../../../../tooling/src/verify/contract/schema-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { createSchemaQuery, drizzleSchemaFact } from "../../../../tooling/src/verify/lib/schema-fact.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/repo/";

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}${path}`, source);
  }
  return project;
}

function queryOf(files: Readonly<Record<string, string>>): { readonly project: Project; readonly query: SchemaQuery } {
  const project = projectOf(files);
  const sources = project.getSourceFiles().filter((sourceFile) => sourceFile.getFilePath().includes("/packages/db/src/schema/"));
  return {
    project,
    query: createSchemaQuery({
      files: sources,
      relativePath: (sourceFile: SourceFile) => sourceFile.getFilePath().slice(ROOT.length),
      checker: () => project.getTypeChecker(),
    }),
  };
}

function ready(fact: SchemaFact<SchemaModel>): SchemaModel {
  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(fact.reason);
  }
  return fact.value;
}

function resolvedValue<T>(fact: ReferenceFact<T>): T {
  expect(fact.kind).toBe("resolved");
  if (fact.kind !== "resolved") {
    throw new Error(fact.detail);
  }
  return fact.value;
}

function unresolvedReason(fact: SchemaFact<SchemaModel>): string {
  expect(fact.status).toBe("unresolved");
  if (fact.status !== "unresolved") {
    throw new Error(`expected unresolved, got ${fact.status}`);
  }
  return fact.reason;
}

function member(project: Project, path: string, text: string): Node {
  const source = project.getSourceFileOrThrow(`${ROOT}${path}`);
  return (
    source
      .getDescendants()
      .find((node) => (node.isKind(SyntaxKind.PropertyAccessExpression) || node.isKind(SyntaxKind.ElementAccessExpression)) && node.getText() === text) ??
    source
  );
}

test("the first-class schema provider uses dispatcher declarations once and exposes its independent population", () => {
  const project = projectOf({
    "packages/db/src/schema/x.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const x = sqliteTable("x", { id: text("id").primaryKey() });',
    "packages/db/src/other.ts": "export const unrelated = true;\n",
  });
  let captured: SchemaQuery | undefined;
  const policy: GatePolicy = defineGate({
    id: "schema-provider-control",
    family: "schema-provider-control",
    authority: "hard",
    severity: "error",
    population: "@db",
    analysis: "types",
    execution: "entire-population",
    facts: [drizzleSchemaFact],
    resources: [],
    message: "schema provider control",
    create: (ctx) => ({
      evaluate: () => {
        captured = ctx.fact(drizzleSchemaFact);
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/db/src/schema/flag.ts": "export const flag = true;\n" }, why: "provider control" }],
    mustPass: [{ mode: "types", files: { "packages/db/src/schema/pass.ts": "export const pass = true;\n" }, why: "provider control" }],
  });
  const result = runPolicyPass({ knownPolicies: [policy], policies: [policy], root: ROOT.slice(0, -1), project, reviewedGrants: [], failOnWarnings: false });

  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.facts).toMatchObject([
    {
      id: "drizzle-schema",
      status: "success",
      population: { effectiveSourcePaths: ["packages/db/src/schema/x.ts"] },
      // THE RECEIPT IS THE WALKED DENOMINATOR, not the census (#1962): one admitted schema source, not the
      // two members the census below counts. The census is the fact's own published VALUE, asserted next.
      receipts: [{ source: "drizzle-schema-sources", members: 1 }],
    },
  ]);
  expect(captured?.schema()).toMatchObject({ status: "ready", receipt: { tables: 1, columns: 1, members: 2 } });
});

test("THE FAIL-OPEN SHAPE: a consumer that neither re-receipts nor reads the status renders a clean verdict over an EMPTY census", () => {
  // THE PLANTED CONTROL the phase move owes (#1962, coordinator-required). Moving the emptiness verdict off
  // the PROVIDER receipt and onto the consumer changes a UNIVERSAL refusal into a PER-CONSUMER one, and
  // `policyReceiptFailures` judges only the receipts a policy DID file — it has no "policy produced no
  // semantic receipt" arm, unlike `factReceiptFailures`. So a consumer that declares the fact, consumes it,
  // and files nothing passes SILENTLY over a schema tree that declares no table. Asserted here as the
  // runtime's actual shape rather than assumed either way.
  //
  // WHAT MAKES THE GUARANTEE UNIVERSAL TODAY IS THE SHARED HELPER, NOT THE RUNTIME: all 18 production
  // consumers of `drizzleSchemaFact` call `recordReadySchemaFact`, which THROWS on any non-`ready` status
  // AND files the census receipt (`contract/schema-fact.ts`; census by `grep -c recordReadySchemaFact` over
  // every module importing the provider, 2026-09-11). The probe below is deliberately the one shape no
  // production consumer has. A new consumer that skips the helper inherits no blindness door — which is why
  // the helper, not the receipt, is where a reviewer must look.
  let seen: SchemaFact<SchemaModel> | undefined;
  const silent: GatePolicy = defineGate({
    id: "schema-silent-consumer-probe",
    family: "schema-provider-control",
    authority: "hard",
    severity: "error",
    population: "@db",
    analysis: "types",
    execution: "entire-population",
    facts: [drizzleSchemaFact],
    resources: [],
    message: "schema silent consumer probe",
    create: (ctx) => ({
      evaluate: () => {
        seen = ctx.fact(drizzleSchemaFact).schema();
      },
    }),
    mustFlag: [{ mode: "types", files: { "packages/db/src/schema/flag.ts": "export const flag = true;\n" }, why: "provider control" }],
    mustPass: [{ mode: "types", files: { "packages/db/src/schema/pass.ts": "export const pass = true;\n" }, why: "provider control" }],
  });
  const result = runPolicyPass({
    knownPolicies: [silent],
    policies: [silent],
    root: ROOT.slice(0, -1),
    project: projectOf({ "packages/db/src/schema/x.ts": "export const notATable = true;\n" }),
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(seen?.status).toBe("empty");
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(result.policies[0]?.receipts).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
});

test("derives canonical tables, columns, FK, indexes, and open JSON through aliases and namespaces", () => {
  const { project, query } = queryOf({
    "packages/db/src/schema/drizzle-door.ts":
      'export { sqliteTable as makeTable, text as makeText, index as makeIndex, primaryKey as makePrimaryKey } from "drizzle-orm/sqlite-core";',
    "packages/db/src/schema/columns.ts":
      'import * as d from "drizzle-orm/sqlite-core";\nexport const userColumns = { id: d.text("id").primaryKey(), ["profile"]: d.text("profile", { mode: "json" }).$type<Record<string, unknown>>() };',
    "packages/db/src/schema/model.ts": `import * as door from "./drizzle-door.ts";
import * as definitions from "./columns.ts";
const { makeTable: table, makeText: text, makeIndex: index, makePrimaryKey: primaryKey } = door;
export const users = table("users", definitions.userColumns);
export const posts = table("posts", { id: text("id"), userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }) }, (t) => [
  primaryKey({ columns: [t.id, t.userId] }),
  index("posts_user_idx").on(t["userId"]),
]);`,
    "packages/db/src/schema/index.ts": 'export { posts as articles } from "./model.ts";',
    "packages/db/src/schema/consumer.ts": 'import * as schema from "./index.ts";\nexport const selected = schema["articles"]["userId"];',
  });

  const fact = query.schema();
  const model = ready(fact);
  expect(fact.receipt).toMatchObject({
    status: "ready",
    tables: 2,
    columns: 4,
    foreignKeys: 1,
    indexes: 2,
    jsonColumns: 1,
    openJsonColumns: 1,
    members: 9,
  });
  const posts = model.tables.find((candidate) => candidate.identity.declarationName === "posts");
  expect(posts?.indexes.map((index) => [index.kind, index.columns.map((indexedColumn) => indexedColumn.propertyName)])).toEqual([
    ["primary-key", ["id", "userId"]],
    ["index", ["userId"]],
  ]);
  expect(posts?.columns.find((candidate) => candidate.identity.propertyName === "userId")?.foreignKey).toMatchObject({
    parent: { kind: "population-column", column: { propertyName: "id" } },
    onDelete: { kind: "specified", value: "cascade" },
  });
  const profile = model.tables
    .find((candidate) => candidate.identity.declarationName === "users")
    ?.columns.find((candidate) => candidate.identity.propertyName === "profile");
  expect(profile?.json?.shape.kind).toBe("open");

  const queriedTable = resolvedValue(query.table(member(project, "packages/db/src/schema/consumer.ts", 'schema["articles"]')));
  expect(queriedTable.identity.declarationName).toBe("posts");
  const queriedColumn = resolvedValue(query.column(member(project, "packages/db/src/schema/consumer.ts", 'schema["articles"]["userId"]')));
  expect(queriedColumn.identity.key).toContain("#posts.userId");
});

test("derives canonical kit id brands without treating arbitrary type overrides as ids", () => {
  const { query } = queryOf({
    "packages/kit/src/ids/index.ts":
      'declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport type ChatId = TypeIdOf<"chat">;\nexport type UserId = Branded<"UserId">;\n',
    "packages/db/src/schema/x.ts":
      'import type { ChatId, UserId } from "../../../kit/src/ids/index";\n' +
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
      'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>(), ownerId: text("owner_id").$type<UserId>(), note: text("note").$type<string>() });\n',
  });
  const columns = ready(query.schema()).tables[0]?.columns ?? [];

  expect(columns.map(({ identity, typeOverride }) => [identity.propertyName, typeOverride?.idBrand ?? null])).toEqual([
    ["id", '"chat"'],
    ["ownerId", '"UserId"'],
    ["note", null],
  ]);
});

test("selected-file schema facts retain canonical FK identity outside the effective population", () => {
  const project = projectOf({
    "packages/db/src/schema/users.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id").primaryKey() });',
    "packages/db/src/schema/posts.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { users } from "./users.ts";\nexport const posts = sqliteTable("posts", { userId: text("user_id").references(() => users.id) });',
  });
  const selected = project.getSourceFileOrThrow(`${ROOT}packages/db/src/schema/posts.ts`);
  const query = createSchemaQuery({
    files: [selected],
    relativePath: (sourceFile) => sourceFile.getFilePath().slice(ROOT.length),
    checker: () => project.getTypeChecker(),
  });
  const fact = query.schema();
  const model = ready(fact);
  expect(model.tables[0]?.columns[0]?.foreignKey?.parent).toEqual({
    kind: "external-column",
    sourcePath: "packages/db/src/schema/users.ts",
    moduleSpecifier: "./users.ts",
    exportedTable: "users",
    propertyName: "id",
    key: "packages/db/src/schema/users.ts#users.id",
  });
  expect(fact.receipt).toMatchObject({ tables: 1, columns: 1, foreignKeys: 1 });
});

test("selected-file FK identity cannot collide across equal relative import spellings", () => {
  const files: Record<string, string> = {};
  for (const directory of ["a", "b"]) {
    files[`packages/db/src/schema/${directory}/users.ts`] =
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const users = sqliteTable("users", { id: text("id").primaryKey() });';
    files[`packages/db/src/schema/${directory}/posts.ts`] =
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { users } from "./users.ts";\nexport const posts = sqliteTable("posts", { userId: text("user_id").references(() => users.id) });';
  }
  const project = projectOf(files);
  const parentKey = (directory: string): string => {
    const selected = project.getSourceFileOrThrow(`${ROOT}packages/db/src/schema/${directory}/posts.ts`);
    const query = createSchemaQuery({
      files: [selected],
      relativePath: (sourceFile) => sourceFile.getFilePath().slice(ROOT.length),
      checker: () => project.getTypeChecker(),
    });
    const parent = ready(query.schema()).tables[0]?.columns[0]?.foreignKey?.parent;
    if (parent?.kind !== "external-column") {
      throw new Error("expected an external FK target");
    }
    expect(parent.moduleSpecifier).toBe("./users.ts");
    return parent.key;
  };
  const a = parentKey("a");
  const b = parentKey("b");
  expect(a).toBe("packages/db/src/schema/a/users.ts#users.id");
  expect(b).toBe("packages/db/src/schema/b/users.ts#users.id");
  expect(a).not.toBe(b);
});

test("a local shadow with the same spellings is not schema evidence", () => {
  const { query } = queryOf({
    "packages/db/src/schema/fake.ts":
      'const sqliteTable = (...args: unknown[]) => args;\nconst text = (name: string) => name;\nexport const fake = sqliteTable("fake", { id: text("id") });',
  });
  expect(query.schema()).toMatchObject({ status: "empty", receipt: { status: "empty", tables: 0, members: 0 } });
});

test("the schema source boundary admits TS/TSX and refuses MTS/CTS", () => {
  const accepted = queryOf({
    "packages/db/src/schema/x.ts": 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const x = sqliteTable("x", { id: text("id") });',
    "packages/db/src/schema/y.tsx": 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const y = sqliteTable("y", { id: text("id") });',
  }).query.schema();
  expect(ready(accepted).tables).toHaveLength(2);
  expect(accepted.receipt.paths).toEqual(["packages/db/src/schema/x.ts", "packages/db/src/schema/y.tsx"]);

  for (const extension of ["mts", "cts"]) {
    const rejected = queryOf({
      [`packages/db/src/schema/x.${extension}`]:
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const x = sqliteTable("x", { id: text("id") });',
    }).query.schema();
    expect(unresolvedReason(rejected)).toContain(`unsupported non-TS path: packages/db/src/schema/x.${extension}`);
  }
});

test("classifies closed/scalar JSON and a local customType-derived Drizzle column", () => {
  const { query } = queryOf({
    "packages/db/src/custom-types.ts":
      'import { customType } from "drizzle-orm/sqlite-core";\nexport const vector32 = customType<{ data: Float32Array }>({ dataType: () => "F32_BLOB(32)" });',
    "packages/db/src/schema/x.ts": `import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { vector32 } from "../custom-types.ts";
interface Profile { readonly name: string; readonly age: number }
interface Bag { readonly [key: string]: unknown; readonly fixed: string }
export const t = sqliteTable("t", {
  profile: text("profile", { mode: "json" }).$type<Profile>(),
  label: text("label", { mode: "json" }).$type<string>(),
  bag: text("bag", { mode: "json" }).$type<Bag>(),
  embedding: vector32("embedding"),
});`,
  });
  const model = ready(query.schema());
  const columns = model.tables[0]?.columns ?? [];
  expect(columns.find((column) => column.identity.propertyName === "profile")?.json?.shape).toMatchObject({ kind: "closed", keys: ["age", "name"] });
  expect(columns.find((column) => column.identity.propertyName === "label")?.json?.shape).toMatchObject({ kind: "scalar" });
  expect(columns.find((column) => column.identity.propertyName === "bag")?.json?.shape).toMatchObject({ kind: "open" });
  expect(columns.find((column) => column.identity.propertyName === "embedding")?.builder).toMatchObject({
    moduleSpecifier: "drizzle-orm/sqlite-core",
    exportedName: "customType",
  });
});

test("a spread override produces one effective Drizzle column at the final authored site", () => {
  const { query } = queryOf({
    "packages/db/src/schema/x.ts":
      'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst base = { id: text("old_id") };\nexport const t = sqliteTable("t", { ...base, id: text("new_id") });',
  });
  const fact = query.schema();
  const model = ready(fact);
  expect(model.tables[0]?.columns.map((column) => [column.identity.propertyName, column.sqlName])).toEqual([["id", "new_id"]]);
  expect(fact.receipt).toMatchObject({ tables: 1, columns: 1, members: 2 });
});

// A fresh Project PER ROW inside ONE test: the per-TEST default (5 s, contention-blind) is the wrong number
// for a row-scaled sweep, and this row timed out at 5,000 ms in three separate loaded batches while passing
// in under a second alone. `scaledBudget` is the house spelling and grows with the box.
const ROW_SWEEP_TIMEOUT_MS = scaledBudget(60_000);

test(
  "written, cyclic, dynamic, and computed column populations refuse instead of shrinking",
  () => {
    const cases = [
      {
        source:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst columns = { id: text("id") };\ncolumns.id = text("other");\nexport const t = sqliteTable("t", columns);',
        reason: /mutated|assigned|write/u,
      },
      {
        source:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst columns = { id: text("id") };\nObject.assign(columns, { late: text("late") });\nexport const t = sqliteTable("t", columns);',
        reason: /mutated|assigned|write/u,
      },
      {
        source:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst columns = { id: text("id") };\nconst [alias] = [columns];\nObject.assign(alias, { late: text("late") });\nexport const t = sqliteTable("t", columns);',
        reason: /mutated|assigned|write/u,
      },
      {
        source:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst columns = { id: text("id") };\nconst { value: alias } = { value: columns };\nObject.assign(alias, { late: text("late") });\nexport const t = sqliteTable("t", columns);',
        reason: /mutated|assigned|write/u,
      },
      {
        source: 'import { sqliteTable } from "drizzle-orm/sqlite-core";\nconst a = { ...b };\nconst b = { ...a };\nexport const t = sqliteTable("t", a);',
        reason: /cycle/u,
      },
      {
        source: 'import { sqliteTable } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("t", buildColumns());',
        reason: /runtime evaluation|authored object/u,
      },
      {
        source:
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nconst key = getKey();\nexport const t = sqliteTable("t", { [key]: text("id") });',
        reason: /computed schema member|static string|runtime evaluation/u,
      },
    ];
    for (const row of cases) {
      const { query } = queryOf({ "packages/db/src/schema/x.ts": row.source });
      const fact = query.schema();
      expect(unresolvedReason(fact)).toMatch(row.reason);
      expect(fact.receipt.status).toBe("unresolved");
    }
  },
  ROW_SWEEP_TIMEOUT_MS,
);

test("shadowed Object.assign and schema populations outside arg0 remain ready", () => {
  const cases = [
    `import { sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = { id: text("id") };
const Object = { assign: (...args: unknown[]) => args };
Object.assign(columns, { late: text("late") });
export const t = sqliteTable("t", columns);`,
    `import { sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = { id: text("id") };
Object.assign({}, columns);
export const t = sqliteTable("t", columns);`,
  ];
  for (const source of cases) {
    const fact = queryOf({ "packages/db/src/schema/x.ts": source }).query.schema();

    expect(ready(fact).tables[0]?.columns.map((column) => column.identity.propertyName)).toEqual(["id"]);
    expect(fact.receipt).toMatchObject({ status: "ready", tables: 1, columns: 1 });
  }
});

test("invoked members through schema-population aliases refuse instead of shrinking", () => {
  const cases = [
    `import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = { id: text("id") };
const extras = [];
const extrasAlias = extras;
extrasAlias.push(index("t_id_idx").on(columns.id));
export const t = sqliteTable("t", columns, () => extras);`,
    `import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = { id: text("id") };
const extras = [];
const [extrasAlias] = [extras];
extrasAlias.push(index("t_id_idx").on(columns.id));
export const t = sqliteTable("t", columns, () => extras);`,
    `import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = { id: text("id") };
const extras = [];
let extrasAlias;
[extrasAlias] = [extras];
extrasAlias.push(index("t_id_idx").on(columns.id));
export const t = sqliteTable("t", columns, () => extras);`,
  ];
  for (const source of cases) {
    const fact = queryOf({ "packages/db/src/schema/x.ts": source }).query.schema();
    expect(unresolvedReason(fact)).toMatch(/invoked member|authored array|change/u);
    expect(fact.receipt).toMatchObject({ status: "unresolved", tables: 0, columns: 0, indexes: 0 });
  }
});

test("immutable schema populations and unrelated member effects remain ready", () => {
  const { query } = queryOf({
    "packages/db/src/schema/x.ts": `import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
const columns = { id: text("id") };
const extras = [index("t_id_idx").on(columns.id)];
const unrelated = [];
unrelated.push("runtime-only");
export const t = sqliteTable("t", columns, () => extras);`,
  });
  const fact = query.schema();
  expect(ready(fact).tables[0]).toMatchObject({
    columns: [{ identity: { propertyName: "id" } }],
    indexes: [{ kind: "index", name: { kind: "named", value: "t_id_idx" } }],
  });
  expect(fact.receipt).toMatchObject({ status: "ready", tables: 1, columns: 1, indexes: 1, members: 3 });
});

test("a written sqliteTable alias is an unresolved schema candidate, not an empty schema", () => {
  const { query } = queryOf({
    "packages/db/src/schema/x.ts":
      'import { sqliteTable } from "drizzle-orm/sqlite-core";\nlet table = sqliteTable;\ntable = other;\nexport const t = table("t", {});',
  });
  expect(query.schema()).toMatchObject({ status: "unresolved", receipt: { status: "unresolved" } });
});

test("missing and schema-empty populations emit distinct receipts, and unavailable queries stay explicit", () => {
  const emptyProject = projectOf({});
  const missing = createSchemaQuery({ files: [], relativePath: () => "never", checker: () => emptyProject.getTypeChecker() });
  expect(missing.schema()).toMatchObject({ status: "missing", receipt: { status: "missing", paths: [], members: 0 } });
  expect(missing.table(emptyProject.createSourceFile(`${ROOT}probe.ts`, "const x = 1").getVariableDeclarationOrThrow("x").getNameNode())).toMatchObject({
    kind: "unresolved",
    reason: "missing",
  });

  const { project, query } = queryOf({ "packages/db/src/schema/index.ts": 'export const marker = "schema";' });
  expect(query.schema()).toMatchObject({ status: "empty", receipt: { status: "empty", paths: ["packages/db/src/schema/index.ts"], members: 0 } });
  expect(query.column(project.getSourceFileOrThrow(`${ROOT}packages/db/src/schema/index.ts`))).toMatchObject({ kind: "unresolved", reason: "missing" });
});
