import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";
import { z } from "zod";
import { ID_BRAND_HOME } from "../../../../tooling/src/floor/code-facts/id-brand.ts";
import { readAuthoredRepositoryInventory } from "../../../../tooling/src/floor/compiler/authored-repository.ts";
import { readCompilerProgramGraph } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { TEST_WORLD_PROGRAMS } from "../../../../tooling/src/floor/compiler/project-worlds.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { resolveSelection } from "../../../../tooling/src/verify/lib/selection.ts";
import { TYPED_NATIVE_POLICIES } from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { partitionEslintFiles, runScopedEslint } from "../../../../tooling/src/verify/ops/eslint.ts";
import { nativeFabricationPlugin } from "./_fixtures/native-fabrication-candidate.ts";

const SUBJECT = "packages/server/src/domain/chat/contract/fixture.ts";
const BRAND_RULE = "orb/brand-in-name-position";
const BRAND_SOURCE =
  'declare const brand:unique symbol;export type Branded<P extends string>=string & {readonly [brand]:P};export type ChatId=Branded<"chat">;';

const MAINTAINED_TEST_PATHS = [
  "tests/client/compose/_mount-stories.tsx",
  "tests/support/browser/deterministic-helpers.ct.tsx",
  "tests/support/node/route-trpc.ts",
  "tests/support/iso/zod-leaf-paths.ts",
] as const;

function fixture(root: string, repoRoot: string, mode: "typed" | "untyped" | "unowned" = "typed"): void {
  const put = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const entry = TYPED_NATIVE_POLICIES.find((policy) => policy.id === "brand-in-name-position");
  if (entry === undefined) {
    throw new Error("canonical native brand metadata is missing");
  }
  for (const path of entry.inputs) {
    if (path === ID_BRAND_HOME || path === "eslint.config.js" || path === "package.json") {
      continue;
    }
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), readFileSync(join(repoRoot, path)));
  }
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts/eslint.ts"), readFileSync(join(repoRoot, "scripts/eslint.ts")));
  put(".gitignore", "node_modules\n.cache\nreports\n");
  put("package.json", '{"name":"native-typed-metadata-fixture","type":"module"}');
  put(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      files: mode === "unowned" ? [ID_BRAND_HOME] : [ID_BRAND_HOME, SUBJECT],
    }),
  );
  put(ID_BRAND_HOME, BRAND_SOURCE);
  put(SUBJECT, "export function accept(sessionId:string):void {void sessionId;}");
  put("unrelated.js", "export const unrelated=true;");
  const config = pathToFileURL(join(repoRoot, "eslint.config.js")).href;
  const metadata = pathToFileURL(join(repoRoot, "tooling/src/verify/lib/typed-native-inputs.ts")).href;
  put(
    "eslint.config.js",
    `import base from ${JSON.stringify(config)};
import {TYPED_NATIVE_POLICIES,typedNativeInputPaths} from ${JSON.stringify(metadata)};
import {readAuthoredRepositoryInventory} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/floor/compiler/authored-repository.ts")).href)};
import tseslint from "typescript-eslint";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=fileURLToPath(new URL(".",import.meta.url));
const plugin=base.find(block=>block.plugins?.orb!==undefined).plugins.orb;
const entry=TYPED_NATIVE_POLICIES.find(policy=>policy.id==="brand-in-name-position");
export default [{ignores:["node_modules/**",".cache/**","reports/**","tooling/**","scripts/**"]},{files:["packages/**/*.ts"],plugins:{orb:plugin},
languageOptions:{parser:tseslint.parser,parserOptions:{project:${mode === "untyped" ? "false" : '["tsconfig.json"]'},projectService:false,tsconfigRootDir:root}},
settings:{"orb/typed-native-inputs":createHash("sha256").update(JSON.stringify(typedNativeInputPaths(entry,readAuthoredRepositoryInventory(root).paths).map(path=>[path,readFileSync(join(root,path),"utf8")]))).digest("hex")},
rules:{"${BRAND_RULE}":"error"}}];`,
  );
  put("eslint-hard.config.js", 'export default [{files:["**/*.ts"]}];');
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
}

