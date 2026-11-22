// graph-worlds-check proves the merged program against each world's own: two planted worlds map one alias to two
// targets, so the merged program, where the first world keeps the alias, resolves the second world's import elsewhere.
// Each merged-program error is matched in a world, explained, or left unexplained, and an unexplained one fails the run.
import { join } from "node:path";
import type { CliResult, ToolFixtures } from "@orb/testkit/tooling";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { LIB } from "./_planted.ts";

const ALIAS = "@shared/*";
const WORLD_A = "packages/a/tsconfig.json";
const WORLD_B = "packages/b/tsconfig.json";
const DOM_LIB = "/lib.dom.d.ts";

// A planted package config: the shared fixture options with the alias, and any option the case loosens.
const world = (overrides: Readonly<Record<string, boolean>> = {}): string => {
  const config = JSON.parse(plantedTsconfig({ lib: LIB, paths: { [ALIAS]: ["./shared/*"] } })) as { readonly compilerOptions: object };
  return JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, ...overrides } });
};

// The merged program's base adds the DOM lib, as the browser world's does. World a keeps the alias, so world b's
// `@shared/thing` resolves to a's file in the merged program; a's globals reach b's files there.
const TREE: Readonly<Record<string, string>> = {
  "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: "packages/b" }] }),
  "tsconfig.world-browser.json": plantedTsconfig({ lib: [...LIB, "DOM"], include: [] }),
  [WORLD_A]: world(),
  "packages/a/shared/thing.ts": "export interface Thing { readonly a: string }",
  "packages/a/src/use.ts": ['import type { Thing } from "@shared/thing";', 'export const one: Thing = { a: "x" };'].join("\n"),
  "packages/a/src/bad.ts": 'export const wrong: number = "x";',
  "packages/a/src/augment.ts": ["declare global {", "  interface Box { readonly extra: string }", "  var counter: string;", "}", "export {};"].join("\n"),
  [WORLD_B]: world({ noImplicitAny: false }),
  "packages/b/shared/thing.ts": ["export interface Thing { readonly b: number }", "export const bOnly = 1;"].join("\n"),
  "packages/b/src/use.ts": ['import type { Thing } from "@shared/thing";', "export const two: Thing = { b: 1 };"].join("\n"),
  "packages/b/src/meta.ts": "export interface Meta extends ImportMeta {}",
  "packages/b/src/loose.ts": "export const echo = function (value) { return value; };",
  "packages/b/src/box.ts": ["declare global {", "  interface Box { readonly size: number }", "}", "export const box: Box = { size: 1 };"].join("\n"),
  // the import is used by another statement than the error's, so its resolution explains nothing here
  "packages/b/src/counter.ts": [
    'import type { Thing } from "@shared/thing";',
    "export type T = Thing;",
    "export const total: number = globalThis.counter;",
  ].join("\n"),
  "packages/b/src/only.ts": ['import { bOnly } from "@shared/thing";', "export const kept = bOnly;"].join("\n"),
  "packages/b/src/local.ts": ["const take = (value: number): number => value;", "const local = globalThis.counter;", "export const taken = take(local);"].join(
    "\n",
  ),
  // import.meta gains DOM's members in the merged program, so the argument stops fitting
  "packages/b/src/meta-arg.ts": [
    "const take = (meta: { readonly url?: number }): number => meta.url ?? 0;",
    "const meta = import.meta;",
    "export const took = take(meta);",
  ].join("\n"),
  "packages/b/src/headers.ts": ["declare global {", "  type HeadersInit = string;", "}", "export {};"].join("\n"),
  "packages/b/src/pick.ts": ['import type { Thing } from "@shared/thing";', "export const pick = (thing: Thing): string => thing.a;"].join("\n"),
};

interface Checked {
  readonly run: CliResult;
  readonly lines: readonly string[];
  readonly summary: string;
}

async function check({ plantedTree, runCli }: Pick<ToolFixtures, "plantedTree" | "runCli">): Promise<Checked> {
  const root = await plantedTree({ ...TREE });
  const run = await runCli("unwired", ["graph-worlds-check", `--root=${root}`, `--out=${join(root, "worlds-check.json")}`]);
  return {
    run,
    lines: run.stdout.split("\n").filter((line) => line !== ""),
    summary: run.stderr.split("\n").find((line) => line.startsWith("merged-errors=")) ?? "",
  };
}

// A field naming the DOM lib, wherever the compiler's own libs are installed, reads as <dom>.
const domLib = (line: string): string =>
  line
    .split("\t")
    .map((field) =>
      field
        .split(" ")
        .map((word) => (word.includes(DOM_LIB) ? "<dom>" : word))
        .join(" "),
    )
    .join("\t");

const rowsOf = (lines: readonly string[], config: string): readonly string[] =>
  lines.filter((line) => line.startsWith(`difference\t${config}\t`)).map((line) => line.slice(`difference\t${config}\t`.length));

