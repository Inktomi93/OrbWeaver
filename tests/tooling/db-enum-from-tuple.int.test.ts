// Self-test for the DORMANT `db-enum-from-tuple` gate (scripts/check/gates/db-enum-from-tuple.ts — D34
// db enum derives from a contracts tuple; held out of ALL_CHECKS pending doc reconciliation). Proves: an
// inline array-literal enum config fires, an imported-identifier config passes, and a local
// `as const satisfies` tuple identifier passes (the sanctioned db idiom).
import { Project } from "ts-morph";
import { dbEnumFromTuple } from "../../scripts/check/gates/db-enum-from-tuple.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

const SCHEMA = "packages/db/src/schema/thing.ts";

function ctxFor(files: Record<string, string>, root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${path}`, text);
  }
  return { root, project };
}

test("fires on an inline array-literal enum config", () => {
  const src = 'export const t = sqliteTable("x", { role: text("role", { enum: ["a", "b"] }) });\n';
  const v = dbEnumFromTuple.run(ctxFor({ [SCHEMA]: src }));
  expect(v).toHaveLength(1);
  expect(v[0]?.message).toContain("D34");
});

test("passes an imported-identifier enum config", () => {
  const src = 'export const t = sqliteTable("x", { role: text("role", { enum: ROLES }) });\n';
  expect(dbEnumFromTuple.run(ctxFor({ [SCHEMA]: src }))).toEqual([]);
});

test("passes a local `as const satisfies` tuple identifier (the sanctioned idiom)", () => {
  const src =
    'const KINDS = ["text", "reasoning"] as const satisfies readonly string[];\n' +
    'export const t = sqliteTable("x", { kind: text("kind", { enum: KINDS }) });\n';
  expect(dbEnumFromTuple.run(ctxFor({ [SCHEMA]: src }))).toEqual([]);
});

test("scoped to the schema dir (a non-schema inline enum does not fire)", () => {
  const src = 'export const t = sqliteTable("x", { role: text("role", { enum: ["a", "b"] }) });\n';
  expect(dbEnumFromTuple.run(ctxFor({ "packages/server/src/x.ts": src }))).toEqual([]);
});
