import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node, Project } from "ts-morph";
import { vi } from "vitest";
import { readDeclarationOutput } from "../../../../tooling/src/floor/code-facts/declaration-output.ts";
import { DEFAULT_INVENTORY_FAMILIES } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import {
  beginInventoryWrite,
  latestInventoryGeneration,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { readInventoryDeclarationOutputs, readInventoryReferences } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { extractInventoryPartition } from "../../../../tooling/src/floor/compiler/semantic-inventory-extract.ts";
import { createSemanticWorkspace } from "../../../../tooling/src/floor/compiler/ts-workspace.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { nativeTypeFactSession } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativePolicyFixture, nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

const NODE = "tests/support/node/opaque.fixtures.ts";
const BROWSER = "tests/support/browser/opaque.fixtures.ts";
const PLATFORM = "packages/kit/src/platform.ts";
const POLICY = "no-opaque-test-fixture";

function fixture(root: string, repoRoot: string): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true };
  write("tsconfig.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022"], types: ["node"] }, files: [NODE, PLATFORM] }));
  write("tsconfig.tests-dom.json", JSON.stringify({ compilerOptions: { ...compilerOptions, lib: ["es2022", "dom"], types: [] }, files: [BROWSER, PLATFORM] }));
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: [`src/verify/gates/${POLICY}.ts`] }));
  write(
    `tooling/src/verify/gates/${POLICY}.ts`,
    `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${POLICY}.ts`, import.meta.url).href)};`,
  );
  write(PLATFORM, "export type NativeOutput = ReturnType<typeof setTimeout> extends number ? unknown : string;");
  for (const path of [NODE, BROWSER]) {
    write(path, "import type {NativeOutput} from '../../../packages/kit/src/platform'; export declare function makeOutput():NativeOutput;");
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "both command doors judge fixture output opacity in its native Node or browser program",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot);
    const native = createSemanticWorkspace({ root: scratch });
    expect(
      (
        [
          ["tsconfig.json", NODE],
          ["tsconfig.tests-dom.json", BROWSER],
        ] as const
      ).map(([config, path]) => {
        const source = native.program(config)?.sourceFile(path);
        if (source === undefined) {
          throw new Error("native fixture output owner is missing");
        }
        expect(source.getPreEmitDiagnostics()).toEqual([]);
        return source.getFunctionOrThrow("makeOutput").getReturnType().isUnknown();
      }),
    ).toEqual([false, true]);
    const exits: number[] = [];
    for (const path of [NODE, BROWSER]) {
      exits.push(await nativeVerifyFixture(scratch, "structure", [`--check=${POLICY}`, `--file=${path}`]));
      exits.push(await nativeVerifyFixture(scratch, "scoped", ["--scope", path]));
    }
    expect(exits).toEqual([0, 0, 1, 1]);
  },
  scaledBudget(60_000),
);

test("missing native services and failed workers withhold output judgments through both command doors", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const original = contexts.projectCtx;
  const missing = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
    const { nativeTypeFacts: omitted, ...context } = original(root);
    expect(omitted).toBeDefined();
    return context;
  });
  try {
    expect(await runStructure(scratch, [`--check=${POLICY}`, `--file=${NODE}`])).toBe(2);
    expect(await runScopedCli(scratch, ["--scope", NODE])).toBe(2);
  } finally {
    missing.mockRestore();
  }
  const workers: string[] = [];
  expect(await nativeVerifyFixture(scratch, "structure", [`--check=${POLICY}`, `--file=${NODE}`], { failWorker: true, workers })).toBe(2);
  expect(await nativeVerifyFixture(scratch, "scoped", ["--scope", NODE], { failWorker: true, workers })).toBe(2);
  expect(workers).toEqual(["tsconfig.json", "tsconfig.json"]);
});

test("closed mixed-world demand never reads the syntax checker or starts a reference pass and releases workers before publication", {
  timeout: scaledBudget(60_000),
}, ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  const observed = nativePolicyFixture("outputs-shared", scratch);
  expect(JSON.parse(observed.text)).toMatchObject({
    checkerReads: 0,
    passes: [
      { errors: [], policies: [["success", 1]], effective: [[BROWSER, "NativeOutput"]] },
      { errors: [], policies: [["success", 1]], effective: [[BROWSER, "NativeOutput"]] },
    ],
  });
  expect(observed.requests.map((request) => [request.descriptor.id, request.families])).toEqual([
    ["tsconfig.tests-dom.json", ["declaration-outputs"]],
    ["tsconfig.json", ["declaration-outputs"]],
  ]);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partitions = readInventoryGeneration(db, latestInventoryGeneration(db));
  expect(partitions.map(({ program }) => program)).toEqual(["tsconfig.json", "tsconfig.tests-dom.json"]);
  for (const partition of partitions) {
    const request = observed.requests.find((candidate) => candidate.descriptor.id === partition.program);
    expect(partition.compilerOptionsJson).toBe(JSON.stringify(request?.descriptor.commandLine.options));
    expect(partition.roots).toEqual(request?.descriptor.files.map((path) => join(scratch, path)));
    expect(partition.nativeRoots).toEqual(partition.roots);
    expect(partition.workerPid).toBeDefined();
    expect(partition.workerPid).not.toBe(process.pid);
    expect(() => process.kill(partition.workerPid ?? process.pid, 0)).toThrow(expect.objectContaining({ code: "ESRCH" }));
    expect(() => [...readInventoryReferences(db, partition.id)]).toThrow("family unavailable: references");
  }
});

test("output extraction preserves exact declaration judgments without selecting unrelated families", ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot);
  writeFileSync(
    join(scratch, NODE),
    `
