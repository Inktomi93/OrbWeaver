import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { SyntaxKind } from "ts-morph";
import { readAuthoredRepositoryInventory } from "../compiler/authored-repository.ts";
import { readCompilerPrograms } from "../compiler/compiler-programs.ts";
import { assertSemanticAnalysisProgram, isSemanticAnalysisProgram, isTypeWorldSource, predictedProgram } from "../compiler/project-worlds.ts";
import { assertInventoryRuntimeSealed, captureInventoryRuntime, inventoryRuntimeRevision } from "../compiler/semantic-inventory-runtime.ts";
import { inventoryRuntimeCurrent, inventoryRuntimesCurrent } from "../compiler/semantic-inventory-runtime-current.ts";
import { runInventoryPartitionWorker } from "../compiler/semantic-inventory-worker-run.ts";
import type { InventorySchemaDependency } from "./drizzle-inventory-contract.ts";
import { SCHEMA_DATA_CATALOG_KEY, SCHEMA_IDENTITY_CATALOG_KEY, schemaCatalogColumns } from "./drizzle-inventory-contract.ts";
import { schemaDataProjectionSchema } from "./schema-projection-contract.ts";
import type {
  InventoryBuildRequest,
  InventoryExportDeclarationQuery,
  InventoryFamily,
  InventoryInvocationQuery,
  InventoryModuleTargetQuery,
  InventoryOverlay,
  InventoryReadLease,
  InventoryShapeQuery,
  InventorySpan,
  SemanticInventory,
  SemanticInventoryOptions,
  StoredInventoryPartition,
} from "./semantic-inventory-contract.ts";
import {
  drizzleQueryKey,
  exportDeclarationQueryKey,
  INVENTORY_REFERENCE_MODES,
  inventoryFamilies,
  inventoryNodeQueryKey,
  invocationNeedsValueSourceCatalog,
  invocationQueryKey,
  moduleTargetQueryKey,
  moduleTargetQuerySchema,
  referenceQueryKey,
  SemanticInventoryError,
  shapePairKey,
} from "./semantic-inventory-contract.ts";
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
import {
  acquireInventoryReadLease,
  hasInventoryInvocationCoverage,
  readInventoryBrands,
  readInventoryCallableDeclarations,
  readInventoryComputedNames,
  readInventoryDrizzleCall,
  readInventoryExportDeclarations,
  readInventoryGlobalBindings,
  readInventoryGlobalOrigins,
  readInventoryInputs,
  readInventoryModules,
  readInventoryPairs,
  readInventoryReferenceQueries,
  readInventorySchemaData,
  readInventorySchemaIdentity,
} from "./semantic-inventory-queries.ts";
import { inventoryReader, ownedInventoryReader, validateInventoryReaderSources } from "./semantic-inventory-reader.ts";
import { inventoryStringSchema } from "./semantic-inventory-records.ts";
import type { InventoryRuntime } from "./semantic-inventory-runtime-contract.ts";
import { readInventoryRuntime } from "./semantic-inventory-runtime-query.ts";
import { hasTypeObservationValueDemand } from "./type-observations-contract.ts";

function authoredVersion(root: string): string {
  return contentVersion(JSON.stringify(readAuthoredRepositoryInventory(root).paths));
}

function projectOverlay(options: SemanticInventoryOptions): InventoryOverlay | undefined {
  if (options.overlay === undefined && options.fileSystem === undefined && options.projectedPaths === undefined) {
    return;
  }
  const fs = options.fileSystem;
  if (fs === undefined) {
    throw new Error("native inventory overlay requires its transaction filesystem");
  }
  const paths = [...readAuthoredRepositoryInventory(options.root).paths, ...(options.overlay?.addedPaths ?? []), ...(options.projectedPaths ?? [])];
  const deleted = (options.overlay?.deletedPaths ?? []).map((path) => canonicalInventoryPath(resolve(options.root, path)));
  const excluded = new Set(deleted);
  // A virtual realpath can retain its lexical alias; changing that key changes bytes and native input identity.
  const files = [...new Set(paths.filter((path) => isTypeWorldSource(path) || /\.(?:json|[cm]?js)$/u.test(path)).map((path) => resolve(options.root, path)))]
    .filter((path) => !excluded.has(canonicalInventoryPath(path)) && fs.fileExistsSync(path))
    .map((path) => ({ path, text: fs.readFileSync(path) }));
  const authoredAddedPaths = [...new Set((options.overlay?.addedPaths ?? []).map((path) => canonicalInventoryPath(resolve(options.root, path))))];
  return { root: options.root, files, deleted, authoredAddedPaths };
}

function moduleTargetOptions(rawOptions: SemanticInventoryOptions): SemanticInventoryOptions {
  return rawOptions.moduleTargetQueries === undefined
    ? rawOptions
    : {
        ...rawOptions,
        moduleTargetQueries: rawOptions.moduleTargetQueries.map((entry) => ({ program: entry.program, query: moduleTargetQuerySchema.parse(entry.query) })),
      };
}
function assertObservedImplementation(options: SemanticInventoryOptions): void {
  try {
    if (!inventoryRuntimeCurrent(captureInventoryRuntime([import.meta.url]))) {
      throw new Error("native inventory executing controller implementation is stale");
    }
    if (options.buildPartition !== undefined && options.buildPartition !== runInventoryPartitionWorker) {
      throw new Error("native inventory cannot admit an unobserved partition builder");
    }
  } catch (error) {
    throw inventoryFailure(error, false);
  }
}

