// One planted workspace both brand readers judge, so `orb/no-raw-id` and `pnpm brand-flow` hold one contract for what a
// library is (`isLibrarySource` in tooling/src/eslint/brand-names.ts): a workspace package pnpm links through
// node_modules is the tree's own, and a dependency is a library even where its files sit outside any node_modules
// directory, as a store-linked package's do.
import { join } from "node:path";
import { expect, plantedTsconfig, plantLink, test } from "@orb/testkit/tooling";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { scanBrandFlow } from "../../../tooling/src/brand-flow/index.ts";
import { rawIdRule } from "../../../tooling/src/eslint/raw-id.ts";
import { WORKSPACE_MANIFEST } from "../../../tooling/src/package-effects/index.ts";
import { LIB, WORLD } from "../unwired/_planted.ts";

const USE = "packages/a/src/use.ts";
const RULE = "orb/no-raw-id";

const IDS = [
  "declare const brand: unique symbol;",
  "export type Branded<B extends string> = string & { readonly [brand]: B };",
  'export type MessageId = Branded<"MessageId">;',
  "export function castId<T extends Branded<string>>(raw: string): T {",
  "  return raw as T;",
  "}",
].join("\n");

const SOURCE = [
  'import type { MessageId } from "../../kit/src/ids/index.ts";',
  'import type { Reply } from "@w/b";',
  'import type { DepReply } from "dep";',
  "export type Seen = MessageId;",
  "export interface FromWorkspace {",
  "  readonly messageId: string;",
  "}",
  "export interface FromDependency {",
  "  readonly messageId: string;",
  "}",
  "export const own = (reply: Reply): FromWorkspace => ({ messageId: reply.messageId });",
  "export const dep = (reply: DepReply): FromDependency => ({ messageId: reply.messageId });",
].join("\n");

const manifest = (name: string, types: string): string => JSON.stringify({ name, types });

const TREE = {
  [WORKSPACE_MANIFEST]: "packages:\n  - packages/*\n",
  [WORLD]: plantedTsconfig({ lib: LIB, include: ["src", "../kit/src"] }),
  "packages/a/package.json": manifest("@w/a", "./src/use.ts"),
  "packages/kit/package.json": manifest("@w/kit", "./src/ids/index.ts"),
  "packages/kit/src/ids/index.ts": IDS,
  "packages/b/package.json": manifest("@w/b", "./src/index.ts"),
  "packages/b/src/index.ts": "export interface Reply {\n  readonly messageId: string;\n}",
  "store/dep/package.json": manifest("dep", "./index.d.ts"),
  "store/dep/index.d.ts": "export interface DepReply {\n  readonly messageId: string;\n}",
  [USE]: SOURCE,
};

const lineOf = (needle: string): number => SOURCE.split("\n").findIndex((line) => line.includes(needle)) + 1;

async function plantWorkspace(plantedTree: (files: Record<string, string>) => Promise<string>): Promise<string> {
  const root = await plantedTree(TREE);
  plantLink(root, "node_modules/@w/b", join(root, "packages/b"), "dir");
  plantLink(root, "node_modules/dep", join(root, "store/dep"), "dir");
  return root;
}

test("the raw-id rule reads a workspace package's value as the tree's own and a dependency's as its handle", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantWorkspace(plantedTree);
  const found = new Linter({ cwd: root }).verify(
    SOURCE,
    {
      files: ["**/*.ts"],
      plugins: { orb: { rules: { "no-raw-id": rawIdRule } } },
      languageOptions: { parser: tseslint.parser, parserOptions: { tsconfigRootDir: root, project: [WORLD] } },
      rules: { [RULE]: "error" },
    },
    { filename: join(root, USE) },
  );
  expect(found.map(({ ruleId, line, fatal }) => ({ ruleId, line, fatal }))).toEqual([
    { ruleId: RULE, line: lineOf("export interface FromWorkspace") + 1, fatal: undefined },
  ]);
});

test("the brand-flow scan reads a workspace package's value as the tree's own and a dependency's as its handle", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const root = await plantWorkspace(plantedTree);
  const report = scanBrandFlow({ root, worlds: [WORLD], log: () => undefined });
  const missing = report.missing.filter(({ file, name }) => file === USE && name === "messageId");
  expect(missing.map(({ owner, brand, match }) => ({ owner, brand, match }))).toEqual([{ owner: "FromWorkspace", brand: "MessageId", match: "exact" }]);
  expect(report.brandAnswers.disagreements.filter(({ file }) => file === USE).map(({ line, typed }) => ({ line, typed }))).toEqual([
    { line: lineOf("export interface FromDependency") + 1, typed: [] },
  ]);
});
