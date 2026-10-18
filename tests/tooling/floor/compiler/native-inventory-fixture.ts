// The child owns native execution; this process borrows only the exact published SQLite generation for verdict assertions.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type {
  InventoryBuildRequest,
  InventoryFileProjection,
  InventoryOverlay,
  InventoryShapeQuery,
  SemanticInventory,
  SemanticInventoryOptions,
} from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { SemanticInventoryError } from "../../../../tooling/src/floor/code-facts/semantic-inventory-contract.ts";
import { openInventoryDatabase, readInventoryGeneration } from "../../../../tooling/src/floor/code-facts/semantic-inventory-database.ts";
import { acquireInventoryReadLease } from "../../../../tooling/src/floor/code-facts/semantic-inventory-queries.ts";
import { ownedInventoryReader } from "../../../../tooling/src/floor/code-facts/semantic-inventory-reader.ts";
import { runNicedSync } from "../../../../tooling/src/floor/process/proc.ts";
import type { NativeInventoryFault } from "./native-inventory-stage-fault.ts";

const lifetimeSchema = z.object({ transaction: z.boolean(), queryOnly: z.literal(1), existed: z.boolean(), closed: z.boolean(), removed: z.boolean() });
const coverageSchema = z.object({ enumerations: z.number(), declarationPreparations: z.number(), closureLookups: z.number(), closureKeys: z.number() });
export type NativeInventoryLifetime = z.infer<typeof lifetimeSchema>;
export type NativeInventoryCoverage = z.infer<typeof coverageSchema>;

const resultSchema = z.union([
  z.object({
    generation: z.number().int().positive(),
    databasePath: z.string(),
    workers: z.array(z.string()),
    faults: z.array(z.string()),
    requests: z.array(z.string()),
    published: z.array(z.number()),
    lifetime: lifetimeSchema.optional(),
    coverage: coverageSchema.optional(),
    shapeCohort: z.object({ generation: z.number().int().positive(), partitions: z.array(z.string()) }).optional(),
  }),
  z.object({ refusal: z.string(), workers: z.array(z.string()), faults: z.array(z.string()), requests: z.array(z.string()), published: z.array(z.number()) }),
]);

/** Only source data crosses; callbacks and Projects stay with their executing native owner. */
export function nativeInventoryFixture(
  options: Omit<SemanticInventoryOptions, "buildPartition" | "shapePlan" | "overlay" | "fileSystem" | "projectedPaths">,
  observation: {
    readonly failWorker?: boolean;
    readonly workers?: string[];
    readonly faults?: string[];
    readonly fault?: NativeInventoryFault;
    readonly projection?: InventoryFileProjection;
    readonly authoredAddedPaths?: InventoryOverlay["authoredAddedPaths"];
    readonly lifetime?: NativeInventoryLifetime[];
    readonly coverage?: NativeInventoryCoverage[];
    readonly shapeQueries?: readonly InventoryShapeQuery[];
    readonly requests?: InventoryBuildRequest[];
    readonly shapeSources?: readonly string[];
    readonly backups?: string[];
    readonly handoffFault?: "invalid-source-metadata" | "invalid-shape-generation";
    readonly published?: number[];
  } = {},
): SemanticInventory {
  if (["buildPartition", "shapePlan", "overlay", "fileSystem", "projectedPaths"].some((key) => key in options)) {
    throw new Error("native verdict fixture cannot transport executable callbacks or source carriers");
  }
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-inventory-verdict-"));
  let retained = false;
  try {
    const requestPath = join(scratch, "request.json");
    const resultPath = join(scratch, "result.json");
    writeFileSync(
      requestPath,
      JSON.stringify({
        options,
        failWorker: observation.failWorker,
        fault: observation.fault,
        projection: observation.projection,
        authoredAddedPaths: observation.authoredAddedPaths,
        observeCoverage: observation.coverage !== undefined,
        observeRequests: observation.requests !== undefined,
        shapeQueries: observation.shapeQueries,
        shapeSources: observation.shapeSources,
        handoffFault: observation.handoffFault,
      }),
    );
    const entry = fileURLToPath(new URL("./native-inventory-fixture-entry.ts", import.meta.url));
    const bootstrap = fileURLToPath(new URL("../../../../tooling/src/floor/compiler/semantic-inventory-runtime.ts", import.meta.url));
    const completed = runNicedSync(process.execPath, ["--import", bootstrap, entry, requestPath, resultPath]);
    if (completed.status !== 0) {
      throw new Error(`native inventory fixture failed (${String(completed.status)}, ${completed.errorCode ?? "exit"}): ${completed.stderr}`);
    }
    const result = resultSchema.parse(JSON.parse(readFileSync(resultPath, "utf8")));
    observation.workers?.push(...result.workers);
    observation.faults?.push(...result.faults);
    observation.requests?.push(...result.requests.map((value) => JSON.parse(value) as InventoryBuildRequest));
    observation.published?.push(...result.published);
    if ("refusal" in result) {
      throw new SemanticInventoryError(result.refusal);
    }
    if (result.lifetime !== undefined) {
      observation.lifetime?.push(result.lifetime);
      observation.backups?.push(result.databasePath);
    }
    if (result.coverage !== undefined) {
      observation.coverage?.push(result.coverage);
    }
    const db = openInventoryDatabase(result.databasePath);
    try {
      const partitions = readInventoryGeneration(db, result.generation);
      const lease = acquireInventoryReadLease(db, result.generation, partitions);
      const shape = result.shapeCohort;
      if (
        (observation.shapeQueries !== undefined && shape === undefined) ||
        (shape !== undefined &&
          (shape.generation !== result.generation || JSON.stringify(shape.partitions) !== JSON.stringify(lease.partitions.map(({ id }) => id).toSorted())))
      ) {
        lease[Symbol.dispose]();
        throw new Error("native shape fixture handoff differs from its exact published generation lease");
      }
      const reader = ownedInventoryReader(options.root, result.generation, lease, {
        db,
        shapeCohort: shape !== undefined,
        ...(options.moduleTargetQueries === undefined ? {} : { moduleTargetQueries: options.moduleTargetQueries }),
        dispose: () => {
          try {
            db.close();
          } finally {
            rmSync(scratch, { recursive: true, force: true });
          }
        },
      });
      retained = true;
      return reader;
    } catch (error) {
      db.close();
      throw error;
    }
  } finally {
    if (!retained) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}
