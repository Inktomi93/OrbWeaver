// @subject tooling/src/floor/compiler/semantic-inventory-runtime.ts
// @subject tooling/src/floor/compiler/semantic-inventory-worker.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { z } from "zod";
import type { InventoryShapeQuery } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { inventoryRuntimeResolutionValue } from "../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import { inheritedProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { NATIVE_IMPLEMENTATION_CASES } from "./native-implementation-cases.ts";
import type { NativeInventoryLifetime } from "./native-inventory-fixture.ts";
import { nativeInventoryFixture } from "./native-inventory-fixture.ts";
import { copyNativeInventoryImplementation, plantNativeControllerDependency } from "./native-inventory-tree.ts";

function oneWorld(root: string, file = "base.ts", text = "export const value=1;export const use=value;\n"): void {
  mkdirSync(root);
  writeFileSync(join(root, ".gitignore"), ".cache/\n");
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ files: [file], compilerOptions: { noLib: true, types: [] } }));
  writeFileSync(join(root, file), text);
  execFixtureGit(root, ["init", "-q"]);
}

const controllerResult = z.object({
  nodeVersion: z.string(),
  generation: z.number().int().positive(),
  controllerLoadedHelper: z.boolean(),
  workerDidNotLoadHelper: z.boolean(),
  executingVersion: z.string(),
  physicalVersion: z.string(),
  text: z.string(),
  physicalText: z.string(),
});

