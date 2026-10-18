import fs, { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

export const RUNTIME_BATCH_CODEC = "code-facts/semantic-inventory-records.ts";

interface NativeBatchObservation {
  readonly starts: string[];
  readonly requests: string[];
  armed: boolean;
  injections: number;
}

/** Retain the actual submitted requests at the existing native subprocess boundary. */
export function recordNativeBatchRequest(args: readonly string[], mode: string, observation: NativeBatchObservation): void {
  if (mode !== "batch-replay") {
    return;
  }
  const index = args.findIndex((value) => value.endsWith("semantic-inventory-runtime-replay.ts"));
  const request = args[index + 1];
  if (index < 0 || request === undefined) {
    throw new Error("native batch replay request missing");
  }
  observation.requests.push(readFileSync(request, "utf8"));
}

/** A closed source mutation intervenes only after the real replay has returned. */
export function finishNativeBatchReplay(implementation: string, replay: string | undefined, mode: string, observation: NativeBatchObservation): void {
  if (mode === "batch-replay" && replay !== undefined && observation.armed) {
    observation.armed = false;
    observation.injections++;
    const codec = join(implementation, "tooling/src/floor", RUNTIME_BATCH_CODEC);
    writeFileSync(codec, readFileSync(codec, "utf8") + "\n");
  }
}

/** Exercise actual stored receipts and native lookup failures, never a synthesized execution grant. */
export async function runNativeRuntimeBatchCase(
  implementation: string,
  selection: { readonly root: string; readonly databasePath: string; readonly generation: number },
  observation: NativeBatchObservation,
): Promise<object> {
  const { root, databasePath, generation } = selection;
  const url = (file: string): string => pathToFileURL(join(implementation, "tooling/src/floor", file)).href;
  const { inventoryRuntimesCurrent } = (await import(
    url("compiler/semantic-inventory-runtime-current.ts")
  )) as typeof import("../../../../tooling/src/floor/compiler/semantic-inventory-runtime-current.ts");
  const { createSemanticInventory } = (await import(
    url("code-facts/semantic-inventory.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  const { openInventoryDatabase, readInventoryGeneration } = (await import(
    url("code-facts/semantic-inventory-database.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts");
  const { readInventoryRuntime } = (await import(
    url("code-facts/semantic-inventory-runtime-query.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-query.ts");
  const { inventoryRuntimeResolutionSchema } = (await import(
    url("code-facts/semantic-inventory-runtime-contract.ts")
  )) as typeof import("../../../../tooling/src/floor/code-facts/semantic-inventory-runtime-contract.ts");
  using db = openInventoryDatabase(databasePath);
  const partition = readInventoryGeneration(db, generation)[0];
  if (partition === undefined) {
    throw new Error("batch replay partition missing");
  }
  const controller = readInventoryRuntime(db, partition.id, "controller");
  const worker = readInventoryRuntime(db, partition.id, "worker");
  const codec = join(implementation, "tooling/src/floor", RUNTIME_BATCH_CODEC);
  if (!(controller.sources.some((source) => source.path === codec) && worker.sources.some((source) => source.path === codec))) {
    throw new Error("actual shared batch dependency missing");
  }
  const corrupted = structuredClone(controller);
  const missing = corrupted.resolutions.find((request) => request.specifier === "./batch-missing.ts");
  if (missing?.outcome.kind !== "failed") {
    throw new Error("actual failed native lookup missing from batch");
  }
  missing.outcome.code += "_corrupted";
  const descriptor = Object.getOwnPropertyDescriptor(fs, "readFileSync");
  if (descriptor === undefined) {
    throw new Error("native physical read descriptor missing");
  }
  const read = fs.readFileSync;
  let reads = 0;
  Object.defineProperty(fs, "readFileSync", {
    ...descriptor,
    value: (...args: Parameters<typeof read>): ReturnType<typeof read> => {
      if (args[0] === codec) {
        reads++;
      }
      return read(...args);
    },
  });
  syncBuiltinESMExports();
  try {
    observation.starts.length = 0;
    observation.requests.length = 0;
    const current = inventoryRuntimesCurrent([controller, worker, controller]);
    const compatibleLaunches = observation.starts.length;
    const sharedReads = reads;
    const submitted = inventoryRuntimeResolutionSchema.array().parse(JSON.parse(observation.requests[0] ?? "null"));
    const uniqueRequests = !submitted.some((request, ordinal) =>
      submitted
        .slice(0, ordinal)
        .some(
          (previous) =>
            previous.kind === request.kind &&
            previous.mode === request.mode &&
            previous.specifier === request.specifier &&
            isDeepStrictEqual(previous.context, request.context),
        ),
    );
    const missingCopies = submitted.filter((request) => request.specifier === "./batch-missing.ts").length;
    observation.starts.length = 0;
    const independent = inventoryRuntimesCurrent([controller, corrupted, worker]);
    const independentLaunches = observation.starts.length;
    const foreign = { ...controller, nodeOptions: controller.nodeOptions + " --conditions=foreign-fixture" };
    const context = inventoryRuntimesCurrent([foreign, worker]);
    const original = readFileSync(codec, "utf8");
    let after: boolean[];
    observation.armed = true;
    try {
      after = inventoryRuntimesCurrent([controller, worker, controller]);
    } finally {
      observation.armed = false;
      writeFileSync(codec, original);
    }
    observation.starts.length = 0;
    reads = 0;
    const restored = inventoryRuntimesCurrent([controller, worker, controller]);
    const restoredLaunches = observation.starts.length;
    const restoredReads = reads;
    const appeared = join(implementation, "tooling/src/floor/code-facts/batch-missing.ts");
    writeFileSync(appeared, "export const appeared=1;\n");
    const retarget = inventoryRuntimesCurrent([controller]);
    unlinkSync(appeared);
    const helper = worker.sources.find((source) => source.path.endsWith("/code-facts/capture-map.ts"));
    if (helper === undefined) {
      throw new Error("actual batch dependency missing");
    }
    writeFileSync(helper.path, readFileSync(helper.path, "utf8") + "\n");
    const drift = inventoryRuntimesCurrent([worker]);
    using renewed = createSemanticInventory({ root, families: ["bindings"] });
    const fresh = readInventoryGeneration(db, renewed.generation)[0];
    if (fresh === undefined) {
      throw new Error("new actual batch generation missing");
    }
    const next = readInventoryRuntime(db, fresh.id, "worker");
    const versions = inventoryRuntimesCurrent([worker, next]);
    return {
      mode: "batch-replay",
      current,
      compatibleLaunches,
      sharedReads,
      uniqueRequests,
      missingCopies,
      independent,
      independentLaunches,
      context,
      after,
      interventions: observation.injections,
      restored,
      restoredLaunches,
      restoredReads,
      retarget,
      drift,
      versions,
      newGeneration: renewed.generation > generation,
    };
  } finally {
    Object.defineProperty(fs, "readFileSync", descriptor);
    syncBuiltinESMExports();
  }
}
