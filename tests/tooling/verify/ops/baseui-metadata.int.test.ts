// Metadata-only scopes exercise the actual native rules through the existing production ESLint runner.
// @subject tooling/src/verify/lib/baseui-manifest.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import { ESLint } from "eslint";
import { vi } from "vitest";
import { z } from "zod";
import { BASE_UI_DATA_RULE, BASE_UI_HANDLER_RULE, BASE_UI_NATIVE_INPUT_PATHS, BASE_UI_STATE_RULE } from "../../../../tooling/src/verify/contract/baseui.ts";
import { JSON_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-json.ts";
import { CLIENT_LEXICAL_NATIVE_INPUT_PATHS, CLIENT_LEXICAL_NATIVE_RULES } from "../../../../tooling/src/verify/lib/client-lexical-native.ts";
import { CLIENT_MAP_NATIVE_INPUT_PATHS, CLIENT_MAP_NATIVE_RULE } from "../../../../tooling/src/verify/lib/client-map-native.ts";
import { CONTEXT_NATIVE_INPUT_PATHS, CONTEXT_NATIVE_RULES } from "../../../../tooling/src/verify/lib/context-definition-shape.ts";
import { SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS, SOURCE_TYPE_SUPPRESSION_RULE } from "../../../../tooling/src/verify/lib/source-type-suppression-native.ts";
import {
  CONFIG_ANCHOR_OWNER,
  TEST_TOOLING_IMPORT_NATIVE_FAMILIES,
  TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS,
} from "../../../../tooling/src/verify/lib/test-tooling-imports-native.ts";
import { scaledBudget } from "../../_load-budget.ts";

const MANIFEST = JSON_RESOURCE_PATHS["baseui-manifest"];
const SOURCE = "packages/ui/src/probe.tsx";
const BASE_UI_RULES = [BASE_UI_DATA_RULE, BASE_UI_HANDLER_RULE, BASE_UI_STATE_RULE];
const BAD =
  'import {Select as Base} from "@base-ui/react/select";export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';
const GOOD =
  'import {Select as Base,type SelectRootProps} from "@base-ui/react/select";export interface SealProps{disabled?:SelectRootProps<string>["disabled"]}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';

async function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const root = await plantedTree({
    ".gitignore": "node_modules\n.cache\nreports\n",
    ...Object.fromEntries(BASE_UI_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"name":"native-metadata-fixture","type":"module","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "packages/server/package.json": '{"name":"@orb/server","type":"module","private":true}',
    // Only the actual Base UI syntax policies are subjects; copied metadata is not a typed-policy fixture.
    "eslint.config.js": `import config,{hardConfig} from ${config};const rules=${JSON.stringify(BASE_UI_RULES)};const syntax=rows=>rows.map(row=>({...row,rules:Object.fromEntries(Object.entries(row.rules??{}).filter(([rule])=>rules.includes(rule)))}));export const hard=syntax(hardConfig);export default [...syntax(config),{files:["ordinary.js"],rules:{"no-alert":"error"}}];`,
    "eslint-hard.config.js": 'export {hard as default} from "./eslint.config.js";',
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
    "ordinary.js": "alert('unlicensed');\n",
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  return root;
}

function metadataSelection(path: string): Selection {
  return {
    kind: "changed",
    label: "native metadata",
    paths: [path],
    existingPaths: [],
    runtimeSubjects: [],
    eslintPaths: [],
    depcruisePaths: [],
    docsPaths: [],
    tsconfigs: [],
    ct: { mode: "skip", targets: [] },
    checkScopeArgv: ["node", "tooling/src/verify/cli.ts", "scoped"],
    gitRef: undefined,
  };
}

test("the real registry carries metadata-only and deleted inputs without claiming ordinary sources", () => {
  const row = REGISTRY.find(({ name }) => name === "lint:eslint");
  for (const path of BASE_UI_NATIVE_INPUT_PATHS) {
    expect(row?.scopedArgv?.(metadataSelection(path))).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", path]);
  }
  const selected = metadataSelection(MANIFEST);
  expect(row?.scopedArgv?.({ ...selected, paths: [MANIFEST, "ordinary.js"], eslintPaths: ["ordinary.js"] })).toEqual([
    "node",
    "tooling/src/verify/cli.ts",
    "eslint-scoped",
    "ordinary.js",
    MANIFEST,
  ]);
  expect(row?.scopedArgv?.({ ...selected, paths: ["docs/law/Constitution.md"] })).toBe("skip-empty");
});

test("metadata alone rejudges actual native UI syntax without an ordinary compiler owner", { timeout: scaledBudget(30_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await nativeRoot(plantedTree, repoRoot, BAD);
  expect(await runScopedEslint(root, [MANIFEST])).toBe(1);
  writeFileSync(join(root, SOURCE), GOOD);
  expect(await runScopedEslint(root, [MANIFEST])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`mixed metadata and source still run every ordinary source rule: ${allowed ? "legal" : "blocked"}`, { timeout: scaledBudget(30_000) }, async ({
    plantedTree,
    repoRoot,
  }) => {
    const root = await nativeRoot(plantedTree, repoRoot, GOOD);
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const licensed=1;\n" : "alert('unlicensed');\n");
    expect(await runScopedEslint(root, [MANIFEST, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

for (const path of [MANIFEST, "tooling/src/verify/lib/baseui-manifest.ts"] as const) {
  test(`a deleted native metadata dependency is a real CLI tool error: ${path}`, { timeout: scaledBudget(30_000) }, async ({
    plantedTree,
    repoRoot,
    runCli,
  }) => {
    const root = await nativeRoot(plantedTree, repoRoot, GOOD);
    unlinkSync(join(root, path));
    await expect(await runCli("verify", ["eslint-scoped", path], { cwd: root })).toExitWith(2);
  });
}

test("empty, unparseable and wrong-shaped metadata never skip green", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, GOOD);
  for (const text of ["", "{ not json", '{"version":"1.8.0","components":{"Select":{}}}']) {
    writeFileSync(join(root, MANIFEST), text);
    await expect(runScopedEslint(root, [MANIFEST])).rejects.toThrow();
  }
});

const CLIENT_SOURCE = "packages/client/src/probe.tsx";
const SHARED_INPUTS = [
  ...new Set([
    ...BASE_UI_NATIVE_INPUT_PATHS,
    ...CONTEXT_NATIVE_INPUT_PATHS,
    ...CLIENT_MAP_NATIVE_INPUT_PATHS,
    ...CLIENT_LEXICAL_NATIVE_INPUT_PATHS,
    ...SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS,
    ...TEST_TOOLING_IMPORT_NATIVE_INPUT_PATHS,
  ]),
];
// This proof shares native syntax scans; typed-policy authority has separate native-owner fixtures.
const SHARED_RULES = [
  ...BASE_UI_RULES,
  ...CONTEXT_NATIVE_RULES,
  CLIENT_MAP_NATIVE_RULE,
  ...CLIENT_LEXICAL_NATIVE_RULES,
  SOURCE_TYPE_SUPPRESSION_RULE,
  ...TEST_TOOLING_IMPORT_NATIVE_FAMILIES.flatMap(({ rules }) => rules),
];
const SHARED_SUBJECTS = {
  "root-probe.ts": "export {};",
  "packages/ui/native-probe.ts": "export {};",
  "packages/showcase-plugins/bundles/native/main.ts": "export {};",
  "playwright/native-probe.ts": "export {};",
  "scripts/native-probe.ts": "export {};",
  "tooling/src/native-probe.ts": "export {};",
  "tests/native-probe.ts": "export {};",
  "tests/support/node/native-probe.mjs": "export {};",
  [CONFIG_ANCHOR_OWNER]: "export {};",
  [SOURCE]: "export const legal=1;",
  [CLIENT_SOURCE]: "export const legal=1;",
};

async function sharedMetadataRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const parser = JSON.stringify(pathToFileURL(join(repoRoot, "node_modules/typescript-eslint/dist/index.js")).href);
  const root = await plantedTree({
    ".gitignore": "node_modules\n.cache\nreports\n",
    ...Object.fromEntries(SHARED_INPUTS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"name":"native-metadata-fixture","type":"module","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "packages/server/package.json": '{"name":"@orb/server","type":"module","private":true}',
    "eslint.config.js": `import config,{hardConfig} from ${config};import tseslint from ${parser};import {appendFileSync} from "node:fs";
      export const traced=(original,profile)=>{const rows=original.map(row=>({...row,rules:Object.fromEntries(Object.entries(row.rules??{}).filter(([rule])=>${JSON.stringify(SHARED_RULES)}.includes(rule)))}));return [...rows,{ignores:${JSON.stringify(SHARED_INPUTS)}},{languageOptions:{parser:{...tseslint.parser,parseForESLint(text,options){appendFileSync(new URL("./parses.jsonl",import.meta.url),JSON.stringify({profile,file:options.filePath})+"\\n");return tseslint.parser.parseForESLint(text,options);}},parserOptions:{project:false,projectService:false,programs:null,tsconfigRootDir:import.meta.dirname}},rules:tseslint.configs.disableTypeChecked.rules}];};
      export const hard=traced(hardConfig,"hard");export default traced(config,"ordinary");`,
    "eslint-hard.config.js": 'export {hard as default} from "./eslint.config.js";',
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    ...SHARED_SUBJECTS,
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  return root;
}

test("shared metadata parses each admitted file once per native profile", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await sharedMetadataRoot(plantedTree, repoRoot);
  const calls = vi.spyOn(ESLint.prototype, "lintFiles");
  try {
    expect(await runScopedEslint(root, ["eslint.config.js"])).toBe(0);
    const parseRow = z.object({ profile: z.enum(["hard", "ordinary"]), file: z.string() });
    const parses = readFileSync(join(root, "parses.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => parseRow.parse(JSON.parse(line)));
    expect({
      nativeCalls: calls.mock.calls.length,
      hardParses: parses.filter(({ profile }) => profile === "hard").length,
      ordinaryParses: parses.filter(({ profile }) => profile === "ordinary").length,
    }).toEqual({ nativeCalls: 3, hardParses: 12, ordinaryParses: 3 });
    expect(new Set(parses.map(({ profile, file }) => `${profile}:${file}`)).size).toBe(parses.length);
    expect(parses.map(({ profile, file }) => `${profile}:${relative(root, file).replaceAll("\\", "/")}`).toSorted()).toEqual(
      [
        ...[...Object.keys(SHARED_SUBJECTS), "scripts/eslint.ts"].map((file) => `hard:${file}`),
        ...[SOURCE, CLIENT_SOURCE, CONFIG_ANCHOR_OWNER].map((file) => `ordinary:${file}`),
      ].toSorted(),
    );
  } finally {
    calls.mockRestore();
  }
});

test.for(["missing UI", "missing client", "ignored UI"])(
  "a populated sibling cannot mask a demanded family's %s population",
  { tags: ["slow"] },
  async (mode, { plantedTree, repoRoot }) => {
    const root = await sharedMetadataRoot(plantedTree, repoRoot);
    if (mode === "ignored UI") {
      const path = join(root, "eslint.config.js");
      writeFileSync(path, readFileSync(path, "utf8").replace("...rows,", '...rows,{ignores:["packages/ui/src/**"]},'));
    } else {
      unlinkSync(join(root, mode === "missing UI" ? SOURCE : CLIENT_SOURCE));
      if (mode === "missing client") {
        unlinkSync(join(root, CONFIG_ANCHOR_OWNER));
      }
    }
    await expect(runScopedEslint(root, ["eslint.config.js"])).rejects.toThrow();
  },
);

test("shared profiles do not run family rules outside their original requested patterns", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await sharedMetadataRoot(plantedTree, repoRoot);
  const path = join(root, "eslint.config.js");
  writeFileSync(path, readFileSync(path, "utf8").replace("...rows,", '...rows,{files:["packages/ui/src/**"],rules:{"orb/context-definition-shape":"error"}},'));
  writeFileSync(
    join(root, SOURCE),
    BAD + '\n/* eslint "orb/context-definition-shape":"error" */\nexport const outsideContext={kind:"tabs",useResolved:()=>null};',
  );
  // The UI seal is deliberately bad for its own family; the client-only context rule must not add a second diagnostic.
  const output = vi.spyOn(process.stdout, "write");
  try {
    expect(await runScopedEslint(root, ["eslint.config.js"])).toBe(1);
    expect(output.mock.calls.flat().join("")).not.toContain("orb/context-definition-shape");
    expect(output.mock.calls.flat().join("")).toContain("orb/baseui-derives-not-respells");
  } finally {
    output.mockRestore();
  }
});

test("a shared HARD syntax error is terminal before any ordinary profile", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await sharedMetadataRoot(plantedTree, repoRoot);
  writeFileSync(join(root, SOURCE), "export const broken=(;");
  const calls = vi.spyOn(ESLint.prototype, "lintFiles");
  try {
    expect(await runScopedEslint(root, ["eslint.config.js"])).toBe(2);
    expect(calls.mock.calls).toHaveLength(1);
    expect(readFileSync(join(root, "parses.jsonl"), "utf8")).not.toContain('"profile":"ordinary"');
  } finally {
    calls.mockRestore();
  }
});

test("shared HARD retains original rule scope and rejects an inline disable", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await sharedMetadataRoot(plantedTree, repoRoot);
  const path = join(root, "eslint.config.js");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace(
      "...rows,",
      `...rows,{files:[${JSON.stringify(CLIENT_SOURCE)}],rules:{"orb/baseui-derives-not-respells-health":"error"}},`,
    ),
  );
  const outsideHandler =
    'import {Select as Base} from "@base-ui/react/select";export interface SealProps{onValueChange?:(value:string)=>void}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';
  writeFileSync(join(root, CLIENT_SOURCE), outsideHandler);
  expect(await runScopedEslint(root, ["eslint.config.js"])).toBe(0);
  writeFileSync(
    join(root, CLIENT_SOURCE),
    '/* eslint "@typescript-eslint/ban-ts-comment":"off" */\n// @ts-expect-error Controlled boundary refusal.\n' + outsideHandler,
  );
  expect(await runScopedEslint(root, ["eslint.config.js"])).toBe(1);
});

test("shared metadata still refuses a missing later family input", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await sharedMetadataRoot(plantedTree, repoRoot);
  unlinkSync(join(root, "tooling/src/verify/lib/tailwind-class-token.ts"));
  await expect(runScopedEslint(root, ["eslint.config.js"])).rejects.toThrow();
});