/** Build or reuse a complete native generation under the SQLite writer lock, then pin its immutable facts. */
export function createSemanticInventory(rawOptions: SemanticInventoryOptions): SemanticInventory {
  assertObservedImplementation(rawOptions);
  const options = moduleTargetOptions(rawOptions);
  const root = canonicalInventoryPath(options.root);
  assertShapeRoot(root, options);
  const overlay = projectOverlay({ ...options, root });
  const scratch = mkdtempSync(join(tmpdir(), "orb-native-inventory-"));
  const databasePath = overlay === undefined ? (options.databasePath ?? join(root, ".cache", "semantic-inventory.sqlite")) : join(scratch, "overlay.sqlite");
  const db = openInventoryDatabase(databasePath);
  let retained = false;
  let writerCommitted = false;
  let reader: SemanticInventory | undefined;
  let lease: InventoryReadLease | undefined;
  try {
    // Holding the writer transaction across extraction makes a racing writer recheck before its first worker.
    beginInventoryWrite(db);
    const initialAuthored = authoredVersion(root);
    const descriptors = currentDemandDescriptors({ ...options, root });
    if (descriptors.length === 0) {
      throw new Error(`native semantic inventory found no runnable TypeScript programs eligible for semantic analysis under ${root}`);
    }
    const families = inventoryFamilies(options.families);
    assertReferenceDemand(options, descriptors, families);
    assertExportDemand(options, descriptors, families);
    assertModuleDemand(options, descriptors, families);
    assertCallableDemand(options, descriptors, families);
    assertComputedDemand(options, descriptors, families);
    assertIdBrandDemand(options, descriptors, families);
    assertGlobalDemand(options, descriptors, families);
    assertInvocationDemand(options, descriptors, families);
    assertDrizzleDemand(options, descriptors, families);
    const previous = latestInventoryPartitions(db, families);
    const { partitions, rebuilt } = demandPartitions({ ...options, root }, descriptors, previous, { db, scratch, overlay });
    assertReferenceCohort(db, options, descriptors, partitions);
    assertDrizzleCohort(db, options, partitions);
    assertModuleCohort(db, options, partitions);
    assertSnapshotCurrent({ db, options: { ...options, root }, overlay }, initialAuthored, descriptors, partitions);
    const samePopulation =
      JSON.stringify(
        readInventoryGeneration(db, latestInventoryGeneration(db))
          .map((partition) => partition.id)
          .toSorted(),
      ) === JSON.stringify(partitions.map((partition) => partition.id).toSorted());
    const published = rebuilt || !samePopulation;
    const generation = published ? publishInventoryGeneration(db, partitions) : latestInventoryGeneration(db);
    validateInventoryReaderSources(db, partitions);
    shapeReaderContext(options, descriptors, partitions);
    // A pure-reuse acquisition ran no worker and published nothing, so it is a snapshot as of the
    // assertSnapshotCurrent check above; its readers still admit every source epoch on read. Only an
    // extraction or publication needs the later rechecks.
    const recheckPublication = publicationRecheck(published, () => {
      assertSnapshotCurrent({ db, options: { ...options, root }, overlay }, initialAuthored, descriptors, partitions);
    });
    recheckPublication();
    db.exec("COMMIT");
    writerCommitted = true;
    lease = acquireInventoryReadLease(db, generation, partitions);
    let implementation: InventoryRuntime | undefined;
    let implementationRevision = -1;
    reader = ownedInventoryReader(root, generation, lease, {
      db,
      assertImplementation: () => {
        const current = inventoryRuntimeRevision();
        if (implementation !== undefined && current !== implementationRevision) {
          assertInventoryRuntimeSealed(implementation);
          implementationRevision = current;
        }
      },
      ...(options.moduleTargetQueries === undefined ? {} : { moduleTargetQueries: options.moduleTargetQueries }),
      ...shapeReaderContext(options, descriptors, lease.partitions),
      dispose: () => {
        implementation = undefined;
        db.close();
        rmSync(scratch, { recursive: true, force: true });
      },
    });
    implementation = captureInventoryRuntime([import.meta.url]);
    recheckPublication();
    assertInventoryRuntimeSealed(implementation);
    implementationRevision = inventoryRuntimeRevision();
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
      lease?.[Symbol.dispose]();
      db.close();
    } else {
      reader[Symbol.dispose]();
    }
    throw inventoryFailure(error, writerCommitted);
  } finally {
    if (!retained) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}

function publicationRecheck(published: boolean, check: () => void): () => void {
  return published ? check : (): void => undefined;
}

function inventoryFailure(error: unknown, writerCommitted: boolean): SemanticInventoryError {
  const message = error instanceof Error ? error.message : String(error);
  return new SemanticInventoryError(writerCommitted ? `native inventory read acquisition failed: ${message}` : message, { cause: error });
}

function currentDemandDescriptors(options: SemanticInventoryOptions): readonly InventoryBuildRequest["descriptor"][] {
  const current = readCompilerPrograms(options.root, options.overlay).filter(({ config }) => isSemanticAnalysisProgram(config));
  if (options.programs === undefined) {
    return current;
  }
  const nativeById = new Map(current.map((descriptor) => [descriptor.id, descriptor]));
  const selected = options.programs.map((supplied) => {
    assertSemanticAnalysisProgram(supplied.config);
    const native = nativeById.get(supplied.id);
    if (native === undefined || descriptorVersion(native) !== descriptorVersion(supplied)) {
      throw new Error(`native semantic inventory descriptor snapshot is stale: ${supplied.id}; no current verdict`);
    }
    return native;
  });
  return options.shapePlan === undefined ? selected : current;
}

