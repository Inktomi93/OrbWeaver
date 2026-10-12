// `drizzleWriteOf` is the one reader of "which drizzle write does this call make": the table comes from the chain's
// `insert`/`update` verb, and a verb counts only when drizzle-orm declares it. Both directions are planted: a builder
// hoisted into a local and a factory that returns one are writes, a same-named method on any other object is not, and
// a receiver the checker cannot bind is no write rather than a guess.
import type { CallExpression } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { DrizzleWrite } from "../../../../tooling/src/floor/code-facts/drizzle-columns.ts";
import { drizzleWriteOf, writeKeysOf } from "../../../../tooling/src/floor/code-facts/drizzle-columns.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const DRIZZLE_SOURCE =
  "export declare class Builder {\n  set(value: object): Builder;\n  values(value: object): Builder;\n  where(condition: unknown): Builder;\n" +
  "  onConflictDoUpdate(config: object): Builder;\n}\n" +
  "export declare class Db {\n  insert(table: unknown): Builder;\n  update(table: unknown): Builder;\n}\n";
const PRELUDE = 'import type { Db } from "drizzle-orm";\nimport { plugins } from "./schema.ts";\ndeclare const db: Db;\n';

function callsOf(use: string): readonly CallExpression[] {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("/repo/node_modules/drizzle-orm/index.ts", DRIZZLE_SOURCE);
  project.createSourceFile("/repo/schema.ts", "export const plugins = { name: 'plugins' };\n");
  return project.createSourceFile("/repo/use.ts", `${PRELUDE}${use}`).getDescendantsOfKind(SyntaxKind.CallExpression);
}

/** Every drizzle write the fixture's calls make, in source order. */
function writesIn(use: string): readonly DrizzleWrite[] {
  return callsOf(use).flatMap((call) => drizzleWriteOf(call) ?? []);
}

test("a chained write names its table and the columns of its argument", () => {
  const writes = writesIn("db.update(plugins).set({ name: 'x', enabled: true }).where(cond);\n");

  expect(writes.map((write) => [write.method, write.target.getText(), writeKeysOf(write).names])).toEqual([["set", "plugins", ["name", "enabled"]]]);
});

test("a write through a builder hoisted into a local still names its table", () => {
  const writes = writesIn("const q = db.update(plugins);\nq.set({ name: 'x' });\n");

  expect(writes.map((write) => [write.method, write.target.getText(), writeKeysOf(write).names])).toEqual([["set", "plugins", ["name"]]]);
});

test("a write through a factory that returns the builder still names its table", () => {
  const writes = writesIn("function makeInsert() {\n  return db.insert(plugins);\n}\nmakeInsert().values({ name: 'x' });\n");

  expect(writes.map((write) => [write.method, write.target.getText()])).toEqual([["values", "plugins"]]);
});

test("an upsert reads the columns of its `set` config", () => {
  const writes = writesIn("db.insert(plugins).values({ name: 'x' }).onConflictDoUpdate({ target: plugins, set: { enabled: false } });\n");

  expect(writes.map((write) => [write.method, writeKeysOf(write).names])).toEqual([
    ["onConflictDoUpdate", ["enabled"]],
    ["values", ["name"]],
  ]);
});

test("`update` and `set` on objects drizzle does not declare are no write", () => {
  const writes = writesIn(
    "declare const store: { update(table: unknown): { set(value: object): void } };\n" +
      "store.update(plugins).set({ name: 'x' });\n" +
      "const cache = new Map<string, number>();\ncache.set('k', 1);\n",
  );

  expect(writes).toEqual([]);
});

test("a receiver whose type the checker cannot bind is no write, not a guess", () => {
  const writes = writesIn("declare const unbound: Mystery;\nunbound.update(plugins).set({ name: 'x' });\n");

  expect(writes).toEqual([]);
});
