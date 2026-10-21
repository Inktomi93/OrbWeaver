// Exercise the effective native identity-root and vector-substrate boundaries through the real flat config.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "../..");
// The first effective-config read loads the whole flat config.
const CONFIG_TIMEOUT = { timeout: scaledBudget(120_000) };
const eslint = new ESLint({ cwd: ROOT });
const USERS = "orb/no-direct-users-read";
const USERS_REEXPORT = "orb/no-direct-users-read-reexport";
const VECTOR = "orb/vector-scope-derived";
const VECTOR_REEXPORT = "orb/vector-scope-derived-reexport";
const VECTOR_WRITE = "orb/vector-scope-derived-write";
const VECTOR_COSINE = "orb/vector-scope-derived-cosine";
const RULES = [USERS, USERS_REEXPORT, VECTOR, VECTOR_REEXPORT, VECTOR_WRITE, VECTOR_COSINE] as const;
type Rule = (typeof RULES)[number];
type Row = readonly [path: string, source: string, expected: Partial<Record<Rule, number>>];
const VECTOR_TABLES = ["characterEmbeddings", "imageEmbeddings", "chatDigests", "chatSegments", "chatDigestSpeakers", "documentChunks"] as const;

async function counts(path: string, source: string): Promise<Record<Rule, number>> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  expect(config, path).toBeDefined();
  const rules = Object.fromEntries(RULES.flatMap((rule) => (config.rules[rule] === undefined ? [] : [[rule, config.rules[rule]]])));
  const messages = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      plugins: config.plugins,
      rules,
    },
    { filename: path },
  );
  expect(
    messages.filter(({ fatal }) => fatal),
    source,
  ).toEqual([]);
  return Object.fromEntries(RULES.map((rule) => [rule, messages.filter((message) => message.ruleId === rule).length])) as Record<Rule, number>;
}

/** Each row's counts beside its expected counts, over `focus` (every rule unless named), for one assertion. */
async function verdicts(rows: readonly Row[], focus: readonly Rule[] = RULES): Promise<{ actual: unknown[]; expected: unknown[] }> {
  const actual: unknown[] = [];
  for (const [path, source] of rows) {
    const found = await counts(path, source);
    actual.push({ path, source, counts: Object.fromEntries(focus.map((rule) => [rule, found[rule]])) });
  }
  const expected = rows.map(([path, source, want]) => ({ path, source, counts: Object.fromEntries(focus.map((rule) => [rule, want[rule] ?? 0])) }));
  return { actual, expected };
}

