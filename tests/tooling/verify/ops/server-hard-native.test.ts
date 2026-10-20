import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../../../..");
const CONTRACT = "orb/types-in-contract";
const SERDE = "orb/serde-core-definition-uniqueness";
const SERVICE = "packages/server/src/domain/hub/contract/service.ts";
const FORK = "packages/server/src/domain/import/substrate/dup.ts";
const SERDE_HOME = "packages/server/src/primitives/serde/card/index.ts";
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SERVICE));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null } },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

async function inScope(rule: string, path: string): Promise<boolean> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  return config?.rules?.[rule]?.[0] === 2;
}

test("a contract/service.ts with no exported interface is reported once at the file start", async () => {
  const found = await findings(CONTRACT, "export const noInterface = 1;\n", SERVICE);
  expect(found.map(({ line, column }) => [line, column])).toEqual([[1, 1]]);
});

test.for([
  ["an exported interface", "export interface HubService { list(): void }\n"],
  ["a default-exported interface", "export default interface HubService { list(): void }\n"],
] as const)("the service contract passes with %s", async ([, source]) => {
  expect(await findings(CONTRACT, source, SERVICE)).toEqual([]);
});

test("a local interface is not the exported API surface", async () => {
  expect(await findings(CONTRACT, "interface HubService { list(): void }\nexport const x = 1;\n", SERVICE)).toHaveLength(1);
});

test("the contract rule judges only each domain's contract/service.ts", async () => {
  expect(await inScope(CONTRACT, SERVICE)).toBe(true);
  expect(await inScope(CONTRACT, "packages/server/src/domain/hub/contract/results.ts")).toBe(false);
  expect(await inScope(CONTRACT, "packages/server/src/domain/hub/service.ts")).toBe(false);
});

test.for([
  ["an exported function", "export function cardFromJson(raw: unknown): unknown { return raw; }\n"],
  ["an async exported function", "export async function buildCardV3(): Promise<unknown> { return {}; }\n"],
  ["an exported const", "export const cardContentHash = (): string => '';\n"],
] as const)("a second declaration as %s is a fork", async ([, source]) => {
  expect(await findings(SERDE, source, FORK)).toHaveLength(1);
});

test.for([
  ["an import and a use", 'import { cardFromJson } from "#primitives/serde/card";\nexport const x = cardFromJson;\n'],
  ["a comment naming the mapper", "// Uses cardFromJson from primitives/serde/card.\nexport const x = 1;\n"],
  ["a re-export", 'export { cardFromJson } from "#primitives/serde/card";\n'],
] as const)("%s is not a declaration", async ([, source]) => {
  expect(await findings(SERDE, source, FORK)).toEqual([]);
});

test("the canonical home declares the mappers; the rest of the server package is judged", async () => {
  expect(await inScope(SERDE, SERDE_HOME)).toBe(false);
  expect(await inScope(SERDE, FORK)).toBe(true);
  expect(await inScope(SERDE, "packages/server/src/primitives/serde/other.ts")).toBe(true);
  expect(await inScope(SERDE, "packages/kit/src/serde/card.ts")).toBe(false);
});

test("the HARD profile cannot be disabled by a subject comment", async () => {
  const [result] = await eslint.lintText(`/* eslint-disable ${SERDE} -- Attempted bypass. */\nexport function cardFromJson(): void {}\n`, {
    filePath: join(ROOT, FORK),
  });
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter(({ ruleId }) => ruleId === SERDE)).toHaveLength(1);
});
