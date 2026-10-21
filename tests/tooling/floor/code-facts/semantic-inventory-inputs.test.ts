import fs, { mkdirSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout } from "node:timers/promises";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { openInventoryDatabase, readInventoryGeneration } from "@orb/tooling/floor/code-facts/semantic-inventory-database";
import { captureInventoryInput, inputsCurrent, inputVersion, inventoryAuthoredFiles } from "@orb/tooling/floor/code-facts/semantic-inventory-inputs";
import { readCompilerPrograms } from "@orb/tooling/floor/compiler/compiler-programs";
import { InMemoryFileSystemHost, Project } from "ts-morph";
import { vi } from "vitest";
import { readInventoryInputs } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { inventoryFileSystem } from "../../../../tooling/src/floor/compiler/semantic-inventory-filesystem.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { initializeNativeInventoryFixture, nativeInventoryFixture } from "../compiler/native-inventory-fixture.ts";

test("bounded native input currentness cold warm edit", { timeout: scaledBudget(240_000) }, ({ scratch }) => {
  initializeNativeInventoryFixture(scratch);
  const options = {
    root: scratch,
    programs: readCompilerPrograms(scratch).filter((program) => program.id === "packages/kit/tsconfig.json"),
    families: ["exports"] as const,
  };
  const coldWorkers: string[] = [];
  const coldStart = performance.now();
  using cold = nativeInventoryFixture(options, { workers: coldWorkers });
  const coldMs = performance.now() - coldStart;
  expect(coldWorkers).toEqual(["packages/kit/tsconfig.json"]);
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const partitions = readInventoryGeneration(database, cold.generation);
  const inputs = partitions.flatMap((partition) => [...readInventoryInputs(database, partition.id)]);
  expect(inputs.length).toBeGreaterThan(0);
  const context = { authored: inventoryAuthoredFiles(scratch) };
  const inputStart = performance.now();
  expect(inputsCurrent(inputs, context)).toBe(true);
  const inputCheckMs = performance.now() - inputStart;
  const warmWorkers: string[] = [];
  const warmStart = performance.now();
  using warm = nativeInventoryFixture(options, { workers: warmWorkers });
  const warmMs = performance.now() - warmStart;
  expect(warmWorkers).toEqual([]);
  expect(warm.generation).toBe(cold.generation);
  const path = join(scratch, "packages/kit/src/base.ts");
  const original = readFileSync(path, "utf8");
  const edited = original.replace("unused=4", "unused=5");
  expect(edited).not.toBe(original);
  writeFileSync(path, edited);
  expect(inputsCurrent(inputs, context)).toBe(false);
  const editWorkers: string[] = [];
  const editStart = performance.now();
  using edit = nativeInventoryFixture(options, { workers: editWorkers });
  const editMs = performance.now() - editStart;
  expect(editWorkers).toEqual(["packages/kit/tsconfig.json"]);
  expect(edit.generation).toBeGreaterThan(warm.generation);
  expect(edit.sourceCorpus().getSourceFile(path)?.getFullText()).toBe(edited);
  expect(cold.sourceCorpus().getSourceFile(path)?.getFullText()).toBe(original);
  console.info(
    JSON.stringify({
      scope: "fixture/packages/kit/tsconfig.json",
      families: options.families,
      inputs: inputs.length,
      coldMs,
      inputCheckMs,
      warmMs,
      editMs,
      coldWorkers,
      warmWorkers,
      editWorkers,
    }),
  );
});

