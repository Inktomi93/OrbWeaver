// Return native execution observations; the ordinary suite asserts them without claiming its own Vite execution was observed.
import childProcess from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { SemanticInventoryOptions } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";

export const NATIVE_IMPLEMENTATION_CASES = [
  "helper-reuse",
  "cached-codec",
  "helper-publication",
  "codec-publication",
  "unrelated-input",
  "subject-overlay",
  "missing-observation",
  "custom-builder",
  "worker-exit",
  "missing-receipt",
  "old-format",
  "late-import",
  "dispose",
  "environment-preload",
  "native-conditions",
  "replay-cached",
  "replay-publication",
  "replay-child-different",
  "replay-after-load",
  "replay-child-late-helper",
] as const;

function refusal(action: () => void): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return String(error);
  }
}

function implementationHelper(mode: string): string {
  if (mode.startsWith("replay-")) {
    return "compiler/semantic-inventory-runtime-replay.ts";
  }
  return ["cached-codec", "codec-publication", "late-import"].includes(mode) ? "code-facts/semantic-inventory-records.ts" : "code-facts/capture-map.ts";
}

function instrumentReplayFault(mode: string, helper: string, original: string, armed: string): void {
  const anchor = "  const outcomes = await resolveRequests(requests);";
  if (original.split(anchor).length !== 2) {
    throw new Error("native replay fault no longer matches its real resolution boundary");
  }
  const late = join(dirname(helper), "replay-late-fixture.ts");
  writeFileSync(late, "export const late=1;\n");
  const intervention =
    mode === "replay-after-load"
      ? "writeFileSync(import.meta.filename,readFileSync(import.meta.filename,'utf8')+'\\n');"
      : `await import(${JSON.stringify(pathToFileURL(late).href)});`;
  writeFileSync(
    helper,
    original
      .replace("mkdtempSync, readFileSync", "existsSync, mkdtempSync, readFileSync")
      .replace(anchor, `${anchor}\nif(existsSync(${JSON.stringify(armed)})){${intervention}}`),
  );
}

