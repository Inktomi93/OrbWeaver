import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import {
  CONFIG_ANCHOR_OWNER,
  TEST_PACKAGE_SUBPATH_RULE,
  TOOLING_ROOT_CONFIG_IMPORT_RULE,
} from "../../../../tooling/src/verify/lib/test-tooling-imports-native.ts";

const ROOT = join(import.meta.dirname, "../../../..");
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: join(ROOT, "eslint-hard.config.js") });

async function messages(path: string, source: string, rule: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(ROOT, path);
  const config = await eslint.calculateConfigForFile(filename);
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx,mjs}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "off" },
      rules: { [rule]: config?.rules[rule] ?? "off" },
      settings: config?.settings ?? {},
    },
    { filename },
  );
  expect(
    found.some(({ fatal, message }) => fatal === true || message.includes("Definition for rule")),
    source,
  ).toBe(false);
  return found.filter(({ ruleId }) => ruleId === rule);
}

test("native test module positions reject a relative package-source climb", async () => {
  expect(await messages("tests/client/lib/probe.test.ts", 'import {x} from "../../../packages/client/src/lib/x.ts";', TEST_PACKAGE_SUBPATH_RULE)).toHaveLength(
    1,
  );
});

test("native tooling imports reject an escape into another package", async () => {
  expect(
    await messages("tooling/src/verify/ops/probe.ts", 'import {x} from "../../../../packages/kit/src/ids/index.ts";', TOOLING_ROOT_CONFIG_IMPORT_RULE),
  ).toHaveLength(1);
});

test("the actual registry owner cannot publish the raw formatter name", async () => {
  expect(
    await messages(CONFIG_ANCHOR_OWNER, "export function configAnchorId(group:string,sub:string){return `${group}-${sub}`;}", "no-restricted-exports"),
  ).toHaveLength(1);
});

test.for([
  'import type {X} from "../../../packages/client/src/x.ts";',
  'export {X} from "../../../packages/client/src/x.ts";',
  'export * from "../../../packages/client/src/x.ts";',
  'export type X = import("../../../packages/client/src/x.ts").X;',
  'const x = import("../../../packages/client/src/x.ts");',
  'const x = require("../../../packages/client/src/x.ts");',
  ...["mock", "doMock", "unmock", "doUnmock", "importActual", "importMock"].map((call) => `vi.${call}("../../../packages/client/src/x.ts");`),
])("all declared module positions reject the same climb: %s", async (source) => {
  expect(await messages("tests/client/lib/probe.test.ts", source, TEST_PACKAGE_SUBPATH_RULE)).toHaveLength(1);
});

test.for([
  ["tests/client/probe.dom.test.tsx", 'import {X} from "../../packages/new-package/src/x.ts"; const x = <X/>;'],
  ["tests/client/probe.test-d.ts", 'type X = import("../../packages/client/src/x.ts").X;'],
  ["tests/support/node/probe.mjs", 'import {x} from "../../../packages/kit/src/x.ts";'],
  ["tests/client/lib/probe.test.ts", 'vi.mock("../../support/node/fixtures.ts");'],
  ["tests/support/node/probe.ts", 'import {x} from "../../../packages/kit/src/x.ts";'],
] as const)("native strict subject %s cannot enter source by relative path", async ([path, source]) => {
  expect(await messages(path, source, TEST_PACKAGE_SUBPATH_RULE)).toHaveLength(1);
});