test("native stat observations catch restored timestamps, replacement and physical symlink identity", async ({ scratch }) => {
  const path = join(scratch, "source.ts");
  writeFileSync(path, "export const value=1;");
  const oldTime = new Date("2020-01-01T00:00:00Z");
  utimesSync(path, oldTime, oldTime);
  await setTimeout(1100);
  const input = captureInventoryInput(path, "file");
  expect(input.stat).toBeDefined();
  const before = statSync(path);
  writeFileSync(path, "export const value=2;");
  utimesSync(path, oldTime, oldTime);
  expect(statSync(path)).toMatchObject({ size: before.size, mtimeMs: before.mtimeMs });
  expect(statSync(path).ctimeMs).not.toBe(before.ctimeMs);
  const context = { authored: new Set<string>() };
  expect(inputsCurrent([input], context)).toBe(false);

  const replacement = join(scratch, "replacement.ts");
  const replaced = captureInventoryInput(path, "file");
  writeFileSync(replacement, "export const value=3;");
  utimesSync(replacement, oldTime, oldTime);
  renameSync(replacement, path);
  expect(String(statSync(path).ino)).not.toBe(replaced.stat?.inode);
  expect(inputsCurrent([replaced], context)).toBe(false);

  const alias = join(scratch, "alias.ts");
  const other = join(scratch, "other.ts");
  writeFileSync(other, readFileSync(path));
  symlinkSync(path, alias);
  const linked = captureInventoryInput(alias, "file");
  unlinkSync(alias);
  symlinkSync(other, alias);
  expect(inputsCurrent([linked], context)).toBe(false);
  const sameBytes = captureInventoryInput(path, "file");
  writeFileSync(replacement, readFileSync(path));
  renameSync(replacement, path);
  expect(inputsCurrent([sameBytes], context)).toBe(true);
  expect(sameBytes.version).toBe(inputVersion(path, "file"));
});

test("racy and legacy observations hash then refresh unchanged content into a reusable stat", async ({ scratch }) => {
  const path = join(scratch, "racy.ts");
  writeFileSync(path, "export const value=1;");
  const future = new Date(Date.now() + 10_000);
  utimesSync(path, future, future);
  const input = captureInventoryInput(path, "file");
  expect(input.stat).toBeDefined();
  const refreshes: string[] = [];
  const context = {
    authored: new Set<string>(),
    refresh: (entry: typeof input): void => {
      refreshes.push(JSON.stringify(entry.stat));
    },
  };
  const read = vi.spyOn(fs, "readFileSync");
  syncBuiltinESMExports();
  try {
    expect(inputsCurrent([input], context)).toBe(true);
    expect(inputsCurrent([input], context)).toBe(true);
    expect(read.mock.calls.filter(([file]) => file === path)).toHaveLength(2);
    utimesSync(path, new Date(0), new Date(0));
    await setTimeout(1100);
    read.mockClear();
    expect(inputsCurrent([input], context)).toBe(true);
    expect(read.mock.calls.filter(([file]) => file === path)).toHaveLength(1);
    read.mockClear();
    expect(inputsCurrent([input], context)).toBe(true);
    expect(read.mock.calls.filter(([file]) => file === path)).toHaveLength(0);
    expect(input.version).toBe(inputVersion(path, "file"));
    const legacy = { path, kind: "file" as const, version: input.version };
    read.mockClear();
    expect(inputsCurrent([legacy], context)).toBe(true);
    expect(read.mock.calls.filter(([file]) => file === path)).toHaveLength(1);
    read.mockClear();
    expect(inputsCurrent([legacy], context)).toBe(true);
    expect(read.mock.calls.filter(([file]) => file === path)).toHaveLength(0);
    expect(refreshes.length).toBeGreaterThan(0);
  } finally {
    read.mockRestore();
    syncBuiltinESMExports();
  }
});

test("custom and projected filesystems never borrow native byte identity", ({ scratch }) => {
  const path = join(scratch, "source.ts");
  writeFileSync(path, "export const value=1;");
  const input = captureInventoryInput(path, "file");
  const virtual = new InMemoryFileSystemHost();
  virtual.writeFileSync(path, "export const value=2;");
  expect(inputsCurrent([input], { authored: new Set(), fileSystem: virtual })).toBe(false);
  const overlay = { root: scratch, files: [{ path, text: "export const value=3;" }], deleted: [] };
  const observed = new Map<string, typeof input>();
  const projected = inventoryFileSystem(new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem(), overlay, observed, true);
  expect(inputsCurrent([input], { authored: new Set(), fileSystem: projected })).toBe(false);
  expect(observed.get(`file\0${path}`)?.stat).toBeUndefined();
  const customInputs = new Map<string, typeof input>();
  inventoryFileSystem(virtual, undefined, customInputs).readFileSync(path);
  expect(customInputs.get(`file\0${path}`)?.stat).toBeUndefined();
});

