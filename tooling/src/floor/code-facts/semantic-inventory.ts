import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readAuthoredRepositoryInventory } from "../compiler/authored-repository.ts";
import { readCompilerPrograms } from "../compiler/compiler-programs.ts";
import { isTypeWorldSource, predictedProgram } from "../compiler/project-worlds.ts";
import { runInventoryPartitionWorker } from "../compiler/semantic-inventory-worker-run.ts";
import type {
  InventoryBuildRequest,
  InventoryFamily,
  InventoryOverlay,
  InventoryShapeQuery,
  SemanticInventory,
  SemanticInventoryOptions,
  StoredInventoryPartition,
} from "./semantic-inventory-contract.ts";
import { inventoryFamilies, SemanticInventoryError, shapePairKey } from "./semantic-inventory-contract.ts";
import {
  beginInventoryWrite,
  importInventoryPartition,
  latestInventoryGeneration,
  latestInventoryPartitions,
  openInventoryDatabase,
  publishInventoryGeneration,
  readInventoryGeneration,
} from "./semantic-inventory-database.ts";
import { canonicalInventoryPath, contentVersion, descriptorVersion, inputsCurrent, inventoryAuthoredFiles } from "./semantic-inventory-inputs.ts";
import { readInventoryInputs, readInventoryPairs } from "./semantic-inventory-queries.ts";
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
  assertShapeRoot(root, options);
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
    const families = inventoryFamilies(options.families);
    const previous = latestInventoryPartitions(db, families);
    const { partitions, rebuilt } = demandPartitions({ ...options, root }, descriptors, previous, { db, scratch, overlay });
    assertSnapshotCurrent({ db, options: { ...options, root }, overlay }, initialAuthored, descriptors, partitions);
    const samePopulation =
      JSON.stringify(
        readInventoryGeneration(db, latestInventoryGeneration(db))
          .map((partition) => partition.id)
          .toSorted(),
      ) === JSON.stringify(partitions.map((partition) => partition.id).toSorted());
    const generation = rebuilt || !samePopulation ? publishInventoryGeneration(db, partitions) : latestInventoryGeneration(db);
    reader = inventoryReader(root, generation, partitions, {
      db,
      ...shapeReaderContext(options, descriptors, partitions),
      dispose: () => {
        db.close();
        rmSync(scratch, { recursive: true, force: true });
      },
    });
    assertSnapshotCurrent({ db, options: { ...options, root }, overlay }, initialAuthored, descriptors, partitions);
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
  const selected = options.programs.map((supplied) => {
    const native = nativeById.get(supplied.id);
    if (native === undefined || descriptorVersion(native) !== descriptorVersion(supplied)) {
      throw new Error(`native semantic inventory descriptor snapshot is stale: ${supplied.id}; no current verdict`);
    }
    return native;
  });
  return options.shapePlan === undefined ? selected : current;
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
    if (
      extracted.length !== 1 ||
      candidate?.program !== request.descriptor.id ||
      candidate.descriptorVersion !== descriptorVersion(request.descriptor) ||
      candidate.intent !== (request.intent ?? "facts") ||
      (request.intent !== "membership" && inventoryFamilies(request.families).some((family) => !candidate.families.includes(family)))
    ) {
      throw new Error(`native inventory worker supplied the wrong partition: ${request.descriptor.id}`);
    }
    if ((request.shapeQueries?.length ?? 0) > 0) {
      const covered = new Set([...readInventoryPairs(staging, candidate.id)].map(({ query }) => shapePairKey(query)));
      if (request.shapeQueries?.some((query) => !covered.has(shapePairKey(query))) === true) {
        throw new Error(`native inventory worker supplied incomplete pair coverage: ${request.descriptor.id}`);
      }
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
  if (options.shapePlan !== undefined) {
    return demandShapePartitions(options, descriptors, projection);
  }
  const root = options.root;
  const { db, scratch, overlay } = projection;
  const authored = inventoryAuthoredFiles(root, overlay);
  const partitions: StoredInventoryPartition[] = [];
  let rebuilt = false;
  for (const descriptor of descriptors) {
    const existing = previous.get(descriptor.id);
    if (
      existing !== undefined &&
      existing.descriptorVersion === descriptorVersion(descriptor) &&
      inputsCurrent(readInventoryInputs(db, existing.id), { authored, fileSystem: options.fileSystem })
    ) {
      partitions.push(existing);
      continue;
    }
    rebuilt = true;
    partitions.push(
      buildPartition(
        db,
        {
          root,
          descriptor,
          families: inventoryFamilies(options.families),
          destination: join(scratch, `partition-${String(partitions.length)}.sqlite`),
          ...(overlay === undefined ? {} : { overlay }),
        },
        options,
      ),
    );
  }
  return { partitions, rebuilt };
}