test("ordinary maintained test syntax retains native owners while legacy stays untyped", async ({ repoRoot }) => {
  const paths = MAINTAINED_TEST_PATHS;
  const legacyPath = "tests/legacy/client/probe.ct.tsx";
  const allOrdinary = await readEslintFileAdmissions(repoRoot, "eslint.config.js", [...paths, legacyPath]);
  const ordinary = allOrdinary.filter(({ path }) => path !== legacyPath);
  expect(ordinary.map(({ path, requiresTypeInformation, compilerConfigs }) => ({ path, requiresTypeInformation, compilerConfigs }))).toEqual(
    paths.map((path) => ({
      path,
      requiresTypeInformation: true,
      compilerConfigs: [TEST_WORLD_PROGRAMS.node, TEST_WORLD_PROGRAMS.browser, TEST_WORLD_PROGRAMS.iso],
    })),
  );
  const legacy = allOrdinary.filter(({ path }) => path === legacyPath);
  expect(legacy).toMatchObject([{ requiresTypeInformation: false }]);
});

test("native compiler membership maps maintained test subjects to all admitted worlds", ({ repoRoot }) => {
  const paths = MAINTAINED_TEST_PATHS;
  const configs = [TEST_WORLD_PROGRAMS.node, TEST_WORLD_PROGRAMS.browser, TEST_WORLD_PROGRAMS.iso];
  const owners = partitionEslintFiles(paths, readCompilerProgramGraph(readAuthoredRepositoryInventory(repoRoot), configs), new Set(paths));
  expect(owners.get(TEST_WORLD_PROGRAMS.browser)).toEqual(paths.slice(0, 2));
  expect(owners.get(TEST_WORLD_PROGRAMS.node)).toEqual([paths[2]]);
  expect(owners.get(TEST_WORLD_PROGRAMS.iso)).toEqual([paths[3]]);
});

test("HARD keeps maintained TSX Node and iso subjects Program-free", async ({ repoRoot }) => {
  const paths = MAINTAINED_TEST_PATHS;
  const hard = await readEslintFileAdmissions(repoRoot, "eslint-hard.config.js", paths);
  expect(hard.map(({ path, requiresTypeInformation }) => ({ path, requiresTypeInformation }))).toEqual(
    paths.map((path) => ({ path, requiresTypeInformation: false })),
  );
});

test("a canonical brand edit reselects actual typed consumers, invalidates warm cache and leaves unrelated edits scoped", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const run = proc.runNicedSync;
  const argumentsSeen: string[][] = [];
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      argumentsSeen.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
    }
    return run(executable, args, options);
  });
  try {
    expect(await runScopedEslint(scratch, [ID_BRAND_HOME])).toBe(0);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    expect(argumentsSeen.some((args) => args.some((value) => value.includes("metadata-typed-tsconfig.json")))).toBe(true);
    argumentsSeen.length = 0;
    writeFileSync(join(scratch, ID_BRAND_HOME), `${BRAND_SOURCE}export type SessionId=Branded<"session">;`);
    expect(await runScopedEslint(scratch, [ID_BRAND_HOME])).toBe(1);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    argumentsSeen.length = 0;
    expect(await runScopedEslint(scratch, ["unrelated.js"])).toBe(0);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(false);
    expect(argumentsSeen.some((args) => args.includes("unrelated.js"))).toBe(true);
  } finally {
    child.mockRestore();
  }
}, 60_000);

