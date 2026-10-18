import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { vi } from "vitest";
import { z } from "zod";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { readPolicyRepositoryInventory } from "../../../../tooling/src/verify/lib/policy-repo-inventory.ts";
import {
  affectsTypedNativeLint,
  TYPED_NATIVE_COMPILER_CONTEXT_ENV,
  TYPED_NATIVE_POLICIES,
  typedNativeDependencyInputs,
} from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { runScopedEslint } from "../../../../tooling/src/verify/ops/eslint.ts";

const PROVIDER = "packages/server/src/infra/adapter.ts";
const CONSUMER = "packages/server/src/entry/consumer.ts";
const RULE = "server-factory-tier-reference";
const PUBLIC_BOUNDARY_GRAMMAR = "tooling/src/floor/code-facts/server-public-boundary-grammar.ts";
const PROVIDER_SOURCE = `export interface Handle {readonly close:()=>void}
export function handle():Handle{return {close(){}}}
export function read():{readonly stamp:number}{return {stamp:1}}
`;
const EXPOSED_PROVIDER_SOURCE = PROVIDER_SOURCE.replace(
  "export function read():{readonly stamp:number}{return {stamp:1}}",
  "export function read():Handle{return handle()}",
);

function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function fixture(root: string, repoRoot: string): void {
  const entry = TYPED_NATIVE_POLICIES.find((policy) => policy.id === RULE);
  if (entry === undefined) {
    throw new Error("native factory metadata missing");
  }
  for (const path of new Set([...entry.inputs, PUBLIC_BOUNDARY_GRAMMAR])) {
    if (["eslint.config.js", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(path)) {
      continue;
    }
    put(root, path, readFileSync(join(repoRoot, path), "utf8"));
  }
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  put(root, "scripts/eslint.ts", readFileSync(join(repoRoot, "scripts/eslint.ts"), "utf8"));
  put(root, ".gitignore", "node_modules\n.cache\nreports\n");
  put(root, "package.json", '{"name":"factory-metadata-control","type":"module","private":true}');
  put(root, "pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
  put(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  put(root, "packages/server/package.json", '{"name":"@orb/server","type":"module","dependencies":{"@orb/kit":"workspace:*"}}');
  put(root, "packages/kit/package.json", '{"name":"@orb/kit","type":"module"}');
  put(root, "packages/kit/src/value.ts", "export interface Shared {readonly value:number}");
  put(root, "packages/ui/package.json", '{"name":"@orb/ui","type":"module"}');
  put(root, "packages/ui/src/unrelated.ts", "export const unrelated=1;");
  put(root, "ambient.d.ts", "declare const fixtureAmbient:unique symbol;");
  put(
    root,
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: { strict: true, noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" },
      include: ["packages/server/src/**/*.ts", "packages/kit/src/**/*.ts", "ambient.d.ts"],
    }),
  );
  put(root, PROVIDER, PROVIDER_SOURCE);
  put(root, CONSUMER, 'import {read} from "../infra/adapter.ts";export const value=read();');
  const url = (path: string): string => JSON.stringify(pathToFileURL(join(repoRoot, path)).href);
  put(
    root,
    "eslint.config.js",
    `import base from ${url("eslint.config.js")};
import {TYPED_NATIVE_POLICIES,typedNativeCompilerContext,typedNativeInputPaths} from ${url("tooling/src/verify/lib/typed-native-inputs.ts")};
import {readAuthoredRepositoryInventory} from ${url("tooling/src/floor/compiler/authored-repository.ts")};
import tseslint from "typescript-eslint";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const root=fileURLToPath(new URL(".",import.meta.url));
const compiler=typedNativeCompilerContext(root);
const ids=["type-home-direct-export","${RULE}"];
export default [{ignores:["node_modules/**",".cache/**","reports/**","tooling/**","scripts/**","packages/kit/**","packages/ui/**","*.d.ts"]},
...base.filter(block=>ids.some(id=>block.rules?.["orb/"+id]!==undefined)).map(block=>{
 const id=ids.find(id=>block.rules?.["orb/"+id]!==undefined);
 const entry=TYPED_NATIVE_POLICIES.find(entry=>entry.id===id);
 return {...block,languageOptions:{parser:tseslint.parser,parserOptions:{project:["tsconfig.json"],projectService:false,tsconfigRootDir:root}},
 settings:{["orb/typed-native-inputs/"+id]:createHash("sha256").update(compiler.identity).update(JSON.stringify(typedNativeInputPaths(entry,readAuthoredRepositoryInventory(root).paths,root,compiler.configs).map(path=>[path,readFileSync(join(root,path),"utf8")]))).digest("hex")}};
})];`,
  );
  put(root, "eslint-hard.config.js", 'export default [{files:["**/*.ts"]}];');
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
}

test("public boundary implementation and provider signatures invalidate warm native cache and reselect unchanged consumers without unrelated UI", async ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot);
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const run = proc.runNicedSync;
  const seen: string[][] = [];
  const contexts: { root: string; configs: readonly string[] | null }[] = [];
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      seen.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
      contexts.push(
        z.object({ root: z.string(), configs: z.array(z.string()).nullable() }).parse(JSON.parse(options?.env?.[TYPED_NATIVE_COMPILER_CONTEXT_ENV] ?? "null")),
      );
    }
    return run(executable, args, options);
  });
  try {
    expect(await runScopedEslint(scratch, [PUBLIC_BOUNDARY_GRAMMAR])).toBe(0);
    expect(seen.some((args) => args.includes(CONSUMER))).toBe(true);
    const cacheFiles = seen
      .filter((args) => args.includes(CONSUMER))
      .flatMap((args) => {
        const index = args.indexOf("--cache-location");
        return index < 0 ? [] : args.slice(index + 1, index + 2);
      });
    expect(cacheFiles).toHaveLength(1);
    const cacheFile = cacheFiles[0];
    if (cacheFile === undefined) {
      throw new Error("native consumer cache identity missing");
    }
    const cached = readFileSync(cacheFile, "utf8");
    seen.length = 0;
    put(
      scratch,
      PUBLIC_BOUNDARY_GRAMMAR,
      `${readFileSync(join(scratch, PUBLIC_BOUNDARY_GRAMMAR), "utf8")}\n// Changed implementation input invalidates the unchanged consumer's native config identity.\n`,
    );
    expect(await runScopedEslint(scratch, [PUBLIC_BOUNDARY_GRAMMAR])).toBe(0);
    expect(seen.some((args) => args.includes(CONSUMER))).toBe(true);
    expect(readFileSync(cacheFile, "utf8")).not.toBe(cached);
    expect(await readEslintFileAdmissions(scratch, "eslint.config.js", [CONSUMER])).toMatchObject([{ path: CONSUMER, compilerConfigs: ["tsconfig.json"] }]);
    seen.length = 0;
    put(scratch, PROVIDER, EXPOSED_PROVIDER_SOURCE);
    expect(await runScopedEslint(scratch, [PROVIDER])).toBe(1);
    expect(seen.some((args) => args.includes(CONSUMER))).toBe(true);
    seen.length = 0;
    put(scratch, "packages/ui/src/unrelated.ts", "export const unrelated=2;");
    expect(await runScopedEslint(scratch, ["packages/ui/src/unrelated.ts"])).toBe(0);
    expect(seen.some((args) => args.includes(CONSUMER))).toBe(false);
    expect(contexts).toEqual(contexts.map(() => ({ root: scratch, configs: ["tsconfig.json"] })));
    expect(contexts.length).toBeGreaterThan(0);
  } finally {
    child.mockRestore();
  }
}, 180_000);

