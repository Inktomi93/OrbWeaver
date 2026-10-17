// Metadata-only scopes exercise the actual native rules through the existing production ESLint runner.
// @subject tooling/src/verify/lib/baseui-manifest.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import { ESLint } from "eslint";
import { vi } from "vitest";
import { z } from "zod";
import { BASE_UI_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/contract/baseui.ts";
import { JSON_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-json.ts";
import { CLIENT_LEXICAL_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/client-lexical-native.ts";
import { CLIENT_MAP_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/client-map-native.ts";
import { CONTEXT_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/context-definition-shape.ts";
import { SOURCE_TYPE_SUPPRESSION_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/source-type-suppression-native.ts";

const MANIFEST = JSON_RESOURCE_PATHS["baseui-manifest"];
const SOURCE = "packages/ui/src/probe.tsx";
const BAD =
  'import {Select as Base} from "@base-ui/react/select";export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';
const GOOD =
  'import {Select as Base,type SelectRootProps} from "@base-ui/react/select";export interface SealProps{disabled?:SelectRootProps<string>["disabled"]}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';

function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  return plantedTree({
    ...Object.fromEntries(BASE_UI_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import config from ${config};export default [...config,{files:["ordinary.js"],rules:{"no-alert":"error"}}];`,
    "eslint-hard.config.js": `export {hardConfig as default} from ${config};`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
    "ordinary.js": "alert('unlicensed');\n",
  });
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

test("metadata alone rejudges actual native UI syntax without an ordinary compiler owner", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, BAD);
  expect(await runScopedEslint(root, [MANIFEST])).toBe(1);
  writeFileSync(join(root, SOURCE), GOOD);
  expect(await runScopedEslint(root, [MANIFEST])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`mixed metadata and source still run every ordinary source rule: ${allowed ? "legal" : "blocked"}`, async ({ plantedTree, repoRoot }) => {
    const root = await nativeRoot(plantedTree, repoRoot, GOOD);
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const licensed=1;\n" : "alert('unlicensed');\n");
    expect(await runScopedEslint(root, [MANIFEST, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

for (const path of [MANIFEST, "tooling/src/verify/lib/baseui-manifest.ts"] as const) {
  test(`a deleted native metadata dependency is a real CLI tool error: ${path}`, async ({ plantedTree, repoRoot, runCli }) => {
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
  ]),
];

function sharedMetadataRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const parser = JSON.stringify(pathToFileURL(join(repoRoot, "node_modules/typescript-eslint/dist/index.js")).href);
  return plantedTree({
    ...Object.fromEntries(SHARED_INPUTS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import config,{hardConfig} from ${config};import tseslint from ${parser};import {appendFileSync} from "node:fs";
      export const traced=(rows,profile)=>[...rows,{ignores:${JSON.stringify(SHARED_INPUTS)}},{languageOptions:{parser:{...tseslint.parser,parseForESLint(text,options){appendFileSync(new URL("./parses.jsonl",import.meta.url),JSON.stringify({profile,file:options.filePath})+"\\n");return tseslint.parser.parseForESLint(text,options);}},parserOptions:{project:false,projectService:false,programs:null,tsconfigRootDir:import.meta.dirname}},rules:tseslint.configs.disableTypeChecked.rules}];
      export const hard=traced(hardConfig,"hard");export default traced(config,"ordinary");`,
    "eslint-hard.config.js": 'export {hard as default} from "./eslint.config.js";',
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    "root-probe.ts": "export {};",
    "packages/ui/native-probe.ts": "export {};",
    "packages/showcase-plugins/bundles/native/main.ts": "export {};",
    "playwright/native-probe.ts": "export {};",
    "scripts/native-probe.ts": "export {};",
    "tooling/src/native-probe.ts": "export {};",
    [SOURCE]: "export const legal=1;",
    [CLIENT_SOURCE]: "export const legal=1;",
  });
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
    }).toEqual({ nativeCalls: 3, hardParses: 9, ordinaryParses: 2 });
    expect(new Set(parses.map(({ profile, file }) => `${profile}:${file}`)).size).toBe(parses.length);
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