function assertBuiltModuleCoverage(
  staging: ReturnType<typeof openInventoryDatabase>,
  candidate: StoredInventoryPartition,
  request: InventoryBuildRequest,
): void {
  if (!coversModuleDemand(staging, candidate, request.moduleTargetQueries ?? [])) {
    throw new Error(`native inventory worker supplied incomplete contextual module coverage: ${request.descriptor.id}`);
  }
}
function workerPartition(extracted: readonly StoredInventoryPartition[], request: InventoryBuildRequest): StoredInventoryPartition {
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
  return candidate;
}

function buildPartition(
  db: ReturnType<typeof openInventoryDatabase>,
  request: InventoryBuildRequest,
  options: SemanticInventoryOptions,
): StoredInventoryPartition {
  runInventoryPartitionWorker(request, true);
  let partition: StoredInventoryPartition;
  {
    using staging = openInventoryDatabase(request.destination);
    const extracted = readInventoryGeneration(staging, latestInventoryGeneration(staging));
    const candidate = workerPartition(extracted, request);
    if (!partitionImplementationsCurrent(staging, [candidate])) {
      throw new Error("native inventory worker implementation changed before publication");
    }
    if ((request.shapeQueries?.length ?? 0) > 0) {
      const covered = new Set([...readInventoryPairs(staging, candidate.id)].map(({ query }) => shapePairKey(query)));
      if (request.shapeQueries?.some((query) => !covered.has(shapePairKey(query))) === true) {
        throw new Error(`native inventory worker supplied incomplete pair coverage: ${request.descriptor.id}`);
      }
    }
    if (!coversCallableDemand(staging, candidate, request.callableQueries ?? [])) {
      throw new Error(`native inventory worker supplied incomplete callable coverage: ${request.descriptor.id}`);
    }
    if (!coversComputedDemand(staging, candidate, request.computedNameQueries ?? [])) {
      throw new Error(`native inventory worker supplied incomplete computed-name coverage: ${request.descriptor.id}`);
    }
    assertIdBrandCoverage(staging, candidate, request);
    assertBuiltModuleCoverage(staging, candidate, request);
    if (!coversGlobalDemand(staging, candidate, request)) {
      throw new Error(`native inventory worker supplied incomplete global-origin/binding coverage: ${request.descriptor.id}`);
    }
    if (!coversReferenceDemand(staging, candidate, request.referenceDemand)) {
      throw new Error(`native inventory worker supplied incomplete reference coverage: ${request.descriptor.id}`);
    }
    assertExportCoverage(staging, candidate, request);
    assertInvocationCoverage(staging, candidate, request);
    assertDrizzleCoverage(staging, candidate, request, options);
    partition = candidate;
  }
  importInventoryPartition(db, request.destination, partition.id);
  return partition;
}

function partitionImplementationsCurrent(
  db: ReturnType<typeof openInventoryDatabase>,
  partitions: readonly StoredInventoryPartition[],
  additional: readonly InventoryRuntime[] = [],
): boolean {
  const controllerRoots = [new URL("../compiler/semantic-inventory-worker-run.ts", import.meta.url).href, import.meta.url];
  const currentController = captureInventoryRuntime(controllerRoots);
  const bootstrap = new URL("../compiler/semantic-inventory-runtime.ts", import.meta.url).href;
  const runtimes: InventoryRuntime[] = [];
  for (const partition of partitions) {
    if (db.prepare("SELECT 1 FROM inventory_runtime_header WHERE partition=?").get(partition.id) === undefined) {
      return false;
    }
    const worker = readInventoryRuntime(db, partition.id, "worker");
    const controller = readInventoryRuntime(db, partition.id, "controller");
    if (
      !(
        worker.roots.length === 1 &&
        worker.roots[0] === new URL("../compiler/semantic-inventory-worker.ts", import.meta.url).href &&
        worker.bootstrap === bootstrap &&
        controller.bootstrap === bootstrap &&
        JSON.stringify(controller) === JSON.stringify(currentController)
      )
    ) {
      return false;
    }
    runtimes.push(controller, worker);
  }
  return inventoryRuntimesCurrent([...runtimes, ...additional]).every((current) => current);
}

