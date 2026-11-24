// A value a helper returns takes the sink its caller hands the result to: through a `const` the result initializes, a
// platform list method's result and an `await`. A value handed into a helper's parameter and returned goes back to that
// call alone, so an identity helper's callers keep their own sinks. A result every caller drops stays a finding.
import { expect, test } from "@orb/testkit/tooling";
import type { FieldsReport } from "../../../tooling/src/unwired/index.ts";
import { fieldsScan, libraryModule, NODE_TYPES } from "./_planted.ts";

const LIBRARIES = {
  ...libraryModule(["export interface Logger { info(obj: object, msg?: string): void }"], "pino"),
  ...libraryModule(["export interface Context { json<T>(object: T): unknown }"], "hono"),
  ...NODE_TYPES,
};

// Member names carry a zq prefix so the literal stage of a real-tree scan never matches this file.
const RETURNS = [
  '/// <reference types="node" />',
  'import type { Logger } from "pino";',
  'import type { Context } from "hono";',
  "interface Viewed { readonly zqViewed: string }",
  'function view(value: unknown): unknown { return value === null ? ({ zqViewed: "v" } satisfies Viewed) : value; }',
  "export const report = (log: Logger, value: unknown): void => { log.info({ entry: view(value) }); };",
  "interface Listed { readonly zqListed: string }",
  "const shape = (row: string): unknown => ({ zqListed: row } satisfies Listed);",
  "const sweep = async (rows: readonly string[]): Promise<readonly unknown[]> => rows.map((row) => ({ item: shape(row) }));",
  'export const route = async (c: Context): Promise<unknown> => { const items = await sweep(["a"]); return c.json({ items }); };',
  "interface Made { readonly zqMade: string }",
  'const made = (): unknown => ({ zqMade: "m" } satisfies Made);',
  "export const run = (): void => { made(); };",
  "const pass = (value: unknown): unknown => value;",
  "interface Logged { readonly zqLogged: string }",
  'export const logged = (log: Logger): void => { log.info({ entry: pass({ zqLogged: "l" } satisfies Logged) }); };',
  "interface Lost { readonly zqLost: string }",
  'export const lost = (): void => { pass({ zqLost: "x" } satisfies Lost); };',
].join("\n");

const line = ({ home, member, sent }: FieldsReport["unwired"][number]): string =>
  [`${home}.${member}`, ...sent.map((send) => send.split(" ").toSpliced(1, 1).join(" "))].join(" ");

test("a returned value takes its caller's sink, back to its own call, and a dropped result stays a finding", { timeout: 120_000 }, async ({ plantedTree }) => {
  const report = await fieldsScan(plantedTree, { ...LIBRARIES, "packages/a/src/returns.ts": RETURNS });
  expect(report.observed.map(line).toSorted()).toEqual(["Logged.zqLogged log pino", "Viewed.zqViewed log pino"]);
  expect(report.unwired.map(line).toSorted()).toEqual(["Listed.zqListed http", "Lost.zqLost", "Made.zqMade"]);
});