// Each row is one of the retired gate's own descriptor rows, with the native verdict of every rule.
const USERS_SCHEMA = "../../../../db/src/schema/users.ts";
const USERS_GATE_ROWS: readonly Row[] = [
  ["packages/server/src/entry/boot/identity.ts", `import { users } from "${USERS_SCHEMA}";\nexport const identity = users;\n`, { [USERS]: 1 }],
  ["packages/server/src/entry/compose/identity.ts", `import { users as root } from "${USERS_SCHEMA}";\nexport const identity = root;\n`, { [USERS]: 1 }],
  [
    "packages/server/src/entry/auth/identity.ts",
    `import * as schema from "${USERS_SCHEMA}";\nexport const identity = schema["users"];\n`,
    { [USERS]: 1, [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  ["packages/server/src/domain/billing/x.ts", `import { users } from "${USERS_SCHEMA}";\nexport const u = users;\n`, { [USERS]: 1 }],
  ["packages/server/src/domain/billing/barrel.ts", 'import { users } from "../../../../db/src/index.ts";\nexport const u = users;\n', { [USERS]: 1 }],
  [
    "packages/server/src/domain/billing/ns.ts",
    `import * as schema from "${USERS_SCHEMA}";\nexport const u = schema.users;\n`,
    { [USERS]: 1, [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/domain/billing/bracket.ts",
    `import * as schema from "${USERS_SCHEMA}";\nexport const u = schema["users"];\n`,
    { [USERS]: 1, [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/domain/billing/twice.ts",
    `import { users } from "${USERS_SCHEMA}";\nexport const a = users;\nexport const b = users;\n`,
    { [USERS]: 1 },
  ],
  ["packages/server/src/domain/billing/unreadable.ts", 'import { users } from "./missing-barrel.ts";\nexport const u = users;\n', { [USERS]: 1 }],
  ["packages/server/src/entry/boot/secrets.ts", `import { sessions } from "${USERS_SCHEMA}";\nexport const dependency = sessions;\n`, {}],
  ["packages/server/src/domain/billing/y.ts", `import { messages } from "${USERS_SCHEMA}";\nexport const m = messages;\n`, {}],
  ["packages/server/src/domain/billing/local.ts", "const schema = { users: 1 };\nexport const u = schema.users;\n", {}],
  // The retired gate acquitted a same-named export of another module; the name-based door refuses it.
  ["packages/server/src/domain/billing/import-foreign.ts", 'import { users } from "./foreign.ts";\nexport const u = users;\n', { [USERS]: 1 }],
  ["packages/server/src/domain/billing/foreign.ts", "export const users = { name: 'not the table' };\nexport const u = users;\n", {}],
  ["packages/server/src/domain/billing/renamed.ts", 'import { identityRoot } from "../../../../db/src/barrel.ts";\nexport const u = identityRoot;\n', {}],
];

test("the retired no-direct-users-read descriptor rows hold through the native rules", CONFIG_TIMEOUT, async () => {
  const { actual, expected } = await verdicts(USERS_GATE_ROWS);
  expect(actual).toEqual(expected);
});

test("only sessions and admin name the users identity root, through any import door", CONFIG_TIMEOUT, async () => {
  const rows: Row[] = [];
  for (const path of [
    "packages/server/src/domain/billing/x.ts",
    "packages/server/src/domain/chat/persistence/x.ts",
    "packages/server/src/entry/boot/identity.ts",
    "packages/server/src/entry/compose/identity.ts",
    "packages/server/src/entry/auth/identity.tsx",
    "packages/server/src/domain/billing/probe.gen.ts",
  ]) {
    for (const source of [
      'import { users } from "@orb/db";\nexport const u = users;',
      'import { users as root } from "@orb/db";\nexport const u = root;',
      'import type { users } from "@orb/db";\nexport type U = typeof users;',
      'import { "users" as root } from "@orb/db";\nexport const u = root;',
      'import { users } from "@orb/db/schema";\nexport const u = users;',
      'import { users } from "./foreign.ts";\nexport const u = users;',
      'import * as schema from "@orb/db";\nexport const u = schema.users;',
      'export const load = async () => (await import("@orb/db")).users;',
      'export const load = async () => (await import("../../../../db/src/schema/users.ts")).users;',
      'export * from "@orb/db";',
      'export * as schema from "@orb/db";',
      'export * from "../../../../db/src/schema/users.ts";',
      'export { users } from "@orb/db";',
      'export { users as identityRoot } from "@orb/db";',
    ]) {
      rows.push([path, source, { [USERS]: 1 }]);
    }
    rows.push([path, 'import { users } from "@orb/db";\nexport { users };', { [USERS]: 2 }]);
    for (const source of [
      'import { sessions } from "@orb/db";\nexport const dependency = sessions;',
      'import { DATA_LAYOUT_DIRS } from "#foundation/data-layout";\nexport const dir = DATA_LAYOUT_DIRS.users;',
      "// users is read only by sessions and admin\nexport const note = 'users';",
    ]) {
      rows.push([path, source, {}]);
    }
  }
  for (const path of [
    "packages/server/src/domain/sessions/persistence/users.ts",
    "packages/server/src/domain/sessions/verbs/validate.ts",
    "packages/server/src/domain/admin/verbs/set-role.ts",
    "packages/server/src/domain/admin/persistence/queries.ts",
    "packages/server/src/foundation/observability/debug/inspect/stats.ts",
    "packages/server/src/transport/trpc/probe.ts",
    "tests/server/domain/admin/probe.int.test.ts",
  ]) {
    rows.push([path, 'import { users } from "@orb/db";\nexport const u = users;', {}]);
  }
  const { actual, expected } = await verdicts(rows, [USERS]);
  expect(actual).toEqual(expected);
});

test("no server module re-exports the identity root, including its two owning domains", CONFIG_TIMEOUT, async () => {
  const rows: Row[] = [];
  for (const path of [
    "packages/server/src/domain/sessions/index.ts",
    "packages/server/src/domain/admin/persistence/queries.ts",
    "packages/server/src/domain/billing/x.ts",
    "packages/server/src/foundation/observability/debug/inspect/stats.ts",
  ]) {
    for (const source of [
      'export { users } from "@orb/db";',
      'import { users } from "@orb/db";\nexport { users as identityRoot };',
      'export * from "@orb/db";',
      'export * from "../../../db/src/schema/users.ts";',
    ]) {
      rows.push([path, source, { [USERS_REEXPORT]: 1 }]);
    }
    rows.push([path, 'import { users } from "@orb/db";\nexport const u = users;', {}]);
  }
  rows.push(["tests/server/domain/admin/probe.int.test.ts", 'export { users } from "@orb/db";', {}]);
  const { actual, expected } = await verdicts(rows, [USERS_REEXPORT]);
  expect(actual).toEqual(expected);
});

const VECTOR_SCHEMA = "../../../../db/src/schema/embeddings.ts";
const HOME_SCHEMA = "../../../../../db/src/schema/embeddings.ts";
const VECTOR_GATE_ROWS: readonly Row[] = [
  // Outside embeddings persistence a rebound table also reds the write rule: a renamed binding escapes the write position.
  [
    "packages/server/src/domain/hub/x.ts",
    `import { chatDigests } from "${VECTOR_SCHEMA}";\nexport const t = chatDigests;\n`,
    { [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/domain/hub/namespace-write.ts",
    `import * as schema from "${VECTOR_SCHEMA}";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(schema.chatDigests);\n`,
    { [USERS]: 1, [VECTOR]: 1, [VECTOR_WRITE]: 2 },
  ],
  [
    "packages/server/src/domain/hub/bracket-write.ts",
    `import * as schema from "${VECTOR_SCHEMA}";\nexport const w = (db: Record<string, (t: unknown) => void>): void => db["insert"](schema["chatDigests"]);\n`,
    { [USERS]: 1, [VECTOR]: 1, [VECTOR_WRITE]: 2 },
  ],
  [
    "packages/server/src/domain/search/persistence/aliased-write.ts",
    `import { chatDigests as table } from "${HOME_SCHEMA}";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(table);\n`,
    { [VECTOR_WRITE]: 1 },
  ],
  // The retired gate admitted the home's re-export and refused only its importer; both are refused now.
  ["packages/server/src/domain/embeddings/persistence/reexport.ts", `export { chatDigests } from "${HOME_SCHEMA}";\n`, { [VECTOR_REEXPORT]: 1 }],
  [
    "packages/server/src/domain/hub/via-reexport.ts",
    'import { chatDigests } from "../embeddings/persistence/reexport.ts";\nexport const t = chatDigests;\n',
    { [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  ["packages/server/src/domain/hub/y.ts", 'export const q = "SELECT vector_distance_cos(a, b)";\n', { [VECTOR_COSINE]: 1 }],
  [
    "packages/server/src/domain/hub/unreadable.ts",
    'import { chatDigests } from "./missing.ts";\nexport const t = chatDigests;\n',
    { [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/domain/hub/bracket-cosine.ts",
    'export const q = (db: Record<string, (a: unknown, b: unknown) => unknown>): unknown => db["vector_distance_cos"](1, 2);\n',
    { [VECTOR_COSINE]: 1 },
  ],
  [
    "packages/server/src/domain/search/persistence/unreadable-write.ts",
    'import { chatDigests } from "./missing.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatDigests);\n',
    { [VECTOR_WRITE]: 1 },
  ],
  ["packages/server/src/domain/hub/local-bag.ts", "const bag = { chatDigests: 1 };\nexport const n = bag.chatDigests;\n", {}],
  [
    "packages/server/src/domain/embeddings/persistence/store.ts",
    `import { chatDigests } from "${HOME_SCHEMA}";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatDigests);\n`,
    {},
  ],
  [
    "packages/server/src/domain/embeddings/persistence/aliased-store.ts",
    `import { chatDigests as table } from "${HOME_SCHEMA}";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(table);\n`,
    {},
  ],
  ["packages/server/src/domain/hub/lib/local-digests.ts", 'export const chatDigests = { label: "an in-RAM digest cache" };\n', {}],
  // The retired gate acquitted a same-named export of another module; the name-based door refuses it.
  [
    "packages/server/src/domain/hub/foreign.ts",
    'import { chatDigests } from "./lib/local-digests.ts";\nexport const t = chatDigests;\n',
    { [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  ["packages/server/src/domain/search/persistence/cosine.ts", 'export const q = "SELECT vector_distance_cos(a, b)";\n', {}],
  ["packages/server/src/domain/hub/z.ts", "// vector_distance_cos is search's — cited in a comment\nexport const x = 1;\n", {}],
  // The retired positioned waiver is not honoured; a reviewed site states its reason in the native directive.
  [
    "packages/server/src/domain/hub/waived.ts",
    `// @orb-waive vector-scope-derived(chatDigests): a one-off migration read.\nimport { chatDigests } from "${VECTOR_SCHEMA}";\nexport const t = chatDigests;\n`,
    { [VECTOR]: 1, [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/domain/hub/disabled.ts",
    `// eslint-disable-next-line orb/vector-scope-derived -- a one-off migration read\nimport { chatDigests } from "${VECTOR_SCHEMA}";\nexport const column = chatDigests.id;\n`,
    {},
  ],
  [
    "packages/server/src/domain/chat/memory/persistence/digests.ts",
    'import { chatDigests } from "../../../../../../db/src/schema/embeddings.ts";\nexport const t = chatDigests;\n',
    { [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/domain/discovery/persistence/near-duplicates.ts",
    `import { chatDigests } from "${HOME_SCHEMA}";\nexport const t = chatDigests;\n`,
    { [VECTOR_WRITE]: 1 },
  ],
  [
    "packages/server/src/foundation/observability/debug/vectors.ts",
    `import { chatDigests } from "${HOME_SCHEMA}";\nexport const t = chatDigests;\n`,
    { [VECTOR_WRITE]: 1 },
  ],
  // The import homes name the table without rebinding it.
  [
    "packages/server/src/domain/chat/memory/persistence/digest-ids.ts",
    'import { chatDigests } from "../../../../../../db/src/schema/embeddings.ts";\nexport const column = chatDigests.id;\n',
    {},
  ],
  [
    "packages/server/src/domain/discovery/persistence/digest-ids.ts",
    `import { chatDigests } from "${HOME_SCHEMA}";\nexport const column = chatDigests.id;\n`,
    {},
  ],
  [
    "packages/server/src/foundation/observability/debug/digest-ids.ts",
    `import { chatDigests } from "${HOME_SCHEMA}";\nexport const column = chatDigests.id;\n`,
    {},
  ],
  [
    "packages/server/src/domain/search/persistence/upsert.ts",
    `import { chatDigests } from "${HOME_SCHEMA}";\nexport const w = (db: { upsert: (t: unknown) => void }): void => db.upsert(chatDigests);\n`,
    {},
  ],
  [
    "packages/server/src/domain/search/persistence/unreadable-other.ts",
    'import { chatSummaries } from "./missing.ts";\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatSummaries);\n',
    {},
  ],
  // The retired gate acquitted a local const spelled like a table; the name-based write position refuses it.
  [
    "packages/server/src/domain/search/persistence/local-table.ts",
    "const chatDigests = { rows: [] as readonly unknown[] };\nexport const w = (db: { insert: (t: unknown) => void }): void => db.insert(chatDigests);\n",
    { [VECTOR_WRITE]: 1 },
  ],
];

test("the retired vector-scope-derived descriptor rows hold through the native rules", CONFIG_TIMEOUT, async () => {
  const { actual, expected } = await verdicts(VECTOR_GATE_ROWS);
  expect(actual).toEqual(expected);
});

test("a vector table is named only by its import-role roots, through any import door", CONFIG_TIMEOUT, async () => {
  const rows: Row[] = [];
  for (const path of [
    "packages/server/src/domain/hub/x.ts",
    "packages/server/src/domain/search/verbs/x.ts",
    "packages/server/src/domain/chat/memory/x.ts",
    "packages/server/src/transport/trpc/x.ts",
    "packages/server/src/entry/compose/x.ts",
    "packages/server/src/domain/hub/probe.gen.ts",
  ]) {
    for (const table of VECTOR_TABLES) {
      for (const source of [
        `import { ${table} } from "@orb/db";\nexport const t = ${table};`,
        `import { ${table} as t } from "@orb/db";\nexport const x = t;`,
        `import type { ${table} } from "@orb/db";\nexport type T = typeof ${table};`,
        `import { "${table}" as t } from "@orb/db";\nexport const x = t;`,
        `import { ${table} } from "./missing.ts";\nexport const t = ${table};`,
        `import { ${table} } from "../embeddings/persistence/reexport.ts";\nexport const t = ${table};`,
      ]) {
        rows.push([path, source, { [VECTOR]: 1 }]);
      }
      for (const source of [`export { ${table} } from "@orb/db";`, `export { ${table} as renamed } from "../embeddings/persistence/reexport.ts";`]) {
        rows.push([path, source, { [VECTOR]: 1, [VECTOR_REEXPORT]: 1 }]);
      }
    }
    for (const source of [
      'import * as schema from "@orb/db";\nexport const t = schema.chatDigests;',
      'import * as schema from "@orb/db";\nexport const t = schema["chatDigests"];',
      'export const load = async () => (await import("@orb/db")).chatDigests;',
    ]) {
      rows.push([path, source, { [VECTOR]: 1 }]);
    }
    for (const source of [
      "const bag = { chatDigests: 1 };\nexport const n = bag.chatDigests;",
      'import { chatSummaries } from "@orb/db";\nexport const t = chatSummaries;',
      'import { embedGenerations } from "@orb/db";\nexport const t = embedGenerations;',
    ]) {
      rows.push([path, source, {}]);
    }
  }
  for (const path of [
    "packages/server/src/domain/embeddings/persistence/queries.ts",
    "packages/server/src/domain/embeddings/verbs/x.ts",
    "packages/server/src/domain/search/persistence/nearest.ts",
    "packages/server/src/domain/chat/memory/persistence/digests.ts",
    "packages/server/src/domain/discovery/persistence/near-duplicates.ts",
    "packages/server/src/foundation/observability/debug/vectors.ts",
    "packages/client/src/features/probe.ts",
    "tests/server/domain/search/probe.int.test.ts",
  ]) {
    rows.push([path, 'import { chatDigests } from "@orb/db";\nexport const t = chatDigests;', {}]);
  }
  for (const path of ["packages/server/src/domain/embeddings/index.ts", "packages/server/src/domain/search/persistence/nearest.ts"]) {
    rows.push([path, 'export { chatDigests } from "@orb/db";', { [VECTOR_REEXPORT]: 1 }]);
    rows.push([path, 'export * from "@orb/db";', { [VECTOR_REEXPORT]: 1 }]);
  }
  const { actual, expected } = await verdicts(rows, [VECTOR, VECTOR_REEXPORT]);
  expect(actual).toEqual(expected);
});

test("only embeddings persistence writes a vector table, whatever the receiver or binding spelling", CONFIG_TIMEOUT, async () => {
  const rows: Row[] = [];
  for (const path of [
    "packages/server/src/domain/hub/x.ts",
    "packages/server/src/domain/search/persistence/x.ts",
    "packages/server/src/domain/chat/memory/persistence/x.ts",
    "packages/server/src/domain/discovery/persistence/x.ts",
    "packages/server/src/foundation/observability/debug/x.ts",
    "packages/server/src/domain/embeddings/verbs/x.ts",
  ]) {
    for (const table of VECTOR_TABLES) {
      for (const source of [
        `export const w = (db: D) => db.insert(${table});`,
        `export const w = (tx: D) => tx.update(${table}).set({});`,
        `export const w = (ctx: C) => ctx.db.delete(${table});`,
        `export const w = (db: D) => db?.insert(${table});`,
        `export const w = (db: D) => db["insert"](${table});`,
        `const KEY = "insert";\nexport const w = (db: D) => db[KEY](${table});`,
        `export const w = (db: D) => db.insert(schema.${table});`,
        `export const w = (db: D) => db["delete"](schema["${table}"]);`,
        `export const w = (db: D) => db.insert(${table} as never);`,
        `import { ${table} as table } from "@orb/db";\nexport const w = (db: D) => db.insert(table);`,
        `export const table = ${table};`,
        `export const table = ${table} as never;`,
        `let table: unknown;\ntable = ${table};`,
      ]) {
        rows.push([path, source, { [VECTOR_WRITE]: 1 }]);
      }
    }
    for (const source of [
      'import * as schema from "@orb/db";\nexport const t = schema;',
      'export const load = async () => await import("@orb/db");',
      'export * from "../../../../db/src/schema/embeddings.ts";',
    ]) {
      rows.push([path, source, { [VECTOR_WRITE]: 1 }]);
    }
    for (const source of [
      "export const w = (db: D) => db.upsert(chatDigests);",
      "export const w = (db: D) => db.insert(chatSummaries);",
      "export const r = (db: D) => db.select().from(chatDigests);",
      "export const r = (db: D) => db.select().from(chatDigests).innerJoin(chatSegments, on);",
      'import { chatDigests } from "@orb/db";\nexport const r = (db: D) => db.select({ id: chatDigests.id }).from(chatDigests);',
    ]) {
      rows.push([path, source, {}]);
    }
  }
  for (const path of ["packages/server/src/domain/embeddings/persistence/queries.ts", "packages/inference/src/probe.ts"]) {
    rows.push([path, 'import { chatDigests as table } from "@orb/db";\nexport const w = (db: D) => db.insert(table).values(chatDigests);', {}]);
  }
  const { actual, expected } = await verdicts(rows, [VECTOR_WRITE]);
  expect(actual).toEqual(expected);
});

test("top-k cosine SQL is spelled only in search persistence", CONFIG_TIMEOUT, async () => {
  const rows: Row[] = [];
  for (const path of [
    "packages/server/src/domain/hub/y.ts",
    "packages/server/src/domain/discovery/persistence/near-duplicates.ts",
    "packages/server/src/domain/embeddings/persistence/queries.ts",
    "packages/server/src/domain/hub/probe.gen.ts",
  ]) {
    for (const source of [
      'export const q = "SELECT vector_distance_cos(a, b)";',
      "export const q = `SELECT vector_distance_cos(a, b)`;",
      "export const q = (b: string) => sql`SELECT vector_distance_cos(embedding, ${b})`;",
      "export const q = (a: string, b: string) => sql`SELECT ${a} ORDER BY vector_distance_cos(embedding, ${b}) LIMIT 1`;",
      'export const q = (db: Record<string, (a: unknown, b: unknown) => unknown>) => db["vector_distance_cos"](1, 2);',
    ]) {
      rows.push([path, source, { [VECTOR_COSINE]: 1 }]);
    }
    rows.push([path, "// vector_distance_cos is search's — cited in a comment\nexport const x = 1;", {}]);
  }
  for (const path of ["packages/server/src/domain/search/persistence/nearest.ts", "packages/client/src/features/probe.ts"]) {
    rows.push([path, 'export const q = "SELECT vector_distance_cos(a, b)";', {}]);
  }
  const { actual, expected } = await verdicts(rows, [VECTOR_COSINE]);
  expect(actual).toEqual(expected);
});