async function run(mode: string, implementation: string, root: string): Promise<object> {
  const sourcePath = (path: string): string => join(implementation, "tooling/src/floor", path);
  const moduleURL = (path: string): string => pathToFileURL(sourcePath(path)).href;
  const helper = sourcePath(implementationHelper(mode));
  const original = readFileSync(helper, "utf8");
  if (mode === "late-import") {
    writeFileSync(helper, `${original}\nexport async function inventoryLateFixture(){return import('./inventory-late-fixture.ts');}\n`);
    writeFileSync(sourcePath("code-facts/inventory-late-fixture.ts"), "export const late=1;\n");
  }
  const armed = join(implementation, "replay-armed");
  if (mode === "replay-after-load" || mode === "replay-child-late-helper") {
    instrumentReplayFault(mode, helper, original, armed);
  }
  let intercept = false;
  let injections = 0;
  const workerStatuses: (number | null)[] = [];
  const workerStarts: string[] = [];
  const failed = join(implementation, "failed-worker.mjs");
  writeFileSync(failed, "process.stderr.write('injected native worker exit');process.exitCode=7;\n");
  const spawn = childProcess.spawnSync;
  Object.defineProperty(childProcess, "spawnSync", {
    value: (...args: Parameters<typeof spawn>): ReturnType<typeof spawn> => {
      const worker = args[1]?.find((value) => value.endsWith("semantic-inventory-worker.ts"));
      if (worker !== undefined) {
        workerStarts.push(worker);
      }
      if (intercept && worker !== undefined && mode === "worker-exit") {
        injections++;
        const result = spawn(
          args[0],
          args[1]?.map((value) => (value === worker ? failed : value)),
          args[2],
        );
        workerStatuses.push(result.status);
        return result;
      }
      if (intercept && mode === "replay-child-different" && args[1]?.some((value) => value.endsWith("semantic-inventory-runtime-replay.ts")) === true) {
        injections++;
        writeFileSync(helper, `${original}\n`);
        try {
          const completed = spawn(...args);
          workerStatuses.push(completed.status);
          return completed;
        } finally {
          writeFileSync(helper, original);
        }
      }
      const result = spawn(...args);
      if (intercept && worker !== undefined && ["helper-publication", "codec-publication", "replay-publication"].includes(mode)) {
        injections++;
        workerStatuses.push(result.status);
        writeFileSync(helper, `${original}\n`);
      }
      return result;
    },
  });
  syncBuiltinESMExports();
  const { createSemanticInventory } = (await import(
    moduleURL("code-facts/semantic-inventory.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { openInventoryDatabase, latestInventoryGeneration, readInventoryGeneration } = (await import(
    moduleURL("code-facts/semantic-inventory-database.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  const { readInventoryRuntime } = (await import(
    moduleURL("code-facts/semantic-inventory-runtime-query.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts");
  const { inputVersion } = (await import(
    moduleURL("code-facts/semantic-inventory-inputs.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-inputs.ts");
  const file = join(root, "base.ts");
  const text = readFileSync(file, "utf8");
  const options = { root, families: ["bindings"] as const };
  if (mode === "missing-observation" || mode === "environment-preload") {
    return {
      mode,
      error: refusal(() => {
        using _inventory = createSemanticInventory(options);
      }),
      workerStarts: workerStarts.length,
    };
  }
  using previous = createSemanticInventory(options);
  const corpus = previous.sourceCorpus();
  const initialText = corpus.getSourceFile(file)?.getFullText();
  const previousGeneration = previous.generation;
  const databasePath = join(root, ".cache/semantic-inventory.sqlite");
  workerStarts.length = 0;
  const baseline = { mode, initialTextUnchanged: initialText === text };
  if (mode === "dispose") {
    previous[Symbol.dispose]();
    const error = refusal(() => {
      corpus.getSourceFile(file);
    });
    previous[Symbol.dispose]();
    using database = openInventoryDatabase(databasePath);
    return { ...baseline, error, releasedBusy: database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()?.busy };
  }
  if (mode === "late-import") {
    const loaded = (await import(pathToFileURL(helper).href)) as { readonly inventoryLateFixture: () => Promise<void> };
    await loaded.inventoryLateFixture();
    return {
      ...baseline,
      error: refusal(() => {
        corpus.getSourceFile(file);
      }),
    };
  }
  let error: string | null = null;
  let acceptedGeneration = previousGeneration;
  let newHelperAdmitted = false;
  let customInvoked = false;
  let overlayImplementationReads = 0;
  const acquire = (extra: Partial<Omit<SemanticInventoryOptions, "root">> = {}): void => {
    using current = createSemanticInventory({ ...options, ...extra });
    acceptedGeneration = current.generation;
  };
  switch (mode) {
    case "custom-builder": {
      error = refusal(() =>
        acquire({
          buildPartition: () => {
            customInvoked = true;
          },
        }),
      );
      break;
    }
    case "missing-receipt": {
      using writer = openInventoryDatabase(databasePath);
      writer.exec("DELETE FROM inventory_runtime_header;DELETE FROM inventory_runtime_source;DELETE FROM inventory_runtime_resolution;");
      error = refusal(acquire);
      break;
    }
    case "old-format": {
      using writer = openInventoryDatabase(databasePath);
      const { INVENTORY_FORMAT } = (await import(
        moduleURL("code-facts/semantic-inventory-contract.ts")
      )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts");
      writer.prepare("UPDATE inventory_partition SET format=?").run(INVENTORY_FORMAT - 1);
      writer.prepare("UPDATE inventory_generation SET format=?").run(INVENTORY_FORMAT - 1);
      acquire();
      break;
    }
    case "unrelated-input":
    case "native-conditions": {
      writeFileSync(join(implementation, "unrelated.ts"), "export const unrelated=2;\n");
      acquire();
      break;
    }
    case "subject-overlay": {
      writeFileSync(helper, `${original}\n`);
      const sdk = createRequire(moduleURL("compiler/semantic-inventory-extract.ts")).resolve("ts-morph");
      const { Project } = (await import(pathToFileURL(sdk).href)) as typeof import("ts-morph");
      const fileSystem = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
      const read = fileSystem.readFileSync.bind(fileSystem);
      fileSystem.readFileSync = (path: string, encoding?: string): string => {
        if (path === helper) {
          overlayImplementationReads++;
          return original;
        }
        return read(path, encoding);
      };
      acquire({ fileSystem, overlay: { addedPaths: [], deletedPaths: [] } });
      break;
    }
    case "helper-reuse": {
      writeFileSync(helper, `${original}\n`);
      acquire();
      using database = openInventoryDatabase(databasePath);
      newHelperAdmitted = readInventoryGeneration(database, acceptedGeneration).every((partition) =>
        readInventoryRuntime(database, partition.id, "worker").sources.some(
          (source) => source.path === helper && source.version === inputVersion(helper, "file"),
        ),
      );
      break;
    }
    case "cached-codec":
    case "replay-cached": {
      writeFileSync(helper, `${original}\n`);
      error = refusal(acquire);
      break;
    }
    case "replay-child-different":
    case "replay-after-load":
    case "replay-child-late-helper": {
      writeFileSync(armed, "armed");
      intercept = true;
      error = refusal(acquire);
      break;
    }
    default: {
      writeFileSync(file, `${text}// select a new partition\n`);
      intercept = true;
      error = refusal(acquire);
      break;
    }
  }
  const pinnedUnchanged = corpus.getSourceFile(file)?.getFullText() === text;
  using database = openInventoryDatabase(databasePath);
  const latest = latestInventoryGeneration(database);
  return {
    ...baseline,
    error,
    newGeneration: acceptedGeneration > previousGeneration,
    latestUnchanged: latest === previousGeneration,
    newHelperAdmitted,
    customInvoked,
    overlayImplementationReads,
    injections,
    workerStatuses,
    workerStarts: workerStarts.length,
    pinnedUnchanged,
    maxRssKiB: process.resourceUsage().maxRSS,
  };
}

if (process.argv[1] === import.meta.filename) {
  const mode = process.argv[2];
  const implementation = process.argv[3];
  const root = process.argv[4];
  const resultPath = process.argv[5];
  if (
    mode === undefined ||
    implementation === undefined ||
    root === undefined ||
    resultPath === undefined ||
    !NATIVE_IMPLEMENTATION_CASES.some((value) => value === mode)
  ) {
    throw new Error("native implementation case requires its closed case and parent-owned paths");
  }
  writeFileSync(resultPath, JSON.stringify(await run(mode, implementation, root)));
}