test("unrelated UI edits retain required HARD admission without selecting server declaration consumers", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const snapshots = await import("../../../../tooling/src/verify/lib/config-snapshot.ts");
  const nativeConfig = await import("../../../../tooling/src/verify/ops/config-snapshot.ts");
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const run = proc.runNicedSync;
  const shards: string[][] = [];
  const discovery = vi.spyOn(snapshots, "readDiscoveredPopulation");
  const populations = vi.spyOn(snapshots, "readAdmittedEslintPopulation");
  const admissions = vi.spyOn(nativeConfig, "readEslintFileAdmissions");
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      shards.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
    }
    return run(executable, args, options);
  });
  try {
    put(scratch, "packages/ui/src/unrelated.ts", "export const unrelated=2;");
    expect(await runScopedEslint(scratch, ["packages/ui/src/unrelated.ts"])).toBe(0);
    const [ordinaryConfig, hardConfig] = ["eslint.config.js", "eslint-hard.config.js"] as const;
    const discovered = discovery.mock.calls.map(([, , patterns], index) => ({ config: populations.mock.calls[index]?.[1], patterns }));
    const configured = admissions.mock.calls.map(([, config, paths]) => ({ config, serverConsumer: paths.includes(CONSUMER) }));
    expect(discovered).toEqual([
      { config: ordinaryConfig, patterns: ["."] },
      { config: ordinaryConfig, patterns: ["packages/ui/src/unrelated.ts"] },
    ]);
    expect(configured).toEqual([
      { config: ordinaryConfig, serverConsumer: true },
      { config: hardConfig, serverConsumer: true },
      { config: ordinaryConfig, serverConsumer: false },
    ]);
    expect(shards.some((args) => args.includes(CONSUMER))).toBe(false);
    process.stderr.write(`${JSON.stringify({ event: "native-unrelated-ui-admission", discovered, configured, serverConsumerShard: false })}\n`);
  } finally {
    child.mockRestore();
    admissions.mockRestore();
    populations.mockRestore();
    discovery.mockRestore();
  }
}, 30_000);