function uniquePartitions(partitions: readonly StoredInventoryPartition[]): StoredInventoryPartition[] {
  const unique = new Map<string, StoredInventoryPartition>();
  for (const partition of partitions) {
    const previous = unique.get(partition.id);
    if (previous !== undefined && !isDeepStrictEqual(previous, partition)) {
      throw new Error("native inventory partition identity has conflicting metadata");
    }
    unique.set(partition.id, partition);
  }
  return [...unique.values()];
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
  for (const descriptor of catalogFirst(options, descriptors)) {
    const nativeDemand = withSchemaDependency(db, options, partitions, nativeDemandRequest(options, descriptor.id, inventoryFamilies(options.families)));
    const existing = previous.get(descriptor.id);
    if (
      existing !== undefined &&
      existing.descriptorVersion === descriptorVersion(descriptor) &&
      inputsCurrent(readInventoryInputs(db, existing.id), { authored, fileSystem: options.fileSystem }) &&
      partitionImplementationsCurrent(db, [existing]) &&
      coversNativeDemand(db, existing, nativeDemand)
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
          ...nativeDemand,
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
  const unique = uniquePartitions(partitions);
  if (
    authoredVersion(options.root) !== authored ||
    unique.some((partition) => !inputsCurrent(readInventoryInputs(db, partition.id), { authored: currentAuthored, fileSystem: options.fileSystem })) ||
    !partitionImplementationsCurrent(db, unique, [captureInventoryRuntime([import.meta.url])])
  ) {
    throw new Error("native semantic inventory inputs changed during extraction; no current verdict");
  }
  if (JSON.stringify(currentDemandDescriptors(options).map(descriptorVersion)) !== JSON.stringify(descriptors.map(descriptorVersion))) {
    throw new Error("native semantic inventory descriptor population changed during extraction; no current verdict");
  }
}

function assertDrizzleCohort(
  db: ReturnType<typeof openInventoryDatabase>,
  options: SemanticInventoryOptions,
  partitions: readonly StoredInventoryPartition[],
): void {
  for (const partition of partitions) {
    const demand = withSchemaDependency(db, options, partitions, nativeDemandRequest(options, partition.program, partition.families));
    if (
      !(
        coversDrizzleDemand(db, partition, demand) &&
        coversInvocationDemand(
          db,
          partition,
          demand.invocationQueries?.filter((query) => query.mode === "observations" || invocationNeedsValueSourceCatalog(query)) ?? [],
          demand.schemaDependency ?? null,
        )
      )
    ) {
      throw new Error("native Drizzle catalog/consumer dependency changed before publication");
    }
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
    const nativeDemand = withSchemaDependency(db, options, [...partitions.values()], nativeDemandRequest(options, descriptor.id, families));
    const existing = partitions.get(descriptor.id) ?? previous.get(descriptor.id);
    const covered =
      existing !== undefined && pairRequests.length > 0 && existing.families.includes("shape-pairs")
        ? new Set([...readInventoryPairs(db, existing.id)].map(({ query }) => shapePairKey(query)))
        : new Set<string>();
    if (
      existing !== undefined &&
      existing.descriptorVersion === descriptorVersion(descriptor) &&
      inputsCurrent(readInventoryInputs(db, existing.id), { authored, fileSystem: options.fileSystem }) &&
      partitionImplementationsCurrent(db, [existing]) &&
      families.every((family) => existing.families.includes(family)) &&
      pairRequests.every((query) => covered.has(shapePairKey(query))) &&
      coversNativeDemand(db, existing, nativeDemand)
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
      ...nativeDemand,
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
  for (const descriptor of catalogFirst(options, descriptors)) {
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
  reconcileDrizzleShapeDemand({ options, descriptors, partitions, queries, acquire, assertCurrent: assertCohortCurrent });
  return { partitions: [...partitions.values()], rebuilt };
}

function reconcileDrizzleShapeDemand(context: {
  readonly options: SemanticInventoryOptions;
  readonly descriptors: readonly InventoryBuildRequest["descriptor"][];
  readonly partitions: ReadonlyMap<string, StoredInventoryPartition>;
  readonly queries: readonly InventoryShapeQuery[];
  readonly acquire: (descriptor: InventoryBuildRequest["descriptor"], families: readonly InventoryFamily[], queries: readonly InventoryShapeQuery[]) => void;
  readonly assertCurrent: () => void;
}): void {
  const { options, descriptors, partitions, queries, acquire } = context;
  if (options.schemaQuery === undefined && options.schemaDataQuery === undefined) {
    return;
  }
  // Pair acquisition may replace the catalog partition; consumers must join that final candidate, not its predecessor.
  for (const descriptor of catalogFirst(options, descriptors)) {
    const partition = partitions.get(descriptor.id);
    if (partition === undefined) {
      throw new Error("native Drizzle/shape cohort is incomplete");
    }
    const selected = queries.filter((query) => partition.available.includes(query.left.file) && partition.available.includes(query.right.file));
    acquire(descriptor, partition.families, selected);
  }
  context.assertCurrent();
}

function assertDrizzleCoverage(
  db: ReturnType<typeof openInventoryDatabase>,
  candidate: StoredInventoryPartition,
  request: InventoryBuildRequest,
  options: SemanticInventoryOptions,
): void {
  if (!coversDrizzleDemand(db, candidate, request)) {
    throw new Error(`native inventory worker supplied incomplete Drizzle coverage: ${request.descriptor.id}`);
  }
  if (
    request.schemaDependency !== undefined &&
    !inputsCurrent(request.schemaDependency.inputs, { authored: inventoryAuthoredFiles(options.root, request.overlay), fileSystem: options.fileSystem })
  ) {
    throw new Error("native Drizzle catalog inputs changed before consumer acceptance");
  }
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

function assertReferenceCohort(
  db: ReturnType<typeof openInventoryDatabase>,
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  partitions: readonly StoredInventoryPartition[],
): void {
  const familiesFor =
    options.shapePlan === undefined ? (): readonly InventoryFamily[] => inventoryFamilies(options.families) : scalarDemand(options, descriptors);
  for (const partition of partitions) {
    if (familiesFor(partition.program).includes("references") && !coversReferenceDemand(db, partition, referenceDemand(options, partition.program))) {
      throw new SemanticInventoryError("native reference demand changed before publication");
    }
  }
}

function referenceDemand(options: SemanticInventoryOptions, program: string): NonNullable<InventoryBuildRequest["referenceDemand"]> {
  return {
    mode: options.referenceDemand?.mode ?? "complete",
    queries: [
      ...new Map(
        (options.referenceDemand?.queries ?? [])
          .filter((query) => query.program === program)
          .map(({ root, node }) => [referenceQueryKey({ root, node }), { root, node }]),
      ).values(),
    ],
  };
}
function assertReferenceDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  const demand = options.referenceDemand;
  if (
    demand !== undefined &&
    (!(families.includes("references") && INVENTORY_REFERENCE_MODES.includes(demand.mode)) ||
      demand.queries.some((query) => !descriptors.some((descriptor) => descriptor.id === query.program)))
  ) {
    throw new SemanticInventoryError("native reference demand requires exact admitted compiler programs and reference-family ownership");
  }
}
function coversReferenceDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  demand: InventoryBuildRequest["referenceDemand"],
): boolean {
  if (demand === undefined) {
    return true;
  }
  if (partition.referenceMode !== demand.mode) {
    return false;
  }
  const queries = [...readInventoryReferenceQueries(db, partition.id)].map((entry) => referenceQueryKey({ root: entry.root, node: entry.query }));
  return JSON.stringify(queries) === JSON.stringify(demand.queries.map((pair) => referenceQueryKey(pair)));
}

function exportDemand(options: SemanticInventoryOptions, program: string): readonly InventoryExportDeclarationQuery[] {
  return [
    ...new Map(
      (options.exportQueries ?? []).filter((query) => query.program === program).map(({ query }) => [exportDeclarationQueryKey(query), query]),
    ).values(),
  ];
}
function coversExportDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  queries: readonly InventoryExportDeclarationQuery[],
): boolean {
  return queries.every((query) => [...readInventoryExportDeclarations(db, partition.id, query)].length === 1);
}
function assertExportDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  if (
    (options.exportQueries ?? []).some((query) => !descriptors.some((descriptor) => descriptor.id === query.program)) ||
    (options.exportQueries !== undefined && !families.includes("export-declarations")) ||
    (families.includes("export-declarations") && options.exportQueries === undefined)
  ) {
    throw new Error("native export declarations require closed source/name demand in admitted native programs");
  }
}

function callableDemand(options: SemanticInventoryOptions, program: string): readonly InventorySpan[] {
  return [
    ...new Map((options.callableQueries ?? []).filter((query) => query.program === program).map(({ node }) => [inventoryNodeQueryKey(node), node])).values(),
  ];
}

function coversCallableDemand(db: ReturnType<typeof openInventoryDatabase>, partition: StoredInventoryPartition, queries: readonly InventorySpan[]): boolean {
  return queries.every((query) => [...readInventoryCallableDeclarations(db, partition.id, query)].length === 1);
}

function assertCallableDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  if (
    (options.callableQueries ?? []).some((query) => !descriptors.some((descriptor) => descriptor.id === query.program)) ||
    (options.callableQueries !== undefined && !families.includes("callable-declarations")) ||
    (families.includes("callable-declarations") && options.callableQueries === undefined)
  ) {
    throw new Error("native callable declarations require closed demand in admitted native programs");
  }
}

function computedDemand(options: SemanticInventoryOptions, program: string): readonly InventorySpan[] {
  return [
    ...new Map(
      (options.computedNameQueries ?? []).filter((query) => query.program === program).map(({ node }) => [inventoryNodeQueryKey(node), node]),
    ).values(),
  ];
}

function coversComputedDemand(db: ReturnType<typeof openInventoryDatabase>, partition: StoredInventoryPartition, queries: readonly InventorySpan[]): boolean {
  return queries.every((query) => [...readInventoryComputedNames(db, partition.id, query)].length === 1);
}

function assertComputedDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  if (
    (options.computedNameQueries ?? []).some((query) => !descriptors.some((descriptor) => descriptor.id === query.program)) ||
    (options.computedNameQueries !== undefined && !families.includes("computed-names")) ||
    (families.includes("computed-names") && options.computedNameQueries === undefined)
  ) {
    throw new Error("native computed names require closed demand in admitted native programs");
  }
}