test.for([
  ["tests/client/lib/probe.test.ts", 'import {x} from "@orb/client/lib"; import {fx} from "@orb/testkit/node/fixtures.ts"; import {h} from "./helper.ts";'],
  [
    "tests/client/lib/probe.test.ts",
    'const data = "../../../packages/client/src/x.ts"; readFile("../../../packages/client/src/x.ts"); new URL("../../../packages/client/src/x.ts", import.meta.url);',
  ],
  [
    "tests/client/lib/probe.test.ts",
    'vi["mock"]("../../../packages/client/src/x.ts"); other.mock("../../../packages/client/src/x.ts"); vi.mock(`../../../packages/client/src/x.ts`);',
  ],
  ["tests/support/node/probe.ts", 'import {fx} from "./fixtures.ts"; import {iso} from "../iso/index.ts";'],
  ["tests/legacy/client/probe.test.ts", 'import {x} from "../../../packages/client/src/x.ts";'],
  ["tests/client/probe.mjs", 'import {x} from "../../packages/client/src/x.ts";'],
  ["packages/client/src/probe.ts", 'import {x} from "../../../packages/kit/src/x.ts";'],
] as const)("legal or declared-outside population %s remains admitted", async ([path, source]) => {
  expect(await messages(path, source, TEST_PACKAGE_SUBPATH_RULE)).toEqual([]);
});

test.for(["application-knip", "knip-negative-liveness"])("only %s may import the canonical Knip target", async (name) => {
  const path = `tooling/src/verify/ops/${name}.ts`;
  expect(await messages(path, 'import config from "../../../../knip.ts";', TOOLING_ROOT_CONFIG_IMPORT_RULE)).toEqual([]);
  expect(await messages(path, 'import config from "../../../../eslint.config.js";', TOOLING_ROOT_CONFIG_IMPORT_RULE)).toHaveLength(1);
  expect(await messages(`${path.slice(0, -3)}-sibling.ts`, 'import config from "../../../../knip.ts";', TOOLING_ROOT_CONFIG_IMPORT_RULE)).toHaveLength(1);
});

test("tooling authority reports each edge, with its original import-declaration limit", async () => {
  const path = "tooling/src/verify/ops/probe.ts";
  expect(await messages(path, 'import x from "../../../../knip.ts"; import y from "../../../../knip.ts";', TOOLING_ROOT_CONFIG_IMPORT_RULE)).toHaveLength(2);
  expect(
    await messages(
      path,
      'import x from "../contract/policy.ts"; import fs from "node:fs"; import k from "@orb/kit"; import z from "#verify"; export * from "../../../../knip.ts"; const x = import("../../../../knip.ts");',
      TOOLING_ROOT_CONFIG_IMPORT_RULE,
    ),
  ).toEqual([]);
});

test.for(["const x=1; export {x as configAnchorId};", 'export {configAnchorId} from "./other.ts";'])(
  "stock restricted exports forbids the actual exported name: %s",
  async (source) => {
    expect(await messages(CONFIG_ANCHOR_OWNER, source, "no-restricted-exports")).toHaveLength(1);
  },
);

test.for([
  "function configAnchorId(){} export {configAnchorId as formatter};",
  "function configAnchorId(){} export {configAnchorId as default};",
  "function configAnchorId(){} export default configAnchorId;",
  "export default function configAnchorId(){}",
])("direct local alias/default cannot expose the private formatter: %s", async (source) => {
  expect(await messages(CONFIG_ANCHOR_OWNER, source, "no-restricted-syntax")).toHaveLength(1);
});

test("private formatter, maintained public functions and other owners are not restricted", async () => {
  const source = "function configAnchorId(){} export function resolveConfigSectionContributions(){}";
  expect(await messages(CONFIG_ANCHOR_OWNER, source, "no-restricted-exports")).toEqual([]);
  expect(await messages(CONFIG_ANCHOR_OWNER, source, "no-restricted-syntax")).toEqual([]);
  expect(await messages("packages/client/src/state/another.ts", "export function configAnchorId(){}", "no-restricted-exports")).toEqual([]);
});

test("the real HARD profile cannot be disabled by a subject comment", async () => {
  const path = "tests/client/lib/probe.test.ts";
  const [result] = await eslint.lintText(
    `/* eslint-disable ${TEST_PACKAGE_SUBPATH_RULE} -- Attempted boundary bypass. */\nimport {x} from "../../../packages/client/src/x.ts";`,
    { filePath: join(ROOT, path) },
  );
  expect(result?.fatalErrorCount).toBe(0);
  expect(result?.messages.filter(({ ruleId }) => ruleId === TEST_PACKAGE_SUBPATH_RULE)).toHaveLength(1);
});