test("a physical edit during content capture cannot attach the successor stat to stale bytes", async ({ scratch }) => {
  const path = join(scratch, "capture.ts");
  writeFileSync(path, "export const value=1;");
  await setTimeout(1100);
  const originalRead = fs.readFileSync;
  const read = vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
    const bytes = originalRead(...args);
    if (args[0] === path) {
      writeFileSync(path, "export const value=2;");
    }
    return bytes;
  });
  syncBuiltinESMExports();
  try {
    const input = captureInventoryInput(path, "file");
    expect(input.stat).toBeUndefined();
    read.mockRestore();
    syncBuiltinESMExports();
    expect(inputsCurrent([input], { authored: new Set() })).toBe(false);
  } finally {
    read.mockRestore();
    syncBuiltinESMExports();
  }
});

test("directory, failed existence and authored membership retain their currentness readers", ({ scratch }) => {
  const directory = join(scratch, "sources");
  mkdirSync(directory);
  const candidate = join(directory, "absent.ts");
  const authored = new Set([candidate]);
  const authoredInput = { path: candidate, kind: "authored" as const, version: inputVersion(candidate, "authored", authored) };
  const inputs = [captureInventoryInput(directory, "directory"), captureInventoryInput(candidate, "exists"), authoredInput];
  expect(inputsCurrent(inputs, { authored })).toBe(true);
  authored.delete(candidate);
  expect(inputsCurrent([authoredInput], { authored })).toBe(false);
  writeFileSync(candidate, "export {};");
  expect(inputsCurrent(inputs.slice(0, 1), { authored })).toBe(false);
  expect(inputsCurrent(inputs.slice(1, 2), { authored })).toBe(false);
});

test("native unchanged input currentness avoids actual byte reads", { timeout: scaledBudget(120_000) }, async ({ scratch }) => {
  initializeNativeInventoryFixture(scratch);
  // Native ctime cannot be authored: let the recording clock leave the creation timestamp's coarse-resolution window.
  await setTimeout(1100);
  const options = {
    root: scratch,
    programs: readCompilerPrograms(scratch).filter((program) => program.id === "packages/kit/tsconfig.json"),
    families: ["exports"] as const,
  };
  using inventory = nativeInventoryFixture(options);
  using database = openInventoryDatabase(join(scratch, ".cache/semantic-inventory.sqlite"));
  const path = join(scratch, "packages/kit/src/base.ts");
  const input = readInventoryGeneration(database, inventory.generation)
    .flatMap((partition) => [...readInventoryInputs(database, partition.id)])
    .find((entry) => entry.path === path && entry.kind === "file");
  expect(input).toBeDefined();
  if (input === undefined) {
    throw new Error("native collector did not observe the source input");
  }
  const original = readFileSync(path, "utf8");
  const context = { authored: inventoryAuthoredFiles(scratch) };
  const read = vi.spyOn(fs, "readFileSync");
  syncBuiltinESMExports();
  try {
    expect(inputsCurrent([input], context)).toBe(true);
    expect.soft(read.mock.calls.filter(([file]) => file === path)).toHaveLength(0);
    read.mockClear();
    writeFileSync(path, original.replace("unused=4", "unused=5"));
    expect(inputsCurrent([input], context)).toBe(false);
    expect(read.mock.calls.filter(([file]) => file === path).length).toBeGreaterThan(0);
  } finally {
    read.mockRestore();
    syncBuiltinESMExports();
  }
});