function moduleDemand(options: SemanticInventoryOptions, program: string): readonly InventoryModuleTargetQuery[] {
  return [
    ...new Map(
      (options.moduleTargetQueries ?? []).filter((entry) => entry.program === program).map((entry) => [moduleTargetQueryKey(entry.query), entry.query]),
    ).values(),
  ];
}
function moduleDemandOptions(
  options: SemanticInventoryOptions,
  program: string,
  families: readonly InventoryFamily[],
): Pick<InventoryBuildRequest, "moduleTargetQueries"> {
  return families.includes("modules") && options.moduleTargetQueries !== undefined ? { moduleTargetQueries: moduleDemand(options, program) } : {};
}
function assertModuleDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  if (options.moduleTargetQueries !== undefined && !families.includes("modules")) {
    throw new Error("native contextual module demand requires modules family");
  }
  for (const entry of options.moduleTargetQueries ?? []) {
    moduleTargetQuerySchema.parse(entry.query);
    if (
      !descriptors.some(
        (descriptor) =>
          descriptor.id === entry.program && descriptor.files.some((file) => canonicalInventoryPath(resolve(options.root, file)) === entry.query.importer.file),
      )
    ) {
      throw new Error("native contextual module demand has no admitted importer program");
    }
  }
}
function coversModuleDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  queries: readonly InventoryModuleTargetQuery[],
): boolean {
  return queries.every(
    (query) =>
      partition.roots.includes(query.importer.file) &&
      (!partition.available.includes(query.node.file) || [...readInventoryModules(db, partition.id, query.node)].length === 1),
  );
}
function assertModuleCohort(
  db: ReturnType<typeof openInventoryDatabase>,
  options: SemanticInventoryOptions,
  partitions: readonly StoredInventoryPartition[],
): void {
  if (partitions.some((partition) => !coversModuleDemand(db, partition, moduleDemand(options, partition.program)))) {
    throw new Error("native contextual module demand changed before publication");
  }
}
function nativeDemandRequest(
  options: SemanticInventoryOptions,
  program: string,
  families: readonly InventoryFamily[],
): Pick<
  InventoryBuildRequest,
  | "referenceDemand"
  | "exportQueries"
  | "idBrandQueries"
  | "callableQueries"
  | "moduleTargetQueries"
  | "computedNameQueries"
  | "globalOriginQueries"
  | "globalBindingQueries"
  | "invocationQueries"
  | "drizzleQueries"
  | "schemaSources"
  | "schemaDataSources"
  | "schemaDataProjection"
  | "schemaDependency"