test("graph-worlds-check lists each world's differences at file:line, an alias resolved elsewhere included", { timeout: 240_000 }, async ({
  plantedTree,
  runCli,
}) => {
  const { lines } = await check({ plantedTree, runCli });
  // world a keeps the alias, so none of its imports resolves elsewhere; the DOM lib is one row for its package
  expect(rowsOf(lines, WORLD_A).map(domLib)).toEqual([
    "library-only-in-merged\t(default library)\t1 files",
    'option\tpackages/a/tsconfig.json\tlib\tworld: ["lib.esnext.d.ts"]\tmerged: ["lib.esnext.d.ts","lib.dom.d.ts"]',
    "member-only-in-merged\tpackages/a/src/augment.ts:2\tBox.size\tworld: \tmerged: number\tunproven packages/b/src/box.ts",
  ]);
  expect(rowsOf(lines, WORLD_B).map(domLib)).toEqual([
    "library-only-in-merged\t(default library)\t1 files",
    "file-only-in-world\tpackages/b/shared/thing.ts\tpackages/b/shared/thing.ts\tworld: packages/b/shared/thing.ts\tmerged: ",
    'option\tpackages/b/tsconfig.json\tlib\tworld: ["lib.esnext.d.ts"]\tmerged: ["lib.esnext.d.ts","lib.dom.d.ts"]',
    "option\tpackages/b/tsconfig.json\tnoImplicitAny\tworld: false\tmerged: ",
    "resolution\tpackages/b/src/counter.ts:1\t@shared/thing\tworld: packages/b/shared/thing.ts\tmerged: packages/a/shared/thing.ts",
    "resolution\tpackages/b/src/only.ts:1\t@shared/thing\tworld: packages/b/shared/thing.ts\tmerged: packages/a/shared/thing.ts",
    "resolution\tpackages/b/src/pick.ts:1\t@shared/thing\tworld: packages/b/shared/thing.ts\tmerged: packages/a/shared/thing.ts",
    "resolution\tpackages/b/src/use.ts:1\t@shared/thing\tworld: packages/b/shared/thing.ts\tmerged: packages/a/shared/thing.ts",
    "member-only-in-merged\tpackages/b/src/box.ts:2\tBox.extra\tworld: \tmerged: string\tunproven packages/a/src/augment.ts",
    "member-only-in-merged\tpackages/b/src/counter.ts:2\tT.a\tworld: \tmerged: string\tunproven packages/a/shared/thing.ts",
    "member-only-in-world\tpackages/b/src/counter.ts:2\tT.b\tworld: number\tmerged: \tunproven",
    "member-only-in-merged\tpackages/b/src/meta.ts:1\tMeta.resolve\tworld: \tmerged: (specifier: string) => string\tlib-merge <dom>",
    "member-only-in-merged\tpackages/b/src/meta.ts:1\tMeta.url\tworld: \tmerged: string\tlib-merge <dom>",
  ]);
});

// One case per explanation: each names the error's own statement, so forcing any one of them off moves its row. The
// counter.ts import feeds another statement than the error's, so it explains nothing and the run fails.
test("graph-worlds-check matches or explains each merged-program error and fails on one it cannot explain", { timeout: 240_000 }, async ({
  plantedTree,
  runCli,
}) => {
  const { run, lines, summary } = await check({ plantedTree, runCli });
  expect(lines.filter((line) => !line.startsWith("difference\t")).map(domLib)).toEqual([
    "explained\t<dom>\tTS2300\toutside-worlds\t\tworld: \tmerged: <dom>",
    "explained\tpackages/b/src/box.ts:4\tTS2741\tdeclared-apart\t\tworld: \tmerged: packages/b/src/box.ts, packages/a/src/augment.ts",
    "explained\tpackages/b/src/headers.ts:2\tTS2300\tdeclared-apart\t\tworld: \tmerged: packages/b/src/headers.ts, <dom>",
    "explained\tpackages/b/src/local.ts:3\tTS2345\tsite-type\tpackages/b/tsconfig.json\tworld: any\tmerged: string",
    "explained\tpackages/b/src/meta-arg.ts:3\tTS2345\tsite-members\tpackages/b/tsconfig.json\tworld: \tmerged: resolve <dom> url <dom>",
    "explained\tpackages/b/src/only.ts:1\tTS2305\tsite-symbol\tpackages/b/tsconfig.json\tworld: packages/b/shared/thing.ts\tmerged: ",
    "explained\tpackages/b/src/use.ts:2\tTS2353\tresolution\tpackages/b/tsconfig.json\tworld: packages/b/src/use.ts:1 @shared/thing -> packages/b/shared/thing.ts\tmerged: @shared/thing -> packages/a/shared/thing.ts",
    "explained\tpackages/b/src/loose.ts:1\tTS7006\toptions\tpackages/b/tsconfig.json\tworld: \tmerged: Parameter 'value' implicitly has an 'any' type.",
    "unexplained\tpackages/b/src/counter.ts:3\tTS2322\tpackages/b/tsconfig.json\tType 'string' is not assignable to type 'number'.",
    "world-only\tpackages/b/src/pick.ts:2\tTS2339\tpackages/b/tsconfig.json\tProperty 'a' does not exist on type 'Thing'.",
  ]);
  expect(summary.split(" ").slice(0, 5)).toEqual(["merged-errors=10", "matched=1", "explained=8", "unexplained=1", "world-only=1"]);
  await expect(run).toExitWith(EXIT.violations);
});
