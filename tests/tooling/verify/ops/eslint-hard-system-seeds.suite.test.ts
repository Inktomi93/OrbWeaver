import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const SEED_ROOTS = ["packages/server/src/domain/settings/seed-themes.ts", "packages/server/src/domain/preset/seed.ts"] as const;
const RULE = "no-restricted-syntax";
const MESSAGE = "System seed roots cannot forward exports";
const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js"), allowInlineConfig: false });
const FORWARDING = [
  'import { write } from "./persistence/private.ts"; export { write };',
  'import { write as internal } from "./persistence/private.ts"; export { internal as renamed };',
  'import * as writes from "./persistence/private.ts"; export const alias = writes.write;',
  'import { write } from "./persistence/private.ts"; export default write;',
  'export { write as renamed } from "./persistence/private.ts";',
  'export * from "./persistence/private.ts";',
  'export * as writes from "./persistence/private.ts";',
  "const write = () => 1; export const wrapper = () => write();",
  'import { write } from "./persistence/private.ts"; export class Writes { static readonly alias = write; }',
  'import { write } from "./persistence/private.ts"; export namespace Writes { export const alias = write; }',
  "export enum Writes { Seed = 1 }",
];

beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SEED_ROOTS[0]));
}, 30_000);

async function syntaxMessages(repoRoot: string, path: string, source: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(repoRoot, path));
  expect(config?.linterOptions?.noInlineConfig).toBe(true);
  const messages = new Linter({ cwd: repoRoot }).verify(
    source,
    {
      files: ["**/*.ts"],
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      linterOptions: config?.linterOptions,
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(repoRoot, path) },
  );
  expect(messages.filter(({ fatal }) => fatal === true)).toEqual([]);
  return messages.filter(({ ruleId }) => ruleId === RULE);
}

for (const path of SEED_ROOTS) {
  test.for(FORWARDING)(`${path}: forwarding refuses: %s`, async (source, { repoRoot }) => {
    const messages = await syntaxMessages(repoRoot, path, source);
    expect(messages.map(({ message }) => message)).toEqual([expect.stringContaining(MESSAGE)]);
  });

  test(`${path}: declared root functions and actual shipped source retain the door`, async ({ repoRoot }) => {
    expect(await syntaxMessages(repoRoot, path, "export async function seed(): Promise<void> {}")).toEqual([]);
    expect(await syntaxMessages(repoRoot, path, "export type Marker = number; export interface Clock { now(): number }")).toEqual([]);
    expect(await syntaxMessages(repoRoot, path, readFileSync(join(repoRoot, path), "utf8"))).toEqual([]);
  });

  test(`${path}: no inline directive can waive a forwarded binding`, async ({ repoRoot }) => {
    const source = `/* eslint-disable ${RULE} -- Attempted bypass. */\nconst write = () => 1; export { write as escape };`;
    expect((await syntaxMessages(repoRoot, path, source)).map(({ message }) => message)).toEqual([expect.stringContaining(MESSAGE)]);
  });

  test(`${path}: the later export fence retains the existing server CORS restriction`, async ({ repoRoot }) => {
    expect((await syntaxMessages(repoRoot, path, 'export function seed() { return "https://corsproxy.io"; }')).map(({ message }) => message)).toEqual([
      expect.stringContaining("D61 B5a"),
    ]);
  });
}

test("the stock export fence judges only seed roots and makes no arbitrary callable-return claim", async ({ repoRoot }) => {
  expect(await syntaxMessages(repoRoot, "packages/server/src/domain/settings/substrate/ordinary.ts", "const value = 1; export { value };")).toEqual([]);
  expect(await syntaxMessages(repoRoot, SEED_ROOTS[0], "const write = () => 1; export function seed() { return write; }")).toEqual([]);
});