> {
  return {
    ...(families.includes("id-brands") ? { idBrandQueries: idBrandDemand(options, program) } : {}),
    ...(families.includes("references") ? { referenceDemand: referenceDemand(options, program) } : {}),
    ...(families.includes("drizzle-identities")
      ? {
          drizzleQueries: [
            ...new Map(
              (options.drizzleQueries ?? []).filter((entry) => entry.program === program).map(({ query }) => [drizzleQueryKey(query), query]),
            ).values(),
          ],
          ...(options.schemaQuery?.program === program ? { schemaSources: options.schemaQuery.sources } : {}),
        }
      : {}),
    ...(families.includes("schema-data") && options.schemaDataQuery?.program === program
      ? {
          schemaDataSources: options.schemaDataQuery.sources,
          ...(options.schemaDataQuery.projection === undefined ? {} : { schemaDataProjection: options.schemaDataQuery.projection }),
        }
      : {}),
    ...(families.includes("export-declarations") ? { exportQueries: exportDemand(options, program) } : {}),
    ...moduleDemandOptions(options, program, families),
    ...(families.includes("invocation-evidence") ? { invocationQueries: invocationDemand(options, program) } : {}),
    ...(families.includes("callable-declarations") ? { callableQueries: callableDemand(options, program) } : {}),
    ...(families.includes("computed-names") ? { computedNameQueries: computedDemand(options, program) } : {}),
    ...(families.includes("global-origins")
      ? {
          globalOriginQueries: globalDemand(options, program, "globalOriginQueries"),
          globalBindingQueries: globalDemand(options, program, "globalBindingQueries"),
        }
      : {}),
  };
}
function coversNativeDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  demand: Pick<
    InventoryBuildRequest,
    | "referenceDemand"
    | "exportQueries"
    | "idBrandQueries"
    | "callableQueries"
    | "moduleTargetQueries"
    | "computedNameQueries"
    | "globalOriginQueries"
    | "globalBindingQueries"
    | "invocationQueries"
    | "drizzleQueries"
    | "schemaSources"
    | "schemaDataSources"
    | "schemaDataProjection"
    | "schemaDependency"
  >,
): boolean {
  return (
    coversReferenceDemand(db, partition, demand.referenceDemand) &&
    coversExportDemand(db, partition, demand.exportQueries ?? []) &&
    coversIdBrandDemand(db, partition, demand.idBrandQueries ?? []) &&
    coversModuleDemand(db, partition, demand.moduleTargetQueries ?? []) &&
    coversCallableDemand(db, partition, demand.callableQueries ?? []) &&
    coversComputedDemand(db, partition, demand.computedNameQueries ?? []) &&
    coversGlobalDemand(db, partition, demand) &&
    coversInvocationDemand(db, partition, demand.invocationQueries ?? [], demand.schemaDependency ?? null) &&
    coversDrizzleDemand(db, partition, demand)
  );
}

function catalogFirst(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
): readonly InventoryBuildRequest["descriptor"][] {
  const rank = (id: string): number => Number(id === options.schemaQuery?.program) * 2 + Number(id === options.schemaDataQuery?.program);
  return descriptors.toSorted((left, right) => rank(right.id) - rank(left.id));
}

function assertDrizzleDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  const data = options.schemaDataQuery;
  if (families.includes("schema-data") !== (data !== undefined)) {
    throw new Error("native full schema data requires an explicit closed source demand");
  }
  if (data !== undefined) {
    schemaDataProjectionSchema.parse(data.projection ?? {});
    const descriptor = descriptors.find(({ id }) => id === data.program);
    if (
      descriptor === undefined ||
      new Set(data.sources.map(inventoryNodeQueryKey)).size !== data.sources.length ||
      data.sources.some(
        (node) => node.kind !== SyntaxKind.SourceFile || !descriptor.files.some((file) => canonicalInventoryPath(resolve(options.root, file)) === node.file),
      )
    ) {
      throw new Error("native full schema data has no complete admitted source owner");
    }
  }
  const enabled = families.includes("drizzle-identities");
  const schema = options.schemaQuery;
  if (enabled !== (schema !== undefined) || enabled !== (options.drizzleQueries !== undefined)) {
    throw new Error("native Drizzle identities require an explicit complete catalog and closed call demand");
  }
  if (schema === undefined) {
    return;
  }
  const catalog = descriptors.find(({ id }) => id === schema.program);
  if (
    catalog === undefined ||
    schema.sources.some((node) => !catalog.files.some((file) => canonicalInventoryPath(resolve(options.root, file)) === node.file)) ||
    (options.drizzleQueries ?? []).some(
      (entry) =>
        (entry.program === schema.program && (entry.query.mode !== "column" || data?.program !== schema.program)) ||
        !descriptors.some(({ id }) => id === entry.program),
    )
  ) {
    throw new Error("native Drizzle demand has no independent admitted catalog/consumer owner");
  }
}

