import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readAuthoredRepositoryInventory } from "../compiler/authored-repository.ts";
import { readCompilerPrograms } from "../compiler/compiler-programs.ts";
import { isTypeWorldSource, predictedProgram } from "../compiler/project-worlds.ts";
import { runInventoryPartitionWorker } from "../compiler/semantic-inventory-worker-run.ts";
import type { InventorySchemaDependency } from "./drizzle-inventory-contract.ts";
import type {
  InventoryBuildRequest,
  InventoryExportDeclarationQuery,
  InventoryFamily,
  InventoryInvocationQuery,
  InventoryOverlay,
  InventoryShapeQuery,
  InventorySpan,
  SemanticInventory,
  SemanticInventoryOptions,
  StoredInventoryPartition,
} from "./semantic-inventory-contract.ts";
import {
  drizzleQueryKey,
  exportDeclarationQueryKey,
  inventoryFamilies,
  inventoryNodeQueryKey,
  invocationQueryKey,
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
  readInventoryCallableDeclarations,
  readInventoryComputedNames,
  readInventoryDrizzleCall,
  readInventoryExportDeclarations,
  readInventoryGlobalBindings,
  readInventoryGlobalOrigins,
  readInventoryInputs,
  readInventoryInvocationEvidence,
  readInventoryPairs,
  readInventorySchemaIdentity,
} from "./semantic-inventory-queries.ts";
import { inventoryReader } from "./semantic-inventory-reader.ts";
import { inventoryStringSchema } from "./semantic-inventory-records.ts";

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
    assertExportDemand(options, descriptors, families);
    assertCallableDemand(options, descriptors, families);
    assertComputedDemand(options, descriptors, families);
    assertGlobalDemand(options, descriptors, families);
    assertInvocationDemand(options, descriptors, families);
    assertDrizzleDemand(options, descriptors, families);
    const previous = latestInventoryPartitions(db, families);
    const { partitions, rebuilt } = demandPartitions({ ...options, root }, descriptors, previous, { db, scratch, overlay });
    assertDrizzleCohort(db, options, partitions);
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
    if (!coversCallableDemand(staging, candidate, request.callableQueries ?? [])) {
      throw new Error(`native inventory worker supplied incomplete callable coverage: ${request.descriptor.id}`);
    }
    if (!coversComputedDemand(staging, candidate, request.computedNameQueries ?? [])) {
      throw new Error(`native inventory worker supplied incomplete computed-name coverage: ${request.descriptor.id}`);
    }
    if (!coversGlobalDemand(staging, candidate, request)) {
      throw new Error(`native inventory worker supplied incomplete global-origin/binding coverage: ${request.descriptor.id}`);
    }
    assertExportCoverage(staging, candidate, request);
    assertInvocationCoverage(staging, candidate, request);
    assertDrizzleCoverage(staging, candidate, request, options);
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
  for (const descriptor of catalogFirst(options, descriptors)) {
    const nativeDemand = withSchemaDependency(db, options, partitions, nativeDemandRequest(options, descriptor.id, inventoryFamilies(options.families)));
    const existing = previous.get(descriptor.id);
    if (
      existing !== undefined &&
      existing.descriptorVersion === descriptorVersion(descriptor) &&
      inputsCurrent(readInventoryInputs(db, existing.id), { authored, fileSystem: options.fileSystem }) &&
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

function assertDrizzleCohort(
  db: ReturnType<typeof openInventoryDatabase>,
  options: SemanticInventoryOptions,
  partitions: readonly StoredInventoryPartition[],
): void {
  for (const partition of partitions) {
    const demand = withSchemaDependency(db, options, partitions, nativeDemandRequest(options, partition.program, partition.families));
    if (!coversDrizzleDemand(db, partition, demand)) {
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
  if (options.schemaQuery === undefined) {
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

function nativeDemandRequest(
  options: SemanticInventoryOptions,
  program: string,
  families: readonly InventoryFamily[],
): Pick<
  InventoryBuildRequest,
  | "exportQueries"
  | "callableQueries"
  | "computedNameQueries"
  | "globalOriginQueries"
  | "globalBindingQueries"
  | "invocationQueries"
  | "drizzleQueries"
  | "schemaSources"
  | "schemaDependency"
> {
  return {
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
    ...(families.includes("export-declarations") ? { exportQueries: exportDemand(options, program) } : {}),
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
    | "exportQueries"
    | "callableQueries"
    | "computedNameQueries"
    | "globalOriginQueries"
    | "globalBindingQueries"
    | "invocationQueries"
    | "drizzleQueries"
    | "schemaSources"
    | "schemaDependency"
  >,
): boolean {
  return (
    coversExportDemand(db, partition, demand.exportQueries ?? []) &&
    coversCallableDemand(db, partition, demand.callableQueries ?? []) &&
    coversComputedDemand(db, partition, demand.computedNameQueries ?? []) &&
    coversGlobalDemand(db, partition, demand) &&
    coversInvocationDemand(db, partition, demand.invocationQueries ?? []) &&
    coversDrizzleDemand(db, partition, demand)
  );
}

function catalogFirst(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
): readonly InventoryBuildRequest["descriptor"][] {
  return descriptors.toSorted((left, right) => Number(right.id === options.schemaQuery?.program) - Number(left.id === options.schemaQuery?.program));
}

function assertDrizzleDemand(
  options: SemanticInventoryOptions,
  descriptors: readonly InventoryBuildRequest["descriptor"][],
  families: readonly InventoryFamily[],
): void {
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
    (options.drizzleQueries ?? []).some((entry) => entry.program === schema.program || !descriptors.some(({ id }) => id === entry.program))
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
  if ((demand.drizzleQueries?.length ?? 0) === 0) {
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
  return { ...demand, schemaDependency: dependency };
}

function coversDrizzleDemand(
  db: ReturnType<typeof openInventoryDatabase>,
  partition: StoredInventoryPartition,
  demand: Pick<InventoryBuildRequest, "drizzleQueries" | "schemaSources" | "schemaDependency">,
): boolean {
  if (demand.drizzleQueries === undefined) {
    return true;
  }
  const expected = [...(demand.schemaSources === undefined ? [] : ["catalog"]), ...demand.drizzleQueries.map(drizzleQueryKey)].toSorted();
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
  for (const query of demand.drizzleQueries) {
    const call = readInventoryDrizzleCall(db, partition.id, query);
    if (call.basis.program !== demand.schemaDependency?.program || call.basis.partition !== demand.schemaDependency.partition) {
      return false;
    }
  }
  return true;
}

function globalDemand(options: SemanticInventoryOptions, program: string, kind: "globalOriginQueries" | "globalBindingQueries"): readonly InventorySpan[] {
  return [...new Map((options[kind] ?? []).filter((query) => query.program === program).map(({ node }) => [inventoryNodeQueryKey(node), node])).values()];
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
): boolean {
  return queries.every((query) => [...readInventoryInvocationEvidence(db, partition.id, query)].length === 1);
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
      (options.invocationQueries === undefined || !families.includes("computed-names") || !families.includes("global-origins")))
  ) {
    throw new Error("native invocation evidence requires closed demand and related fact capabilities in admitted native programs");
  }
}

function assertInvocationCoverage(db: ReturnType<typeof openInventoryDatabase>, candidate: StoredInventoryPartition, request: InventoryBuildRequest): void {
  if (!coversInvocationDemand(db, candidate, request.invocationQueries ?? [])) {
    throw new Error(`native inventory worker supplied incomplete invocation coverage: ${request.descriptor.id}`);
  }
}

function assertExportCoverage(db: ReturnType<typeof openInventoryDatabase>, candidate: StoredInventoryPartition, request: InventoryBuildRequest): void {
  if (!coversExportDemand(db, candidate, request.exportQueries ?? [])) {
    throw new Error(`native inventory worker supplied incomplete export source/name coverage: ${request.descriptor.id}`);
  }
}
