import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readAuthoredRepositoryInventory } from "../compiler/authored-repository.ts";
import { readCompilerPrograms } from "../compiler/compiler-programs.ts";
import { isTypeWorldSource } from "../compiler/project-worlds.ts";
import { runInventoryPartitionWorker } from "../compiler/semantic-inventory-worker-run.ts";
import type {
  InventoryBuildRequest,
  InventoryOverlay,
  SemanticInventory,
  SemanticInventoryOptions,
  StoredInventoryPartition,
} from "./semantic-inventory-contract.ts";
import { SemanticInventoryError } from "./semantic-inventory-contract.ts";
import {
  beginInventoryWrite,
  importInventoryPartition,
  inventoryGenerationPrograms,
  latestInventoryGeneration,
  latestInventoryPartitions,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "./semantic-inventory-database.ts";
import { canonicalInventoryPath, contentVersion, descriptorVersion, inputsCurrent } from "./semantic-inventory-inputs.ts";
import { readInventoryInputs } from "./semantic-inventory-queries.ts";
import { inventoryReader } from "./semantic-inventory-reader.ts";

function authoredVersion(root: string): string {
  return contentVersion(JSON.stringify(readAuthoredRepositoryInventory(root).paths));
}

function projectOverlay(options: SemanticInventoryOptions): InventoryOverlay | undefined {
  if (options.overlay === undefined && options.fileSystem === undefined) {
    return;
  }
  const fs = options.fileSystem;
  if (fs === undefined) {
    throw new Error("native inventory overlay requires its transaction filesystem");
  }
  const paths = new Set([...readAuthoredRepositoryInventory(options.root).paths, ...(options.overlay?.addedPaths ?? [])]);
  const deleted = (options.overlay?.deletedPaths ?? []).map((path) => canonicalInventoryPath(resolve(options.root, path)));
  const excluded = new Set(deleted);
  const files = [...paths]
    .filter((path) => isTypeWorldSource(path) || /\.(?:json|[cm]?js)$/u.test(path))
    .map((path) => canonicalInventoryPath(resolve(options.root, path)))
    .filter((path) => !excluded.has(path) && fs.fileExistsSync(path))
    .map((path) => ({ path, text: fs.readFileSync(path) }));
  return { root: options.root, files, deleted };
}

/** Build or reuse a complete native generation under the SQLite writer lock, then pin its immutable facts. */
export function createSemanticInventory(options: SemanticInventoryOptions): SemanticInventory {
  const root = canonicalInventoryPath(options.root);
  const overlay = projectOverlay({ ...options, root });
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-inventory-"));
  const databasePath = overlay === undefined ? (options.databasePath ?? join(root, ".cache", "semantic-inventory.sqlite")) : join(scratch, "overlay.sqlite");
  const db = openInventoryDatabase(databasePath);
  let retained = false;
  let reader: SemanticInventory | undefined;
  try {
    // Holding the writer transaction across extraction makes a racing writer recheck before its first worker.
    beginInventoryWrite(db);
    const initialAuthored = authoredVersion(root);
    const descriptors = currentDemandDescriptors({ ...options, root });
    if (descriptors.length === 0) {
      throw new Error(`native semantic inventory found no runnable TypeScript programs under ${root}`);
    }
    const previous = latestInventoryPartitions(db);
    const { partitions, rebuilt } = demandPartitions({ ...options, root }, descriptors, previous, { db, scratch, overlay });
    assertSnapshotCurrent({ db, options: { ...options, root } }, initialAuthored, descriptors, partitions);
    const samePopulation =
      JSON.stringify(inventoryGenerationPrograms(db, latestInventoryGeneration(db))) ===
      JSON.stringify(partitions.map((partition) => partition.program).toSorted());
    const generation = rebuilt || !samePopulation ? publishInventoryGeneration(db, partitions) : latestInventoryGeneration(db);
    reader = inventoryReader(root, generation, partitions, {
      db,
      dispose: () => {
        db.close();
        rmSync(scratch, { recursive: true, force: true });
      },
    });
    assertSnapshotCurrent({ db, options: { ...options, root } }, initialAuthored, descriptors, partitions);
    db.exec("COMMIT");
    if (overlay === undefined) {
      rmSync(scratch, { recursive: true, force: true });
    }
    retained = true;
    return reader;
  } catch (error) {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    if (reader === undefined) {
      db.close();
    } else {
      reader[Symbol.dispose]();
    }
    throw new SemanticInventoryError(error instanceof Error ? error.message : String(error), { cause: error });
  } finally {
    if (!retained) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

function currentDemandDescriptors(options: SemanticInventoryOptions): readonly InventoryBuildRequest["descriptor"][] {
  const current = readCompilerPrograms(options.root, options.overlay);
  if (options.programs === undefined) {
    return current;
  }
  const nativeById = new Map(current.map((descriptor) => [descriptor.id, descriptor]));
  return options.programs.map((supplied) => {
    const native = nativeById.get(supplied.id);
    if (native === undefined || descriptorVersion(native) !== descriptorVersion(supplied)) {
      throw new Error(`native semantic inventory descriptor snapshot is stale: ${supplied.id}; no current verdict`);
    }
    return native;
  });
}

function buildPartition(
  db: ReturnType<typeof openInventoryDatabase>,
  request: InventoryBuildRequest,
  options: SemanticInventoryOptions,
): StoredInventoryPartition {
  (options.buildPartition ?? runInventoryPartitionWorker)(request);
  let partition: StoredInventoryPartition;
  {
    using staging = openInventoryDatabase(request.destination);
    const extracted = readInventoryGeneration(staging, latestInventoryGeneration(staging));
    const candidate = extracted[0];
    if (extracted.length !== 1 || candidate?.program !== request.descriptor.id || candidate.descriptorVersion !== descriptorVersion(request.descriptor)) {
      throw new Error(`native inventory worker supplied the wrong partition: ${request.descriptor.id}`);
    }
    partition = candidate;
  }
  importInventoryPartition(db, request.destination, partition.id);
  return partition;
}

function demandPartitions(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  previous: ReadonlyMap<string, StoredInventoryPartition>,
  projection: { readonly db: ReturnType<typeof openInventoryDatabase>; readonly scratch: string; readonly overlay: InventoryOverlay | undefined },
): { partitions: StoredInventoryPartition[]; rebuilt: boolean } {
  const root = options.root;
  const { db, scratch, overlay } = projection;
  const partitions: StoredInventoryPartition[] = [];
  let rebuilt = false;
  for (const descriptor of descriptors) {
    const existing = previous.get(descriptor.id);
    if (
      existing !== undefined &&
      existing.descriptorVersion === descriptorVersion(descriptor) &&
      inputsCurrent(readInventoryInputs(db, existing.id), options.fileSystem)
    ) {
      partitions.push(existing);
      continue;
    }
    rebuilt = true;
    partitions.push(
      buildPartition(
        db,
        { root, descriptor, destination: join(scratch, `partition-${String(partitions.length)}.sqlite`), ...(overlay === undefined ? {} : { overlay }) },
        options,
      ),
    );
  }
  return { partitions, rebuilt };
}

function assertSnapshotCurrent(
  context: { readonly db: ReturnType<typeof openInventoryDatabase>; readonly options: SemanticInventoryOptions },
  authored: string,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  partitions: readonly StoredInventoryPartition[],
): void {
  const { db, options } = context;
  if (authoredVersion(options.root) !== authored || partitions.some((partition) => !inputsCurrent(readInventoryInputs(db, partition.id), options.fileSystem))) {
    throw new Error("native semantic inventory inputs changed during extraction; no current verdict");
  }
  if (JSON.stringify(currentDemandDescriptors(options).map(descriptorVersion)) !== JSON.stringify(descriptors.map(descriptorVersion))) {
    throw new Error("native semantic inventory descriptor population changed during extraction; no current verdict");
  }
}