function withSchemaDependency(
  db: ReturnType<typeof openInventoryDatabase>,
  options: SemanticInventoryOptions,
  partitions: readonly StoredInventoryPartition[],
  demand: ReturnType<typeof nativeDemandRequest>,
): ReturnType<typeof nativeDemandRequest> {
  if (
    (demand.drizzleQueries?.length ?? 0) === 0 &&
    demand.invocationQueries?.some((query) => query.mode === "observations" || invocationNeedsValueSourceCatalog(query)) !== true
  ) {
    return demand;
  }
  if (demand.schemaSources !== undefined || demand.schemaDataSources !== undefined) {
    if (
      demand.drizzleQueries?.some((query) => query.mode !== "column") === true ||
      demand.schemaSources === undefined ||
      demand.schemaDataSources === undefined ||
      JSON.stringify(demand.schemaSources) !== JSON.stringify(demand.schemaDataSources)
    ) {
      throw new Error("native local column demand requires complete matching catalog rosters");
    }
    return demand;
  }
  const catalog = partitions.find(({ program }) => program === options.schemaQuery?.program);
  if (catalog === undefined) {
    throw new Error("native Drizzle catalog must be captured before consumer extraction");
  }
  const dependency: InventorySchemaDependency = {
    program: catalog.program,
    partition: catalog.id,
    descriptorVersion: catalog.descriptorVersion,
    inputs: [...readInventoryInputs(db, catalog.id)],
    catalog: readInventorySchemaIdentity(db, catalog.id),
  };
  if (demand.drizzleQueries?.some((query) => query.mode === "column") === true) {
    const columns = schemaCatalogColumns(dependency.catalog, readInventorySchemaData(db, catalog.id));
    return { ...demand, schemaDependency: { ...dependency, columns } };
  }
  return { ...demand, schemaDependency: dependency };
}

function coversDrizzleDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  demand: Pick<InventoryBuildRequest, "drizzleQueries" | "schemaSources" | "schemaDataSources" | "schemaDataProjection" | "schemaDependency">,
): boolean {
  if (demand.drizzleQueries === undefined && demand.schemaDataSources === undefined && !partition.families.includes("schema-data")) {
    return true;
  }
  const expected = [
    ...(demand.schemaSources === undefined ? [] : [SCHEMA_IDENTITY_CATALOG_KEY]),
    ...(demand.schemaDataSources === undefined ? [] : [SCHEMA_DATA_CATALOG_KEY]),
    ...(demand.drizzleQueries ?? []).map(drizzleQueryKey),
  ].toSorted();
  const recorded = db
    .prepare("SELECT key FROM inventory_drizzle_evidence WHERE partition=? ORDER BY key")
    .all(partition.id)
    .map((row) => inventoryStringSchema.parse(row["key"]))
    .toSorted();
  if (JSON.stringify(recorded) !== JSON.stringify(expected)) {
    return false;
  }
  if (demand.schemaSources !== undefined) {
    const captured = readInventorySchemaIdentity(db, partition.id);
    if (
      JSON.stringify(captured.sources.map(({ node }) => inventoryNodeQueryKey(node)).toSorted()) !==
      JSON.stringify(demand.schemaSources.map(inventoryNodeQueryKey).toSorted())
    ) {
      return false;
    }
  }
  if (!coversSchemaDataDemand(db, partition, demand)) {
    return false;
  }
  return (demand.drizzleQueries ?? []).every((query) => {
    const call = readInventoryDrizzleCall(db, partition.id, query);
    if (call.basis === null) {
      return coversLocalColumn(db, partition, demand, call);
    }
    return call.basis.program === demand.schemaDependency?.program && call.basis.partition === demand.schemaDependency.partition;
  });
}

function coversLocalColumn(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  demand: Pick<InventoryBuildRequest, "schemaDependency" | "schemaSources" | "schemaDataSources">,
  call: import("./drizzle-inventory-contract.ts").InventoryDrizzleCall,
): boolean {
  if (
    call.query.mode !== "column" ||
    demand.schemaDependency !== undefined ||
    demand.schemaSources === undefined ||
    demand.schemaDataSources === undefined ||
    !partition.families.includes("schema-data") ||
    !partition.families.includes("drizzle-identities")
  ) {
    return false;
  }
  const identity = readInventorySchemaIdentity(db, partition.id);
  const full = readInventorySchemaData(db, partition.id);
  if (identity.fact.status !== "ready" || full.fact.status !== "ready") {
    return false;
  }
  const columns = schemaCatalogColumns(identity, full);
  if (call.evidence.mode !== "column") {
    return false;
  }
  const column = call.evidence.column;
  if (column.kind === "resolved" && !columns.some(({ key }) => key === column.value)) {
    return false;
  }
  return true;
}