test("stock value assertions reselect unchanged consumers and recompute per-owner cache generations after provider and rule-code changes", async ({
  scratch,
  repoRoot,
  runCli,
}) => {
  fixture(scratch, repoRoot);
  const entry = TYPED_NATIVE_POLICIES.find(({ id }) => id === "test-value-cast");
  if (entry === undefined) {
    throw new Error("stock value metadata is missing");
  }
  for (const path of entry.inputs) {
    if (path === "eslint.config.js" || path === "package.json") {
      continue;
    }
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), readFileSync(join(repoRoot, path)));
  }
  const pluginRoot = join(scratch, "tooling/src/native-value");
  nativeFabricationPlugin(pluginRoot, repoRoot);
  const subject = "tests/support/node/value.ts";
  const provider = "packages/kit/src/provider.ts";
  const source = `import type {Target} from '../../../packages/kit/src/provider.ts';declare const value:{readonly n:number};export const result=value as Target;`;
  mkdirSync(dirname(join(scratch, subject)), { recursive: true });
  writeFileSync(join(scratch, subject), source);
  writeFileSync(join(scratch, provider), "export interface Target{readonly n:number}");
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" }, files: [provider, subject] }),
  );
  writeFileSync(
    join(scratch, "eslint.config.js"),
    `import tseslint from 'typescript-eslint';
import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {readFileSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {TYPED_NATIVE_POLICIES,typedNativeInputIdentity,typedNativeInputPaths} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/typed-native-inputs.ts")).href)};
import {readAuthoredRepositoryInventory} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/floor/compiler/authored-repository.ts")).href)};
const root=fileURLToPath(new URL('.',import.meta.url));const require=createRequire(import.meta.url);const entry=TYPED_NATIVE_POLICIES.find(entry=>entry.id==='test-value-cast');
export default [{ignores:['node_modules/**','.cache/**','reports/**','tooling/**','scripts/**']},
{files:['packages/**/*.ts'],languageOptions:{parser:tseslint.parser,parserOptions:{project:false,projectService:false}},rules:{'no-debugger':'error'}},
{files:entry.scope,ignores:entry.notUnder,
languageOptions:{parser:tseslint.parser,parserOptions:{project:['tsconfig.json'],projectService:false,tsconfigRootDir:root}},
plugins:{'@typescript-eslint':require(${JSON.stringify(join(pluginRoot, "plugin/dist/index.js"))})},
settings:{['orb/typed-native-inputs/'+entry.id]:createHash('sha256').update(typedNativeInputIdentity(entry,'configured-owner')).update(JSON.stringify(typedNativeInputPaths(entry,readAuthoredRepositoryInventory(root).paths,root).map(path=>[path,readFileSync(join(root,path),'utf8')]))).digest('hex')},rules:{[entry.ruleId]:'error'}}];`,
  );
  execFixtureGit(scratch, ["add", "."]);
  const first = await runCli("verify", ["eslint-scoped", provider], { cwd: scratch });
  await expect(first).toExitWith(0);
  expect(readdirSync(join(scratch, ".cache/eslint"))).toContain("metadata-typed-tsconfig.json.eslintcache");
  writeFileSync(join(scratch, provider), "export interface Target{readonly n:number;readonly required:string}");
  const changed = await runCli("verify", ["eslint-scoped", dirname(provider)], { cwd: scratch });
  await expect(changed).toExitWith(1);
  expect(changed.stdout).toContain("tests/support/node/value.ts");
  writeFileSync(join(scratch, provider), "export interface Target{readonly n:number}");
  const clean = await runCli("verify", ["eslint-scoped", provider], { cwd: scratch });
  await expect(clean).toExitWith(0);
  const implementation = "tooling/src/native-value/plugin/dist/rules/no-unsafe-type-assertion.js";
  const before = readFileSync(join(scratch, implementation), "utf8");
  const condition = "if (isAssertionSafe)";
  expect(before.split(condition)).toHaveLength(2);
  writeFileSync(join(scratch, implementation), before.replace(condition, "if (!isAssertionSafe)"));
  const revised = await runCli("verify", ["eslint-scoped", implementation], { cwd: scratch });
  await expect(revised).toExitWith(1);
  expect(revised.stdout).toContain("tests/support/node/value.ts");
  expect(revised.stdout).toContain("Unsafe type assertion");
  expect(readFileSync(join(scratch, subject), "utf8")).toBe(source);
}, 60_000);