type Opaque=unknown;
function local():unknown{return 0;}
function later():unknown{return 0;} export {later};
const separate:unknown=0; export {separate};
export declare function declared():Opaque;
export const arrow=():Opaque=>0;
export const expression=function():Opaque{return 0;};
export const inferred=local();
export const promise=():Promise<unknown>=>Promise.resolve(0);
export const input=(value:unknown):string=>String(value);
export const loose:any=0;
export const concrete={value:0};
`,
  );
  const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
  if (descriptor === undefined) {
    throw new Error("native fixture descriptor is missing");
  }
  const prototype = Project.prototype.getLanguageService;
  const restore: (() => void)[] = [];
  const observed = new Set<ReturnType<Project["getLanguageService"]>>();
  const service = vi.spyOn(Project.prototype, "getLanguageService").mockImplementation(function (this: Project) {
    const language = prototype.call(this);
    if (!observed.has(language)) {
      observed.add(language);
      const reference = vi.spyOn(language.compilerObject, "createReadonlyReferencePass").mockImplementation(() => {
        throw new Error("output-only extraction started reference work");
      });
      restore.push(() => reference.mockRestore());
    }
    return language;
  });
  try {
    const partition = extractInventoryPartition({ root: scratch, descriptor, families: ["declaration-outputs"], destination: join(scratch, "unused.sqlite") });
    const native = createSemanticWorkspace({ root: scratch }).program(descriptor.id)?.sourceFile(NODE);
    if (native === undefined) {
      throw new Error("native output source is missing");
    }
    expect(native.getPreEmitDiagnostics()).toEqual([]);
    const subjects = native.getDescendants().filter((node) => Node.isFunctionDeclaration(node) || Node.isVariableDeclaration(node));
    const stored = subjects.map(
      (node) =>
        partition.declarationOutputs.find(
          ({ node: span }) => span.file === node.getSourceFile().getFilePath() && span.start === node.getStart() && span.end === node.getEnd(),
        )?.unknown,
    );
    expect(stored).toEqual([null, true, null, true, true, true, true, false, false, false, false]);
    expect(subjects.map(readDeclarationOutput)).toEqual(stored);
    using db = openInventoryDatabase(join(scratch, "output-round-trip.sqlite"));
    beginInventoryWrite(db);
    const generation = publishInventoryGeneration(db, [partition]);
    db.exec("COMMIT");
    const published = readInventoryGeneration(db, generation)[0];
    if (published === undefined) {
      throw new Error("native declaration output partition was not published");
    }
    for (const output of partition.declarationOutputs) {
      expect([...readInventoryDeclarationOutputs(db, published.id, output.node)]).toEqual([output]);
    }
    expect(partition.families).toEqual(["declaration-outputs"]);
    expect([
      partition.references,
      partition.exports,
      partition.modules,
      partition.bindings,
      partition.witnesses,
      partition.runtimeExports,
      partition.shapes,
      partition.pairs,
    ]).toEqual(Array.from({ length: 8 }, () => []));
    expect(DEFAULT_INVENTORY_FAMILIES).not.toContain("declaration-outputs");
  } finally {
    service.mockRestore();
    for (const restoreReference of restore) {
      restoreReference();
    }
  }
});

test("native output rows refuse absent families, spans, wrong worlds, stale sources and disposed sessions", { timeout: scaledBudget(60_000) }, ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot);
  const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json" || id === "tsconfig.tests-dom.json");
  using inventory = nativeInventoryFixture({ root: scratch, programs, families: ["declaration-outputs"] });
  const source = inventory.sourceCorpus().getSourceFile(NODE);
  if (source === undefined) {
    throw new Error("captured native output source is missing");
  }
  const declaration = source.getFunctionOrThrow("makeOutput");
  expect(inventory.declarationOutput(declaration, "tsconfig.json")).toBe(false);
  expect(() => inventory.declarationOutput(declaration, "foreign")).toThrow("partition is unavailable");
  expect(() => inventory.declarationOutput(declaration, "tsconfig.tests-dom.json")).toThrow("source/epoch");
  expect(() => inventory.declarationOutput(declaration.getNameNodeOrThrow(), "tsconfig.json")).toThrow("output span is unavailable");
  using runtime = nativeInventoryFixture({ root: scratch, programs, families: ["runtime-exports"] });
  expect(() => runtime.declarationOutput(declaration, "tsconfig.json")).toThrow("family unavailable: declaration-outputs");
  const acquire = vi.fn((): never => {
    throw new Error("unexpected acquisition");
  });
  using session = nativeTypeFactSession(acquire);
  session.request("owner", { kind: "declaration-outputs", nodes: [declaration] });
  expect(() => session.declarationOutputs("owner", [declaration])).toThrow("must be sealed");
  session.seal(new Set(["owner"]));
  expect(() => session.declarationOutputs("foreign", [declaration])).toThrow("not registered by this owner");
  expect(acquire).not.toHaveBeenCalled();
  session[Symbol.dispose]();
  expect(() => session.declarationOutputs("owner", [declaration])).toThrow("disposed");
  source.replaceWithText("export function makeOutput():unknown{return 0;}");
  const changed = source.getFunctionOrThrow("makeOutput");
  expect(() => inventory.declarationOutput(changed, "tsconfig.json")).toThrow("source/epoch");
  inventory[Symbol.dispose]();
  expect(() => inventory.declarationOutput(changed, "tsconfig.json")).toThrow("disposed");
});

test("output generations pin both worlds, isolate transaction bytes and refuse a changed cross-world snapshot", { timeout: scaledBudget(60_000) }, ({
  scratch,
  repoRoot,
}) => {
  fixture(scratch, repoRoot);
  const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json" || id === "tsconfig.tests-dom.json");
  const options = { root: scratch, programs, families: ["declaration-outputs"] as const };
  const values = (inventory: ReturnType<typeof nativeInventoryFixture>): readonly (boolean | null)[] =>
    (
      [
        [NODE, "tsconfig.json"],
        [BROWSER, "tsconfig.tests-dom.json"],
      ] as const
    ).map(([path, program]) => {
      const declaration = inventory.sourceCorpus().getSourceFile(path)?.getFunctionOrThrow("makeOutput");
      if (declaration === undefined) {
        throw new Error("pinned output declaration is missing");
      }
      return inventory.declarationOutput(declaration, program);
    });
  using previous = nativeInventoryFixture(options);
  expect(values(previous)).toEqual([false, true]);
  using db = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const nextText = "export type NativeOutput=ReturnType<typeof setTimeout> extends number ? string : unknown;";
  using overlay = nativeInventoryFixture(options, { projection: { root: scratch, files: [{ path: join(scratch, PLATFORM), text: nextText }], deleted: [] } });
  expect(values(overlay)).toEqual([true, false]);
  expect(values(previous)).toEqual([false, true]);
  expect(latestInventoryGeneration(db)).toBe(previous.generation);
  overlay[Symbol.dispose]();
  expect(() => values(overlay)).toThrow("disposed");
  writeFileSync(join(scratch, PLATFORM), nextText);
  const faults: string[] = [];
  const published: number[] = [];
  expect(() => nativeInventoryFixture(options, { fault: "declaration-output-race", faults, published })).toThrow("inputs changed during extraction");
  expect(faults).toEqual(["declaration-output-race"]);
  expect(published.length).toBeGreaterThan(0);
  expect(new Set(published)).toEqual(new Set([previous.generation]));
  expect(latestInventoryGeneration(db)).toBe(previous.generation);
  using current = nativeInventoryFixture(options);
  expect(current.generation).toBeGreaterThan(previous.generation);
  expect(values(current)).toEqual([true, false]);
  expect(values(previous)).toEqual([false, true]);
});