function globalDemand(options: SemanticInventoryOptions, program: string, kind: "globalOriginQueries" | "globalBindingQueries"): readonly InventorySpan[] {
  return [...new Map((options[kind] ?? []).filter((query) => query.program === program).map(({ node }) => [inventoryNodeQueryKey(node), node])).values()];
}

function idBrandDemand(options: SemanticInventoryOptions, program: string): readonly InventorySpan[] {
  return [
    ...new Map((options.idBrandQueries ?? []).filter((query) => query.program === program).map(({ node }) => [inventoryNodeQueryKey(node), node])).values(),
  ];
}
function coversIdBrandDemand(db: ReturnType<typeof openInventoryDatabase>, partition: StoredInventoryPartition, queries: readonly InventorySpan[]): boolean {
  return queries.every((query) => [...readInventoryBrands(db, partition.id, query)].length === 1);
}
function assertIdBrandCoverage(db: ReturnType<typeof openInventoryDatabase>, partition: StoredInventoryPartition, request: InventoryBuildRequest): void {
  if (!coversIdBrandDemand(db, partition, request.idBrandQueries ?? [])) {
    throw new Error(`native inventory worker supplied incomplete id-brand coverage: ${request.descriptor.id}`);
  }
}
function assertIdBrandDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  if (
    (options.idBrandQueries !== undefined && !families.includes("id-brands")) ||
    (options.idBrandQueries ?? []).some((query) => !descriptors.some((descriptor) => descriptor.id === query.program))
  ) {
    throw new Error("native id-brand queries require admitted native programs and family");
  }
}
function coversGlobalDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  queries: Pick<InventoryBuildRequest, "globalOriginQueries" | "globalBindingQueries" | "invocationQueries">,
): boolean {
  return (
    (queries.globalOriginQueries ?? []).every((query) => [...readInventoryGlobalOrigins(db, partition.id, query)].length === 1) &&
    (queries.globalBindingQueries ?? []).every((query) => [...readInventoryGlobalBindings(db, partition.id, query)].length === 1)
  );
}
function assertGlobalDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  for (const kind of ["globalOriginQueries", "globalBindingQueries"] as const) {
    const queries = options[kind];
    if (
      (queries ?? []).some((query) => !descriptors.some((descriptor) => descriptor.id === query.program)) ||
      (queries !== undefined && !families.includes("global-origins")) ||
      (families.includes("global-origins") && queries === undefined)
    ) {
      throw new Error("native global origins and bindings require closed demand in admitted native programs");
    }
  }
}

function invocationDemand(options: SemanticInventoryOptions, program: string): readonly InventoryInvocationQuery[] {
  return [
    ...new Map((options.invocationQueries ?? []).filter((query) => query.program === program).map(({ query }) => [invocationQueryKey(query), query])).values(),
  ];
}
function coversInvocationDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  queries: readonly InventoryInvocationQuery[],
  observationBasis: import("./drizzle-inventory-contract.ts").InventorySchemaBasis | null = null,
): boolean {
  return hasInventoryInvocationCoverage(
    db,
    partition.id,
    queries,
    observationBasis === null ? null : { program: observationBasis.program, partition: observationBasis.partition },
  );
}
function assertInvocationDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
  if (
    (options.invocationQueries ?? []).some((query) => !descriptors.some((descriptor) => descriptor.id === query.program)) ||
    (options.invocationQueries !== undefined && !families.includes("invocation-evidence")) ||
    (families.includes("invocation-evidence") &&
      (options.invocationQueries === undefined ||
        ((options.invocationQueries.length === 0 ||
          options.invocationQueries.some(({ query }) => query.mode !== "types" || hasTypeObservationValueDemand(query.typeObservations))) &&
          !(families.includes("computed-names") && families.includes("global-origins")))))
  ) {
    throw new Error("native invocation evidence requires closed demand and related fact capabilities in admitted native programs");
  }
}

function assertInvocationCoverage(db: ReturnType<typeof openInventoryDatabase>, candidate: StoredInventoryPartition, request: InventoryBuildRequest): void {
  if (!coversInvocationDemand(db, candidate, request.invocationQueries ?? [], request.schemaDependency ?? null)) {
    throw new Error(`native inventory worker supplied incomplete invocation coverage: ${request.descriptor.id}`);
  }
}

function assertExportCoverage(db: ReturnType<typeof openInventoryDatabase>, candidate: StoredInventoryPartition, request: InventoryBuildRequest): void {
  if (!coversExportDemand(db, candidate, request.exportQueries ?? [])) {
    throw new Error(`native inventory worker supplied incomplete export source/name coverage: ${request.descriptor.id}`);
  }
}

function coversSchemaDataDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  demand: Pick<InventoryBuildRequest, "schemaDataSources" | "schemaDataProjection">,
): boolean {
  const sources = demand.schemaDataSources;
  if (sources === undefined) {
    return true;
  }
  const captured = readInventorySchemaData(db, partition.id);
  return (
    JSON.stringify(schemaDataProjectionSchema.parse(captured.projection ?? {})) ===
      JSON.stringify(schemaDataProjectionSchema.parse(demand.schemaDataProjection ?? {})) &&
    JSON.stringify(captured.sources.map(({ node }) => inventoryNodeQueryKey(node)).toSorted()) === JSON.stringify(sources.map(inventoryNodeQueryKey).toSorted())
  );
}