for (const mode of ["untyped", "unowned"] as const) {
  test(`typed metadata refuses its ${mode} subject rather than using the syntax-only route`, async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, mode);
    await expect(runScopedEslint(scratch, [ID_BRAND_HOME])).rejects.toThrow(
      mode === "untyped" ? "no native parser compiler owner" : "no native compiler owner",
    );
  }, 30_000);
}

test("changed selection forwards a deleted typed input without invoking compiler planning for this path-view control", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const routing = await import("../../../../tooling/src/verify/lib/program-routing.ts");
  const planning = vi
    .spyOn(routing, "planTypecheckPrograms")
    .mockReturnValue({ mode: "affected", coverage: "complete-affected-programs", programs: [], subjects: [] });
  const helper = "tooling/src/floor/code-facts/id-brand.ts";
  rmSync(join(scratch, helper));
  try {
    expect(resolveSelection({ kind: "changed", paths: [helper] }, scratch).eslintPaths).toContain(helper);
    expect(resolveSelection({ kind: "changed", paths: ["unrelated.js"] }, scratch).eslintPaths).not.toContain(helper);
    await expect(runScopedEslint(scratch, [helper])).rejects.toThrow("ENOENT");
  } finally {
    planning.mockRestore();
  }
});

test("store-hook home changes reselect unchanged client consumers and deleted or renamed exports refuse through the real typed route", async ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot);
  const home = "packages/client/src/state/create-gated-store.ts";
  const subject = "packages/client/src/selector.ts";
  const entry = TYPED_NATIVE_POLICIES.find((policy) => policy.id === "zustand-selector-stability");
  if (entry === undefined) {
    throw new Error("canonical store-hook metadata missing");
  }
  for (const path of entry.inputs) {
    if (path === home || path === "eslint.config.js" || path === "package.json") {
      continue;
    }
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), readFileSync(join(repoRoot, path)));
  }
  mkdirSync(dirname(join(scratch, home)), { recursive: true });
  const base = "export type GatedStoreHook<T>={<U>(selector:(state:T)=>U):U};";
  writeFileSync(join(scratch, home), `${base}export type UserHook<T>=(selector:(state:T)=>unknown)=>unknown;`);
  writeFileSync(
    join(scratch, subject),
    'import type {UserHook} from "./state/create-gated-store.ts";declare const read:UserHook<{value:string}>;export const value=read(state=>({value:state.value}));',
  );
  writeFileSync(
    join(scratch, "packages/client/tsconfig.json"),
    JSON.stringify({
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      files: ["src/state/create-gated-store.ts", "src/selector.ts"],
    }),
  );
  const original = readFileSync(join(scratch, "eslint.config.js"), "utf8");
  writeFileSync(
    join(scratch, "eslint.config.js"),
    original
      .replaceAll("brand-in-name-position", "zustand-selector-stability")
      .replace('["tsconfig.json"]', '["packages/client/tsconfig.json","tsconfig.json"]'),
  );
  execFixtureGit(scratch, ["add", "."]);
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const run = proc.runNicedSync;
  const argumentsSeen: string[][] = [];
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      argumentsSeen.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
    }
    return run(executable, args, options);
  });
  try {
    expect(await runScopedEslint(scratch, [home])).toBe(0);
    expect(argumentsSeen.some((args) => args.includes(subject))).toBe(true);
    expect(argumentsSeen.some((args) => args.some((value) => value.includes("metadata-typed-packages%2Fclient%2Ftsconfig.json")))).toBe(true);
    argumentsSeen.length = 0;
    writeFileSync(join(scratch, home), `${base}export type UserHook<T>=GatedStoreHook<T>;`);
    expect(await runScopedEslint(scratch, [home])).toBe(1);
    expect(argumentsSeen.some((args) => args.includes(subject))).toBe(true);
    argumentsSeen.length = 0;
    expect(await runScopedEslint(scratch, ["unrelated.js"])).toBe(0);
    expect(argumentsSeen.some((args) => args.includes(subject))).toBe(false);
    writeFileSync(join(scratch, home), "export type Other=string;");
    expect(await runScopedEslint(scratch, [home])).toBe(2);
    rmSync(join(scratch, home));
    await expect(runScopedEslint(scratch, [home])).rejects.toThrow("ENOENT");
  } finally {
    child.mockRestore();
  }
}, 60_000);