function assertSnapshotCurrent(
  context: {
    readonly db: ReturnType<typeof openInventoryDatabase>;
    readonly options: SemanticInventoryOptions;
    readonly overlay: InventoryOverlay | undefined;
  },
  authored: string,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  partitions: readonly StoredInventoryPartition[],
): void {
  const { db, options, overlay } = context;
  const currentAuthored = inventoryAuthoredFiles(options.root, overlay);
  if (
    authoredVersion(options.root) !== authored ||
    partitions.some((partition) => !inputsCurrent(readInventoryInputs(db, partition.id), { authored: currentAuthored, fileSystem: options.fileSystem }))
  ) {
    throw new Error("native semantic inventory inputs changed during extraction; no current verdict");
  }
  if (JSON.stringify(currentDemandDescriptors(options).map(descriptorVersion)) !== JSON.stringify(descriptors.map(descriptorVersion))) {
    throw new Error("native semantic inventory descriptor population changed during extraction; no current verdict");
  }
}

function demandShapePartitions(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  projection: { readonly db: ReturnType<typeof openInventoryDatabase>; readonly scratch: string; readonly overlay: InventoryOverlay | undefined },
): { partitions: StoredInventoryPartition[]; rebuilt: boolean } {
  const { db, scratch, overlay } = projection;
  const plan = options.shapePlan;
  if (plan === undefined) {
    throw new Error("native shape demand has no plan");
  }
  const authored = inventoryAuthoredFiles(options.root, overlay);
  const initialAuthored = authoredVersion(options.root);
  const partitions = new Map<string, StoredInventoryPartition>();
  const previous = latestInventoryPartitions(db);
  let rebuilt = false;
  let worker = 0;
  const acquire = (
    descriptor: InventoryBuildRequest["descriptor"],
    families: readonly InventoryFamily[],
    pairRequests: readonly InventoryShapeQuery[],
  ): void => {
    const existing = partitions.get(descriptor.id) ?? previous.get(descriptor.id);
    const covered =
      existing !== undefined && pairRequests.length > 0 && existing.families.includes("shape-pairs")
        ? new Set([...readInventoryPairs(db, existing.id)].map(({ query }) => shapePairKey(query)))
        : new Set<string>();
    if (
      existing !== undefined &&
      existing.descriptorVersion === descriptorVersion(descriptor) &&
      inputsCurrent(readInventoryInputs(db, existing.id), { authored, fileSystem: options.fileSystem }) &&
      families.every((family) => existing.families.includes(family)) &&
      pairRequests.every((query) => covered.has(shapePairKey(query)))
    ) {
      partitions.set(descriptor.id, existing);
      return;
    }
    const request: InventoryBuildRequest = {
      root: options.root,
      descriptor,
      destination: join(scratch, `shape-${String(worker++)}.sqlite`),
      intent: families.length === 0 ? "membership" : "facts",
      families,
      shapeQueries: pairRequests,
      ...(overlay === undefined ? {} : { overlay }),
    };
    const partition = buildPartition(db, request, options);
    partitions.set(descriptor.id, partition);
    rebuilt = true;
  };
  for (const descriptor of descriptors) {
    acquire(descriptor, [], []);
  }
  const membership = [...partitions.values()];
  const assertCohortCurrent = (): void =>
    assertSnapshotCurrent({ db, options, overlay }, initialAuthored, descriptors, [...membership, ...partitions.values()]);
  assertCohortCurrent();
  const shapeOwners = shapeCatalogOwners(options, descriptors, plan.sources, [...partitions.values()]);
  const catalogs = new Set(shapeOwners.values());
  const baseFor = scalarDemand(options, descriptors);
  for (const descriptor of descriptors) {
    const families = [...new Set([...baseFor(descriptor.id), ...(catalogs.has(descriptor.id) ? (["shape-catalog", "exports"] as const) : [])])].toSorted();
    if (families.length > 0) {
      acquire(descriptor, families, []);
    }
  }
  using catalog = inventoryReader(options.root, 0, [...partitions.values()], { db, shapeOwners, dispose: () => undefined });
  assertCohortCurrent();
  const queries = [...new Map(plan.prepare(catalog).map((query) => [shapePairKey(query), query])).values()];
  for (const descriptor of descriptors) {
    const partition = partitions.get(descriptor.id);
    if (partition === undefined) {
      throw new Error("native membership cohort is incomplete");
    }
    const selected = queries.filter((query) => partition.available.includes(query.left.file) && partition.available.includes(query.right.file));
    if (selected.length > 0) {
      assertCohortCurrent();
      acquire(
        descriptor,
        [
          ...new Set([...baseFor(descriptor.id), ...(catalogs.has(descriptor.id) ? (["shape-catalog", "exports"] as const) : []), "shape-pairs"] as const),
        ].toSorted(),
        selected,
      );
    }
  }
  assertCohortCurrent();
  assertPairCoverage(db, [...partitions.values()], queries);
  return { partitions: [...partitions.values()], rebuilt };
}