const expected = {
  "helper-reuse": { error: null, newGeneration: true, newHelperAdmitted: true, workerStarts: 1, pinnedUnchanged: true },
  "cached-codec": { error: expect.stringMatching(/controller implementation is stale/u), workerStarts: 0, latestUnchanged: true, pinnedUnchanged: true },
  "helper-publication": {
    error: expect.stringMatching(/implementation changed/u),
    injections: 1,
    workerStatuses: [0],
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
  "codec-publication": {
    error: expect.stringMatching(/implementation changed/u),
    injections: 1,
    workerStatuses: [0],
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
  "unrelated-input": { error: null, workerStarts: 0, newGeneration: false, latestUnchanged: true, pinnedUnchanged: true },
  "subject-overlay": { error: null, workerStarts: 1, overlayImplementationReads: 0, latestUnchanged: true, pinnedUnchanged: true },
  "missing-observation": { error: expect.stringMatching(/pre-import|before observation|unobserved/u), workerStarts: 0 },
  "custom-builder": {
    error: expect.stringMatching(/unobserved partition builder/u),
    customInvoked: false,
    workerStarts: 0,
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
  "worker-exit": {
    error: expect.stringMatching(/injected native worker exit/u),
    injections: 1,
    workerStatuses: [7],
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
  "missing-receipt": { error: null, newGeneration: true, workerStarts: 1, latestUnchanged: false, pinnedUnchanged: true },
  "old-format": { error: null, newGeneration: true, workerStarts: 1, pinnedUnchanged: true },
  "late-import": { error: expect.stringMatching(/graph changed/u), initialTextUnchanged: true },
  dispose: { error: expect.stringMatching(/disposed/u), releasedBusy: 0, initialTextUnchanged: true },
  "environment-preload": { error: expect.stringMatching(/code-loading NODE_OPTIONS/u), workerStarts: 0 },
  "native-conditions": { error: null, workerStarts: 0, newGeneration: false, latestUnchanged: true, pinnedUnchanged: true },
  "native-attributes": {
    jsonMode: "import",
    jsonAttributes: { type: "json" },
    requireMode: "require",
    requireAttributesAbsent: true,
    sameGeneration: true,
    workerStarts: 0,
    pinnedUnchanged: true,
  },
  "replay-no-hook": { error: expect.stringContaining("exactly one native result"), workerStarts: 0, latestUnchanged: true, pinnedUnchanged: true },
  "replay-partial-result": { error: expect.stringContaining("exactly one native result"), workerStarts: 0, latestUnchanged: true, pinnedUnchanged: true },
  "replay-duplicate-result": { error: expect.stringContaining("exactly one native result"), workerStarts: 0, latestUnchanged: true, pinnedUnchanged: true },
  "replay-cached": { error: expect.stringContaining("controller implementation is stale"), workerStarts: 0, latestUnchanged: true, pinnedUnchanged: true },
  "replay-publication": {
    error: expect.stringContaining("implementation changed"),
    injections: 1,
    workerStatuses: [0],
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
  "replay-child-different": {
    error: expect.stringContaining("replay executing graph differs"),
    injections: 1,
    workerStatuses: [0],
    workerStarts: 0,
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
  "replay-after-load": { error: expect.stringContaining("controller implementation is stale"), workerStarts: 0, latestUnchanged: true, pinnedUnchanged: true },
  "replay-child-late-helper": {
    error: expect.stringContaining("replay executing graph differs"),
    workerStarts: 0,
    latestUnchanged: true,
    pinnedUnchanged: true,
  },
} satisfies Record<(typeof NATIVE_IMPLEMENTATION_CASES)[number], object>;

test.for(NATIVE_IMPLEMENTATION_CASES)(
  "native implementation closure preserves %s admission and lifetime",
  { timeout: scaledBudget(120_000) },
  (mode, { scratch, repoRoot }) => {
    const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
    const root = join(scratch, "subject");
    oneWorld(root);
    const entry = fileURLToPath(new URL("./native-implementation-cases.ts", import.meta.url));
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const resultPath = join(scratch, "result.json");
    const preload = mode === "missing-observation" ? [] : ["--import", bootstrap];
    const env = inheritedProcessEnv();
    const opaque = join(scratch, "opaque-preload.mjs");
    writeFileSync(opaque, "export const preloaded=1;\n");
    const options = {
      "environment-preload": `--import=${pathToFileURL(opaque).href}`,
      "native-conditions": "--conditions=inventory-fixture --max-old-space-size=2048",
    };
    const extra = mode in options ? options[mode as keyof typeof options] : "";
    env["NODE_OPTIONS"] = [env["NODE_OPTIONS"], extra].filter(Boolean).join(" ");
    const completed = runNicedSync(process.execPath, [...preload, entry, mode, implementation, root, resultPath], { timeout: scaledBudget(110_000), env });
    expect(completed.errorCode).toBeUndefined();
    expect(completed.status, completed.stderr).toBe(0);
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toMatchObject({ mode, ...expected[mode] });
  },
);

test(
  "fresh parent-only executable drift invalidates reuse even when the worker only loaded its factory module",
  ({ scratch, repoRoot }) => {
    const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
    const root = join(scratch, "subject");
    oneWorld(root);
    const helper = join(implementation, "tooling/src/floor/code-facts/controller-only-fixture.cjs");
    writeFileSync(helper, "module.exports=1;\n");
    plantNativeControllerDependency(implementation, helper);
    const entry = fileURLToPath(new URL("./native-controller-fixture.ts", import.meta.url));
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const firstPath = join(scratch, "first.json");
    const secondPath = join(scratch, "second.json");
    const first = runNicedSync(process.execPath, ["--import", bootstrap, entry, "cold", implementation, root, firstPath, helper], {
      timeout: scaledBudget(110_000),
    });
    expect(first.status, first.stderr).toBe(0);
    const before = controllerResult.parse(JSON.parse(readFileSync(firstPath, "utf8")));
    writeFileSync(helper, `${readFileSync(helper, "utf8")}\n`);
    const second = runNicedSync(process.execPath, ["--import", bootstrap, entry, "cold", implementation, root, secondPath, helper], {
      timeout: scaledBudget(110_000),
    });
    expect(second.status, second.stderr).toBe(0);
    const after = controllerResult.parse(JSON.parse(readFileSync(secondPath, "utf8")));
    expect(before).toMatchObject({ nodeVersion: process.version, controllerLoadedHelper: true, workerDidNotLoadHelper: true });
    expect(after).toMatchObject({ nodeVersion: process.version, controllerLoadedHelper: true, workerDidNotLoadHelper: true, text: before.text });
    expect(before.executingVersion).toBe(before.physicalVersion);
    expect(after.executingVersion).toBe(after.physicalVersion);
    expect(after.executingVersion).not.toBe(before.executingVersion);
    expect(after.generation).toBeGreaterThan(before.generation);
  },
  scaledBudget(240_000),
);

test(
  "one path may be projected subject text without projecting its executing controller bytes",
  ({ scratch, repoRoot }) => {
    const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
    const root = join(scratch, "subject");
    oneWorld(root, "base.cts", "module.exports=1;\n");
    const helper = join(root, "base.cts");
    plantNativeControllerDependency(implementation, helper);
    const entry = fileURLToPath(new URL("./native-controller-fixture.ts", import.meta.url));
    const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
    const resultPath = join(scratch, "result.json");
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "overlay", implementation, root, resultPath, helper], {
      timeout: scaledBudget(110_000),
    });
    expect(completed.status, completed.stderr).toBe(0);
    const observed = controllerResult.parse(JSON.parse(readFileSync(resultPath, "utf8")));
    expect(observed).toMatchObject({
      nodeVersion: process.version,
      controllerLoadedHelper: true,
      workerDidNotLoadHelper: true,
      physicalText: "module.exports=1;\n",
      text: "module.exports=2;\n",
    });
    expect(observed.executingVersion).toBe(observed.physicalVersion);
  },
  scaledBudget(120_000),
);

test.for(["live", "failed-acquisition"] as const)(
  "the native overlay verdict backup retains and releases its historical storage under %s",
  { timeout: scaledBudget(120_000) },
  (mode, { scratch }) => {
    const root = join(scratch, "subject");
    oneWorld(root);
    const backups: string[] = [];
    const lifetime: NativeInventoryLifetime[] = [];
    const options = { root, families: ["exports"] as const };
    const observation = { backups, lifetime, projection: { root, files: [{ path: join(root, "base.ts"), text: "export const projected=2;\n" }], deleted: [] } };
    let refusal: string | undefined;
    let admitted: { readonly exists: boolean; readonly text: string | undefined; readonly disposed: boolean } | undefined;
    try {
      using historical = nativeInventoryFixture(options, {
        ...observation,
        ...(mode === "failed-acquisition" ? { handoffFault: "invalid-source-metadata" as const } : {}),
      });
      const exists = backups.length === 1 && backups.every((path) => existsSync(path));
      const text = historical.sourceCorpus().getSourceFile("base.ts")?.getFullText();
      historical[Symbol.dispose]();
      let disposed = false;
      try {
        historical.sourceCorpus().getSourceFiles();
      } catch (error) {
        disposed = String(error).includes("disposed");
      }
      admitted = { exists, text, disposed };
    } catch (error) {
      refusal = String(error);
    }
    expect(refusal === undefined, refusal).toBe(mode === "live");
    expect(admitted).toEqual(mode === "live" ? { exists: true, text: "export const projected=2;\n", disposed: true } : undefined);
    expect(lifetime).toEqual([{ transaction: true, queryOnly: 1, existed: true, closed: true, removed: true }]);
    expect(backups).toHaveLength(1);
    expect(backups.every((path) => !existsSync(path))).toBe(true);
    expect(readFileSync(join(root, "base.ts"), "utf8")).toBe("export const value=1;export const use=value;\n");
    expect(existsSync(join(root, ".cache/semantic-inventory.sqlite"))).toBe(false);
  },
);

test("historical shape capability refuses a handoff for another published generation", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const root = join(scratch, "subject");
  oneWorld(root);
  expect(() => nativeInventoryFixture({ root, families: ["exports"] }, { shapeQueries: [], handoffFault: "invalid-shape-generation" })).toThrow(
    "native shape fixture handoff differs from its exact published generation lease",
  );
});

test("historical shape handoff retains the child's actual fixed-plan pair coverage and disposal", { timeout: scaledBudget(60_000) }, ({ scratch }) => {
  const root = join(scratch, "subject");
  const text = "export interface Left {value:string} export interface Right {value:string}\n";
  oneWorld(root, "base.ts", text);
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true, skipAddingFilesFromTsConfig: true });
  const source = project.createSourceFile(join(root, "base.ts"), text);
  const span = (name: string): InventoryShapeQuery["left"] => {
    const node = source.getInterfaceOrThrow(name);
    return { file: source.getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
  };
  const query: InventoryShapeQuery = {
    left: span("Left"),
    right: span("Right"),
    leftField: "value",
    rightField: "value",
    projection: "mutual",
    lenient: false,
  };
  using historical = nativeInventoryFixture({ root, families: ["exports"] }, { shapeQueries: [query] });
  expect(historical.shapePair(query)).toEqual([{ program: "tsconfig.json", result: { kind: "answer", values: [true] } }]);
  expect(() => historical.shapePair({ ...query, rightField: "missing" })).toThrow("query coverage is unavailable");
  historical[Symbol.dispose]();
  expect(() => historical.shapePair(query)).toThrow("disposed");
});

test("fresh replay-only source drift rebuilds its real SQLite generation with both executing roles", { timeout: scaledBudget(240_000) }, ({
  scratch,
  repoRoot,
}) => {
  const implementation = copyNativeInventoryImplementation(scratch, repoRoot);
  const root = join(scratch, "subject");
  oneWorld(root);
  const helper = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime-replay.ts");
  const entry = fileURLToPath(new URL("./native-controller-fixture.ts", import.meta.url));
  const bootstrap = join(implementation, "tooling/src/floor/compiler/semantic-inventory-runtime.ts");
  const run = (name: string): z.infer<typeof controllerResult> => {
    const output = join(scratch, `${name}.json`);
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, "cold", implementation, root, output, helper], {
      timeout: scaledBudget(110_000),
    });
    expect(completed.status, completed.stderr).toBe(0);
    return controllerResult.parse(JSON.parse(readFileSync(output, "utf8")));
  };
  const before = run("before");
  writeFileSync(helper, `${readFileSync(helper, "utf8")}\n`);
  const after = run("after");
  expect(before).toMatchObject({ controllerLoadedHelper: true, workerDidNotLoadHelper: false });
  expect(after).toMatchObject({ controllerLoadedHelper: true, workerDidNotLoadHelper: false, text: before.text });
  expect(before.executingVersion).toBe(before.physicalVersion);
  expect(after.executingVersion).toBe(after.physicalVersion);
  expect(after.executingVersion).not.toBe(before.executingVersion);
  expect(after.generation).toBeGreaterThan(before.generation);
});

test("native resolution wire preserves every string attribute and CJS attribute absence", () => {
  expect(inventoryRuntimeResolutionValue({ url: "node:module", format: null, importAttributes: { type: "json", custom: "retained" } })).toStrictEqual({
    kind: "resolved",
    value: { url: "node:module", format: null, importAttributes: { type: "json", custom: "retained" } },
  });
  expect(inventoryRuntimeResolutionValue({ url: "node:module", importAttributes: undefined })).toStrictEqual({
    kind: "resolved",
    value: { url: "node:module" },
  });
});

test("native resolution wire refuses an own undefined attribute instead of losing it through JSON", () => {
  expect(() => inventoryRuntimeResolutionValue({ url: "node:module", importAttributes: { type: undefined } })).toThrow("unsupported value");
});

test("native resolution wire refuses a non-string own attribute without dropping it", () => {
  const attributes = { type: "json" };
  Object.defineProperty(attributes, "custom", { value: 7, enumerable: true });
  expect(() => inventoryRuntimeResolutionValue({ url: "node:module", importAttributes: attributes })).toThrow("unsupported value");
});