test("inherited compiler config bytes invalidate warm typed results and config additions/deletions reselect actual consumers", async ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot);
  const base = "tsconfig.brand-base.json";
  const added = "tsconfig.added.json";
  const inherited = (target: string): string => JSON.stringify({ files: [], compilerOptions: { paths: { "#configured": [`./${target}`] } } });
  writeFileSync(join(scratch, base), inherited("brand-raw.ts"));
  writeFileSync(join(scratch, "brand-raw.ts"), "export type ConfiguredId<T>=string;");
  writeFileSync(join(scratch, "brand-typed.ts"), "export type ConfiguredId<T>=T;");
  writeFileSync(
    join(scratch, ID_BRAND_HOME),
    `${BRAND_SOURCE}import type {ConfiguredId} from "#configured";export type SessionId=ConfiguredId<Branded<"session">>;`,
  );
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      extends: `./${base}`,
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      files: [ID_BRAND_HOME, SUBJECT],
    }),
  );
  execFixtureGit(scratch, ["add", "."]);
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const run = proc.runNicedSync;
  const argumentsSeen: string[][] = [];
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      argumentsSeen.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
    }
    return run(executable, args, options);
  });
  try {
    expect(await runScopedEslint(scratch, [base])).toBe(0);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    argumentsSeen.length = 0;
    writeFileSync(join(scratch, base), inherited("brand-typed.ts"));
    expect(await runScopedEslint(scratch, [base])).toBe(1);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    argumentsSeen.length = 0;
    writeFileSync(join(scratch, added), JSON.stringify({ files: [] }));
    execFixtureGit(scratch, ["add", added]);
    expect(await runScopedEslint(scratch, [added])).toBe(1);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    argumentsSeen.length = 0;
    rmSync(join(scratch, added));
    expect(await runScopedEslint(scratch, [added])).toBe(1);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    argumentsSeen.length = 0;
    const renamed = "tsconfig.renamed.json";
    writeFileSync(join(scratch, renamed), JSON.stringify({ files: [] }));
    expect(await runScopedEslint(scratch, [added, renamed])).toBe(1);
    expect(argumentsSeen.some((args) => args.includes(SUBJECT))).toBe(true);
    rmSync(join(scratch, base));
    await expect(runScopedEslint(scratch, [base])).rejects.toThrow(/extends config cannot be resolved|Cannot read file/u);
  } finally {
    child.mockRestore();
  }
}, 60_000);