test("provider directory edits invalidate a warm native cache and reselect unchanged consumers", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const proc = await import("../../../../tooling/src/floor/process/proc.ts");
  const run = proc.runNicedSync;
  const seen: string[][] = [];
  const child = vi.spyOn(proc, "runNicedSync").mockImplementation((executable, args, options) => {
    const path = args[2];
    if (args[0] === "scripts/eslint.ts" && args[1] === "--args-file" && path !== undefined) {
      seen.push(z.array(z.string()).parse(JSON.parse(readFileSync(path, "utf8"))));
    }
    return run(executable, args, options);
  });
  try {
    expect(await runScopedEslint(scratch, [PROVIDER])).toBe(0);
    expect(seen.some((args) => args.includes(CONSUMER))).toBe(true);
    seen.length = 0;
    put(scratch, PROVIDER, EXPOSED_PROVIDER_SOURCE);
    expect(await runScopedEslint(scratch, ["packages/server/src/infra/"])).toBe(1);
    expect(seen.some((args) => args.includes(CONSUMER))).toBe(true);
    expect(affectsTypedNativeLint("packages/server/src/infra")).toBe(true);
    expect(affectsTypedNativeLint("packages/server/src/infra/")).toBe(true);
  } finally {
    child.mockRestore();
  }
}, 180_000);

test("effective configured worlds preserve a root owner even when a package primary also exists", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  put(scratch, "packages/server/tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, noLib: true, types: [] }, include: ["src"] }));
  expect(await readEslintFileAdmissions(scratch, "eslint.config.js", [CONSUMER])).toMatchObject([{ path: CONSUMER, compilerConfigs: ["tsconfig.json"] }]);
  const primary = join(scratch, "primary");
  fixture(primary, repoRoot);
  put(primary, "packages/server/tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, noLib: true, types: [] }, include: ["src"] }));
  put(
    primary,
    "eslint.config.js",
    readFileSync(join(primary, "eslint.config.js"), "utf8").replace('project:["tsconfig.json"]', 'project:["packages/server/tsconfig.json"]'),
  );
  expect(await readEslintFileAdmissions(primary, "eslint.config.js", [CONSUMER])).toMatchObject([
    { path: CONSUMER, compilerConfigs: ["packages/server/tsconfig.json"] },
  ]);
}, 30_000);

test("workspace dependency addition, retirement and alias retarget follow current manifests and preserve actual ambient inputs", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const entry = TYPED_NATIVE_POLICIES.find((policy) => policy.id === RULE);
  if (entry === undefined) {
    throw new Error("native factory metadata missing");
  }
  const inputs = (): ReturnType<typeof typedNativeDependencyInputs> =>
    typedNativeDependencyInputs(entry, readPolicyRepositoryInventory(scratch).paths, scratch, ["tsconfig.json"]);
  expect(inputs().paths).toContain("ambient.d.ts");
  expect(inputs().roots).toEqual(["packages/server/src/", "packages/kit/src/"]);
  put(scratch, "packages/contracts/package.json", '{"name":"@orb/contracts","type":"module"}');
  put(scratch, "packages/contracts/src/shared.ts", "export interface Shared {readonly value:number}");
  put(scratch, "packages/server/package.json", '{"name":"@orb/server","dependencies":{"selected":"workspace:@orb/contracts@*"}}');
  expect(inputs().roots).toEqual(["packages/server/src/", "packages/contracts/src/"]);
  expect(inputs().paths).not.toContain("packages/kit/src/value.ts");
  put(scratch, "packages/server/package.json", '{"name":"@orb/server"}');
  expect(inputs().roots).toEqual(["packages/server/src/"]);
  put(scratch, "packages/server/package.json", '{"name":"@orb/server","dependencies":{"missing":"workspace:@orb/missing@*"}}');
  expect(inputs).toThrow("unknown or unsupported workspace dependency");
  rmSync(join(scratch, "packages/server/package.json"));
  expect(inputs).toThrow("workspace manifest is missing");
});