function shapeCatalogOwners(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  sources: readonly import("ts-morph").SourceFile[],
  partitions: readonly StoredInventoryPartition[],
): ReadonlyMap<import("ts-morph").SourceFile, string> {
  const owners = new Map<import("ts-morph").SourceFile, string>();
  for (const source of sources) {
    const file = canonicalInventoryPath(source.getFilePath());
    const native = options.shapePlan?.owners?.get(source);
    const declared = descriptors.filter((descriptor) => descriptor.files.some((path) => canonicalInventoryPath(resolve(options.root, path)) === file));
    const predicted = predictedProgram(file.slice(options.root.length + 1));
    const selected =
      native === undefined
        ? (declared.find(({ id }) => id === predicted) ?? (declared.length === 1 ? declared[0] : undefined))
        : descriptors.find((descriptor) => descriptor.id === native.id && descriptorVersion(descriptor) === descriptorVersion(native));
    if (selected === undefined || !partitions.some((partition) => partition.program === selected.id && partition.available.includes(file))) {
      throw new Error("native shape source has no unambiguous catalog owner");
    }
    owners.set(source, selected.id);
  }
  return owners;
}

function scalarDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
): (id: string) => readonly InventoryFamily[] {
  const families = options.families === undefined ? [] : inventoryFamilies(options.families);
  const programs = new Set((options.programs ?? descriptors).map(({ id }) => id));
  return (id) => (programs.has(id) ? families : []);
}

function assertPairCoverage(
  db: ReturnType<typeof openInventoryDatabase>,
  partitions: readonly StoredInventoryPartition[],
  queries: readonly InventoryShapeQuery[],
): void {
  for (const partition of partitions) {
    const selected = queries.filter((query) => partition.available.includes(query.left.file) && partition.available.includes(query.right.file));
    if (selected.length === 0) {
      continue;
    }
    const covered = new Set([...readInventoryPairs(db, partition.id)].map(({ query }) => shapePairKey(query)));
    if (selected.some((query) => !covered.has(shapePairKey(query)))) {
      throw new Error("native shape pair cohort coverage is incomplete");
    }
  }
}

function shapeReaderContext(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  partitions: readonly StoredInventoryPartition[],
): Pick<import("./semantic-inventory-contract.ts").InventoryReaderStorage, "shapeCohort" | "shapeOwners"> {
  return options.shapePlan === undefined
    ? { shapeCohort: false }
    : { shapeCohort: true, shapeOwners: shapeCatalogOwners(options, descriptors, options.shapePlan.sources, partitions) };
}

function assertShapeRoot(root: string, options: SemanticInventoryOptions): void {
  const sources = options.shapePlan?.sources ?? [];
  if (sources.some((source) => !canonicalInventoryPath(source.getFilePath()).startsWith(`${root}/`))) {
    throw new SemanticInventoryError("native shape demand source is outside its explicit repository");
  }
}