test("overlapping production typed blocks preserve each dependency digest through flat composition and warm-cache reselection", async ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot);
  const home = "packages/client/src/state/create-gated-store.ts";
  const subject = "packages/client/src/selector.ts";
  const store = TYPED_NATIVE_POLICIES.find((entry) => entry.id === "zustand-selector-stability");
  if (store === undefined) {
    throw new Error("canonical store metadata missing");
  }
  for (const path of store.inputs) {
    if (path === home || path === "eslint.config.js" || path === "package.json") {
      continue;
    }
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), readFileSync(join(repoRoot, path)));
  }
  mkdirSync(dirname(join(scratch, home)), { recursive: true });
  const base = "export type GatedStoreHook<T>={<U>(selector:(state:T)=>U):U};";
  writeFileSync(join(scratch, home), `${base}export type UserHook<T>=(selector:(state:T)=>unknown)=>unknown;`);
  const source =
    'import type {UserHook} from "./state/create-gated-store.ts";declare const read:UserHook<{value:string}>;export const value=read(state=>({value:state.value}));';
  writeFileSync(join(scratch, subject), source);
  writeFileSync(
    join(scratch, "packages/client/tsconfig.json"),
    JSON.stringify({
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      files: ["../kit/src/ids/index.ts", "src/state/create-gated-store.ts", "src/selector.ts"],
    }),
  );
  writeFileSync(
    join(scratch, "packages/kit/tsconfig.json"),
    JSON.stringify({ compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" }, files: ["src/ids/index.ts"] }),
  );
  writeFileSync(
    join(scratch, "eslint.config.js"),
    `import base from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)};
import {TYPED_NATIVE_POLICIES,typedNativeInputPaths} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/typed-native-inputs.ts")).href)};
import {readAuthoredRepositoryInventory} from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/floor/compiler/authored-repository.ts")).href)};
import tseslint from "typescript-eslint";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=fileURLToPath(new URL(".",import.meta.url));
const selected=new Set(["orb/zustand-selector-stability","${BRAND_RULE}"]);
const blocks=base.filter(block=>Object.keys(block.rules??{}).some(rule=>selected.has(rule))).map(block=>{
  const rule=Object.keys(block.rules).find(rule=>selected.has(rule));
  const entry=TYPED_NATIVE_POLICIES.find(entry=>"orb/"+entry.id===rule);
  const digest=createHash("sha256").update(JSON.stringify(typedNativeInputPaths(entry,readAuthoredRepositoryInventory(root).paths).map(path=>[path,readFileSync(join(root,path),"utf8")]))).digest("hex");
  return {...block,settings:Object.fromEntries(Object.keys(block.settings).map(key=>[key,digest]))};
});
if(blocks.length!==2)throw new Error("expected the two actual production typed blocks");
export default [{ignores:["node_modules/**",".cache/**","reports/**","tooling/**","scripts/**"]},{files:["packages/**/*.ts"],languageOptions:{parser:tseslint.parser,parserOptions:{projectService:true,tsconfigRootDir:root}}},...blocks];`,
  );
  execFixtureGit(scratch, ["add", "."]);
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const effective = (): Readonly<Record<string, unknown>> => {
    const printed = proc.runNicedSync(process.execPath, ["scripts/eslint.ts", "--concurrency", "off", "--print-config", subject], { cwd: scratch });
    if (printed.status !== 0) {
      throw new Error(`effective native config refused: ${printed.stderr}`);
    }
    return z.object({ settings: z.record(z.string(), z.unknown()) }).parse(JSON.parse(printed.stdout)).settings;
  };
  const run = proc.runNicedSync;
  const selectedPaths: string[][] = [];
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      selectedPaths.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
    }
    return run(executable, args, options);
  });
  try {
    expect(await runScopedEslint(scratch, [home])).toBe(0);
    const before = effective();
    selectedPaths.length = 0;
    writeFileSync(join(scratch, home), `${base}export type UserHook<T>=GatedStoreHook<T>;`);
    expect(await runScopedEslint(scratch, [home])).toBe(1);
    expect(selectedPaths.some((args) => args.includes(subject))).toBe(true);
    expect(readFileSync(join(scratch, subject), "utf8")).toBe(source);
    const after = effective();
    for (const settings of [before, after]) {
      expect(settings).toMatchObject({
        "orb/typed-native-inputs/zustand-selector-stability": expect.any(String),
        "orb/typed-native-inputs/brand-in-name-position": expect.any(String),
      });
    }
    expect(after["orb/typed-native-inputs/zustand-selector-stability"]).not.toBe(before["orb/typed-native-inputs/zustand-selector-stability"]);
    expect(after["orb/typed-native-inputs/brand-in-name-position"]).toBe(before["orb/typed-native-inputs/brand-in-name-position"]);
  } finally {
    child.mockRestore();
  }
}, 60_000);
