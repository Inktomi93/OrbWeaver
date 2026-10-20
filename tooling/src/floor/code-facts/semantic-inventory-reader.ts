import { isAbsolute, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { Node, SourceFile } from "ts-morph";
import { Project, Node as TsNode } from "ts-morph";
import { predictedProgram } from "../compiler/project-worlds.ts";
import { createSourceBindingUsage } from "./binding-usage.ts";
import type { DeclarationBindingKeys, SourceBindingUsage } from "./binding-usage-contract.ts";
import type { DrizzleCallEvidence } from "./drizzle-evidence-contract.ts";
import { replayDrizzleCallEvidence, replaySchemaIdentityCatalog } from "./drizzle-evidence-replay.ts";
import type { InventorySchemaIdentityCatalog } from "./drizzle-inventory-contract.ts";
import { schemaCatalogColumns } from "./drizzle-inventory-contract.ts";
import { replayInvocationEvidence } from "./invocation-evidence-replay.ts";
import { replayCallableDeclarationValue } from "./projection-reference-codec.ts";
import type { GlobalMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaColumnIdentity } from "./schema-model-contract.ts";
import type { InventorySchemaProjectedCatalog } from "./schema-projection-inventory-contract.ts";
import { assertSchemaProjection, replaySchemaDataCatalog } from "./schema-projection-replay.ts";
import type {
  InventoryFamily,
  InventoryInvocationEvidence,
  InventoryPartition,
  InventoryReaderSourceMetadata,
  InventoryReaderStorage,
  InventoryReadLease,
  InventorySourceCorpus,
  InventorySpan,
  InventorySymbols,
  SemanticInventory,
  StoredInventoryPartition,
  StoredInventorySource,
} from "./semantic-inventory-contract.ts";
import {
  INVENTORY_KEY_SEPARATOR,
  INVENTORY_REFERENCE_MODES,
  inventoryNodeQueryKey,
  inventorySpanKey,
  invocationNeedsValueSourceCatalog,
  moduleTargetQueryKey,
  moduleTargetQuerySchema,
  SemanticInventoryError,
  shapePairKey,
} from "./semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "./semantic-inventory-inputs.ts";
import { createInventoryLoader } from "./semantic-inventory-loader.ts";

import {
  inventoryBindingsAt,
  inventoryCallableDeclarations,
  inventoryComputedNames,
  inventoryDeclarationOutputs,
  inventoryExportsOf,
  inventoryGlobalOrigins,
  inventoryMemberOrigins,
  inventoryModulesAt,
  inventoryPairs,
  inventoryRuntimeExportsOf,
  inventoryShapes,
  inventorySourcesByFile,
  inventoryWitnessesAt,
  readInventoryDrizzleCall,
  readInventoryExportDeclarations,
  readInventoryGlobalBindings,
  readInventoryInvocationEvidence,
  readInventoryReferenceQueries,
  readInventoryReferences,
  readInventorySchemaData,
  readInventorySchemaIdentity,
  readInventorySourceMetadata,
  readInventorySourceText,
} from "./semantic-inventory-queries.ts";
import { inventoryTextParts, inventoryTextVersion } from "./semantic-inventory-records.ts";

function columnCatalog(
  identity: InventorySchemaIdentityCatalog,
  full: InventorySchemaProjectedCatalog | undefined,
  local: boolean,
  captured?: readonly SchemaColumnIdentity[],
): readonly SchemaColumnIdentity[] | undefined {
  if (local && (identity.fact.status !== "ready" || full?.fact.status !== "ready")) {
    throw new SemanticInventoryError("native local column basis has no ready paired catalog");
  }
  return full === undefined ? undefined : (captured ?? schemaCatalogColumns(identity, full));
}

/** A selected scalar identity must not expose the pinned reader's raw column catalog. */
function isolatedColumn(evidence: DrizzleCallEvidence): DrizzleCallEvidence {
  return evidence.mode === "column" && evidence.column.kind === "resolved"
    ? { ...evidence, column: { ...evidence.column, value: structuredClone(evidence.column.value) } }
    : evidence;
}

const inventories = new WeakMap<object, SemanticInventory>();

/** Identify a syntax carrier whose semantic queries belong to a pinned native generation. */
export function semanticInventoryOf(value: object): SemanticInventory | undefined {
  return inventories.get(value);
}

function nodeSpan(node: Node): InventorySpan {
  return { file: node.getSourceFile().getFilePath(), start: node.getStart(), end: node.getEnd(), kind: node.getKind() };
}

function agreed<T>(values: readonly T[], label: string): T | undefined {
  const first = values[0];
  if (values.some((value) => !isDeepStrictEqual(value, first))) {
    throw new SemanticInventoryError(`native semantic inventory ambiguity: ${label}`);
  }
  return first;
}

function assertReferenceModes(partitions: readonly StoredInventoryPartition[]): void {
  if (partitions.some((partition) => !INVENTORY_REFERENCE_MODES.includes(partition.referenceMode))) {
    throw new SemanticInventoryError("native reference coverage metadata is unavailable");
  }
}

/** Materialize source syntax only; all typed questions select immutable native facts explicitly. */
export function inventoryReader(
  root: string,
  generation: number,
  partitions: readonly StoredInventoryPartition[],
  storage: InventoryReaderStorage,
): SemanticInventory {
  return createInventoryReader(root, generation, partitions, storage);
}

/** Retain the owned query-only snapshot until the returned inventory is disposed. */
export function ownedInventoryReader(root: string, generation: number, lease: InventoryReadLease, storage: InventoryReaderStorage): SemanticInventory {
  try {
    return createInventoryReader(root, generation, lease.partitions, { ...storage, lease });
  } catch (error) {
    lease[Symbol.dispose]();
    throw error;
  }
}

/** Constructor metadata errors must still prevent publication, without creating another syntax reader. */
export function validateInventoryReaderSources(db: DatabaseSync, partitions: readonly StoredInventoryPartition[]): void {
  readerSourceMetadata(db, partitions);
}

function readerSourceMetadata(db: DatabaseSync, partitions: readonly StoredInventoryPartition[]): InventoryReaderSourceMetadata {
  const texts = new Map<string, { partition: string; source: StoredInventorySource }>();
  const aliases = new Map<string, string>();
  const authored = new Set<string>();
  for (const partition of partitions) {
    for (const source of readInventorySourceMetadata(db, partition.id)) {
      const previous = texts.get(source.file);
      if (previous !== undefined && previous.source.textVersion !== source.textVersion) {
        throw new SemanticInventoryError(`native semantic inventory mixed source versions: ${source.file}`);
      }
      texts.set(source.file, { partition: partition.id, source });
      if (source.authored) {
        authored.add(source.file);
      }
      aliases.set(source.path, source.file);
      aliases.set(source.file, source.file);
    }
  }
  return { texts, aliases, authored };
}

function createInventoryReader(
  root: string,
  generation: number,
  partitions: readonly StoredInventoryPartition[],
  storage: InventoryReaderStorage & { readonly lease?: InventoryReadLease },
): SemanticInventory {
  const { db, dispose, shapeCohort, lease } = storage;
  lease?.assertOpen();
  const shapeOwners = new Map(storage.shapeOwners);
  let indexes = [...partitions];
  let open = true;
  const assertOpen = (): void => {
    if (!open) {
      throw new SemanticInventoryError("native semantic inventory has been disposed");
    }
    lease?.assertOpen();
    storage.pinned?.();
    storage.assertImplementation?.();
  };
  // Partition rows are insert-once; a leased or caller-pinned snapshot can retain them, a borrowed live read cannot.
  // biome-ignore lint/nursery/useDisposables: the inventory's own dispose releases its session loader.
  const loader = createInventoryLoader(db, lease !== undefined || storage.pinned !== undefined, assertOpen);
  const shapeFacts = loader.family(inventoryShapes);
  const pairFacts = loader.family(inventoryPairs);
  const bindingFacts = loader.family(inventoryBindingsAt);
  const moduleFacts = loader.family(inventoryModulesAt);
  const witnessFacts = loader.family(inventoryWitnessesAt);
  const exportFacts = loader.family(inventoryExportsOf);
  const sourceFacts = loader.family(inventorySourcesByFile);
  const globalOriginFacts = loader.family(inventoryGlobalOrigins);
  const computedFacts = loader.family(inventoryComputedNames);
  const callableFacts = loader.family(inventoryCallableDeclarations);
  const memberFacts = loader.family(inventoryMemberOrigins);
  const outputFacts = loader.family(inventoryDeclarationOutputs);
  const runtimeExportFacts = loader.family(inventoryRuntimeExportsOf);
  // Captured library text owns these paths; implicit virtual libs would collide before lazy source creation.
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
    useInMemoryFileSystem: true,
  });
  const contextProjects = new Map<string, Project>();
  const contextWorlds = new WeakMap<Project, readonly string[]>();
  const capturedTexts = new Map<SourceFile, string>();
  const materializedSources = new Map<Project, Map<string, SourceFile>>();
  const projections = new Map<SourceFile, { readonly epoch: SourceFile["compilerNode"]; readonly nodes: Map<string, Node> }>();
  const bindingUses = new Map<string, SourceBindingUsage>();
  const identityCatalogs = new Map<StoredInventoryPartition, InventorySchemaIdentityCatalog>();
  const fullCatalogs = new Map<StoredInventoryPartition, InventorySchemaProjectedCatalog>();
  const columnCatalogs = new Map<StoredInventoryPartition, readonly SchemaColumnIdentity[]>();
  const { texts, aliases, authored } = readerSourceMetadata(db, partitions);
  const canonicalPaths = new Map<string, string>();
  const roots = new Set(partitions.flatMap((partition) => partition.roots));
  // Only the factory-owned lease supplies private immutable partition metadata.
  const available = new Map<StoredInventoryPartition, ReadonlySet<string>>(
    lease === undefined ? [] : partitions.map((partition) => [partition, new Set(partition.available)]),
  );
  const hasAvailableSource = (partition: StoredInventoryPartition, file: string): boolean =>
    available.get(partition)?.has(file) ?? partition.available.includes(file);
  const contextProject = (context: readonly string[] | undefined): Project => {
    if (context === undefined) {
      return project;
    }
    const key = context.join(INVENTORY_KEY_SEPARATOR);
    const existing = contextProjects.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const carrier = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
      skipLoadingLibFiles: true,
      useInMemoryFileSystem: true,
    });
    contextProjects.set(key, carrier);
    contextWorlds.set(carrier, context);
    inventories.set(carrier, inventory);
    return carrier;
  };
  const canonicalPath = (path: string): string => {
    const cached = canonicalPaths.get(path);
    if (cached !== undefined) {
      return cached;
    }
    const absolute = resolve(root, path);
    const canonical = aliases.get(absolute) ?? absolute;
    if (open && isAbsolute(root)) {
      canonicalPaths.set(path, canonical);
    }
    return canonical;
  };
  const capturedFile = (node: Node): string => canonicalPath(node.getSourceFile().getFilePath());
  const capturedSpan = (node: Node): InventorySpan => ({ ...nodeSpan(node), file: capturedFile(node) });
  const sourceFile = (path: string, context?: readonly string[]): SourceFile | undefined => {
    assertOpen();
    const file = canonicalPath(path);
    const carrier = contextProject(context);
    const materialized = materializedSources.get(carrier);
    const cached = materialized?.get(file);
    if (cached !== undefined) {
      if (!cached.wasForgotten() && cached.getFilePath() === file) {
        return cached;
      }
      materialized?.delete(file);
    }
    const existing = carrier.getSourceFile(file);
    const text = texts.get(file);
    if (existing !== undefined || text === undefined) {
      return existing;
    }
    const captured = readInventorySourceText(db, text.partition, text.source);
    const created = carrier.createSourceFile(file, captured);
    const sources = materialized ?? new Map<string, SourceFile>();
    sources.set(file, created);
    materializedSources.set(carrier, sources);
    capturedTexts.set(created, captured);
    inventories.set(created, inventory);
    inventories.set(created.compilerNode, inventory);
    return created;
  };
  const assertCapturedSource = (node: Node): void => {
    assertOpen();
    if (node.wasForgotten() || semanticInventoryOf(node.getProject()) !== inventory) {
      throw new SemanticInventoryError("native physical source/epoch is not admitted by its captured snapshot");
    }
    const source = node.getSourceFile();
    const captured = capturedTexts.get(source);
    // The immutable captured text was version-checked at materialization; mutable node identity is not admission.
    if (captured === undefined || source.getFullText() !== captured) {
      throw new SemanticInventoryError("native physical source/epoch is not admitted by its captured snapshot");
    }
  };
  const nodeOf = (span: InventorySpan, context?: readonly string[], source?: SourceFile): Node => {
    const sf = source ?? sourceFile(span.file, context);
    const key = inventorySpanKey(span);
    if (sf === undefined || sf.wasForgotten()) {
      throw new SemanticInventoryError(`native semantic inventory cannot materialize span: ${key}`);
    }
    let projection = projections.get(sf);
    if (projection?.epoch !== sf.compilerNode) {
      projection = { epoch: sf.compilerNode, nodes: new Map() };
      projections.set(sf, projection);
    }
    const existing = projection.nodes.get(key);
    if (existing !== undefined && !existing.wasForgotten()) {
      return existing;
    }
    let node: Node | undefined = sf;
    // Native DocumentSpan selection can return SyntaxLists, which are children but absent from parent ancestry.
    while (node !== undefined && !(node.getStart() === span.start && node.getEnd() === span.end && node.getKind() === span.kind)) {
      node = node.getChildAtPos(span.start);
    }
    if (node === undefined) {
      throw new SemanticInventoryError(`native semantic inventory cannot materialize span: ${inventorySpanKey(span)}`);
    }
    projection.nodes.set(key, node);
    return node;
  };
  const worlds = (node: Node): readonly StoredInventoryPartition[] => {
    const file = canonicalPath(node.getSourceFile().getFilePath());
    assertOpen();
    const sourceOwner = shapeOwners.get(node.getSourceFile());
    const context = sourceOwner === undefined ? contextWorlds.get(node.getProject()) : [sourceOwner];
    if (context !== undefined) {
      return indexes.filter((partition) => context.includes(partition.program));
    }
    const owners = indexes.filter((partition) => partition.roots.includes(file));
    const predicted = predictedProgram(file.slice(root.length + 1));
    const primary = owners.find((partition) => partition.program === predicted);
    return primary === undefined ? owners : [primary];
  };
  const requireFamily = (selected: readonly StoredInventoryPartition[], family: InventoryFamily): void => {
    if (selected.some((partition) => !partition.families.includes(family))) {
      throw new SemanticInventoryError(`native semantic inventory family unavailable: ${family}`);
    }
  };
  const nativeSpan = (node: Node, program: string, family: InventoryFamily): { readonly partition: StoredInventoryPartition; readonly span: InventorySpan } => {
    assertOpen();
    const selected = indexes.filter((candidate) => candidate.program === program);
    const partition = selected[0];
    if (selected.length !== 1 || partition === undefined) {
      throw new SemanticInventoryError("native compiler partition is unavailable");
    }
    requireFamily(selected, family);
    const source = node.getSourceFile();
    const file = canonicalPath(source.getFilePath());
    const recorded = texts.get(file);
    if (
      node.wasForgotten() ||
      recorded === undefined ||
      inventoryTextVersion(inventoryTextParts(source.getFullText())) !== recorded.source.textVersion ||
      !partition.roots.includes(file)
    ) {
      throw new SemanticInventoryError("native typed source/epoch is not admitted by its captured native partition");
    }
    return { partition, span: capturedSpan(node) };
  };
  const replayFor =
    (node: Node, program: string, partition: StoredInventoryPartition, label: string) =>
    (value: InventorySpan): Node => {
      if (!hasAvailableSource(partition, value.file)) {
        throw new SemanticInventoryError(`native ${label} source is outside its native closure`);
      }
      const captured = sourceFile(value.file, [program]);
      if (captured === undefined) {
        throw new SemanticInventoryError(`native ${label} source is unavailable`);
      }
      // Compare only the file: a forgotten anchor is admitted here and its replay is judged by the text check below.
      const original = value.file === capturedFile(node) ? node.getSourceFile() : node.getProject().getSourceFile(value.file);
      if (original !== undefined && (original.wasForgotten() || original.getFullText() !== captured.getFullText())) {
        throw new SemanticInventoryError(`native ${label} replay source/epoch is stale`);
      }
      return nodeOf(value, [program], original ?? captured);
    };
  // Only the owned query-only transaction makes raw wire reuse immutable; borrowed connections remain live reads.
  const identityCatalog = (partition: StoredInventoryPartition): InventorySchemaIdentityCatalog => {
    const captured = identityCatalogs.get(partition);
    if (captured !== undefined) {
      return captured;
    }
    const wire = readInventorySchemaIdentity(db, partition.id);
    if (lease !== undefined) {
      identityCatalogs.set(partition, wire);
    }
    return wire;
  };
  const fullCatalog = (partition: StoredInventoryPartition, replay: (span: InventorySpan) => Node): InventorySchemaProjectedCatalog => {
    const captured = fullCatalogs.get(partition);
    if (captured !== undefined) {
      return captured;
    }
    const wire = readInventorySchemaData(db, partition.id);
    if (lease !== undefined) {
      // Admit nested spans before retaining raw wire, never the mutable consumer projection returned by replay.
      replaySchemaDataCatalog(wire, replay, {});
      fullCatalogs.set(partition, wire);
    }
    return wire;
  };
  const catalogColumns = (
    partition: StoredInventoryPartition,
    identity: InventorySchemaIdentityCatalog,
    full: InventorySchemaProjectedCatalog | undefined,
    local: boolean,
  ): readonly SchemaColumnIdentity[] | undefined => {
    const columns = columnCatalog(identity, full, local, columnCatalogs.get(partition));
    if (lease !== undefined && columns !== undefined) {
      columnCatalogs.set(partition, columns);
    }
    return columns;
  };
  const nativeModuleTarget = (node: Node, program: string, importer?: SourceFile): SourceFile | undefined => {
    const { partition, span } = importer === undefined ? nativeSpan(node, program, "modules") : contextualModuleSpan(node, program, importer);
    if (!(TsNode.isImportDeclaration(node) || (TsNode.isExportDeclaration(node) && node.getModuleSpecifier() !== undefined))) {
      throw new SemanticInventoryError("native module target requires an authored import or export door");
    }
    const entries = moduleFacts.load(partition.id, [span])[0] ?? [];
    const entry = entries[0];
    if (entries.length !== 1 || entry === undefined) {
      throw new SemanticInventoryError("native module target coverage is unavailable in its captured native partition");
    }
    if (entry.target === null) {
      return undefined;
    }
    const target = sourceFile(entry.target, [program]);
    if (target === undefined) {
      throw new SemanticInventoryError("native module target source is unavailable");
    }
    return replayFor(node, program, partition, "module target")(capturedSpan(target)).getSourceFile();
  };
  const nativeReferences = (node: Node, program: string, importer: SourceFile | undefined): readonly Node[] => {
    assertOpen();
    const partition = indexes.find((candidate) => candidate.program === program);
    if (partition === undefined) {
      throw new SemanticInventoryError("native reference compiler partition is unavailable");
    }
    requireFamily([partition], "references");
    const span = capturedSpan(node);
    const recorded = sourceFacts.load(partition.id, [span.file])[0] ?? [];
    const source = recorded[0];
    if (
      node.wasForgotten() ||
      recorded.length !== 1 ||
      source === undefined ||
      !hasAvailableSource(partition, span.file) ||
      inventoryTextVersion(inventoryTextParts(node.getSourceFile().getFullText())) !== source.textVersion ||
      !TsNode.isReferenceFindable(node)
    ) {
      throw new SemanticInventoryError("native reference query source/epoch is not admitted by its captured native partition");
    }
    if (importer === undefined) {
      throw new SemanticInventoryError("native reference query requires its registered importing root");
    }
    const importerSpan = nativeSpan(importer, program, "references").span;
    const entries = [...readInventoryReferenceQueries(db, partition.id, { root: importerSpan, node: span })];
    const entry = entries[0];
    if (entries.length !== 1 || entry === undefined) {
      throw new SemanticInventoryError("native exact reference query coverage is unavailable");
    }
    const replay = replayFor(node, program, partition, "reference");
    return entry.references.map((result) => replay(result.reference));
  };
  const contextualModuleSpan = (
    node: Node,
    program: string,
    importer: SourceFile,
  ): { readonly partition: StoredInventoryPartition; readonly span: InventorySpan } => {
    const { partition } = nativeSpan(importer, program, "modules");
    if (node.wasForgotten()) {
      throw new SemanticInventoryError("native contextual module source epoch was forgotten");
    }
    const span = capturedSpan(node);
    const key = moduleTargetQueryKey({ importer: capturedSpan(importer), node: span });
    if (
      storage.moduleTargetQueries?.some((query) => query.program === program && moduleTargetQueryKey(moduleTargetQuerySchema.parse(query.query)) === key) !==
      true
    ) {
      throw new SemanticInventoryError("native contextual module target was not registered for its importer");
    }
    const source = node.getSourceFile();
    const recorded = texts.get(canonicalPath(source.getFilePath()));
    if (
      node.wasForgotten() ||
      recorded === undefined ||
      inventoryTextVersion(inventoryTextParts(source.getFullText())) !== recorded.source.textVersion ||
      !hasAvailableSource(partition, span.file)
    ) {
      throw new SemanticInventoryError("native contextual module source/epoch is outside its importing closure");
    }
    return { partition, span };
  };
  // biome-ignore lint/nursery/useDisposables: the returned corpus delegates ownership to the same caller-owned inventory.
  const corpus: InventorySourceCorpus = {
    getSourceFiles: () =>
      [...roots].toSorted().map((file) => {
        const sf = sourceFile(file);
        if (sf === undefined) {
          throw new SemanticInventoryError(`native semantic inventory missing authored root: ${file}`);
        }
        return sf;
      }),
    getSourceFile: sourceFile,
    [Symbol.dispose]: () => inventory[Symbol.dispose](),
  };
  // biome-ignore lint/nursery/useDisposables: the returned handle transfers disposal ownership to the caller.
  const inventory: SemanticInventory = {
    generation,
    schemaIdentity: (sources, program) => {
      assertOpen();
      const selected = indexes.filter((candidate) => candidate.program === program);
      const partition = selected[0];
      if (selected.length !== 1 || partition === undefined) {
        throw new SemanticInventoryError("native schema catalog owner is unavailable");
      }
      requireFamily(selected, "drizzle-identities");
      for (const source of sources) {
        nativeSpan(source, program, "drizzle-identities");
      }
      const catalog = identityCatalog(partition);
      const expected = sources.map((source) => JSON.stringify(capturedSpan(source))).toSorted();
      if (JSON.stringify(catalog.sources.map(({ node }) => JSON.stringify(node)).toSorted()) !== JSON.stringify(expected)) {
        throw new SemanticInventoryError("native schema identity source demand is incomplete or foreign");
      }
      const first = sources[0];
      if (first === undefined) {
        if (catalog.fact.status !== "missing") {
          throw new SemanticInventoryError("native empty schema demand has nonmissing evidence");
        }
        return structuredClone(catalog.fact);
      }
      return replaySchemaIdentityCatalog(structuredClone(catalog), replayFor(first, program, partition, "schema identity"));
    },
    schemaData: (sources, program, projection = {}) => {
      assertOpen();
      const selected = indexes.filter((candidate) => candidate.program === program);
      const partition = selected[0];
      if (selected.length !== 1 || partition === undefined) {
        throw new SemanticInventoryError("native schema catalog owner is unavailable");
      }
      requireFamily(selected, "schema-data");
      for (const source of sources) {
        nativeSpan(source, program, "schema-data");
      }
      const first = sources[0];
      const catalog =
        first === undefined ? readInventorySchemaData(db, partition.id) : fullCatalog(partition, replayFor(first, program, partition, "full schema data"));
      const expected = sources.map((source) => JSON.stringify(capturedSpan(source))).toSorted();
      if (JSON.stringify(catalog.sources.map(({ node }) => JSON.stringify(node)).toSorted()) !== JSON.stringify(expected)) {
        throw new SemanticInventoryError("native full schema data source demand is incomplete or foreign");
      }
      assertSchemaProjection(catalog.projection ?? {}, projection);
      if (first === undefined) {
        if (catalog.fact.status !== "missing") {
          throw new SemanticInventoryError("native empty schema demand has nonmissing evidence");
        }
        return catalog.fact;
      }
      return replaySchemaDataCatalog(catalog, replayFor(first, program, partition, "full schema data"), projection);
    },
    drizzleEvidence: (node, program, mode) => {
      const { partition, span } = nativeSpan(node, program, "drizzle-identities");
      if (mode !== "column" && !TsNode.isCallExpression(node)) {
        throw new SemanticInventoryError("native Drizzle query is not a call");
      }
      const fact = readInventoryDrizzleCall(db, partition.id, { node: span, mode });
      const basis = fact.basis;
      const catalogPartition =
        basis === null ? partition : indexes.find((candidate) => candidate.id === basis.partition && candidate.program === basis.program);
      if (catalogPartition === undefined) {
        throw new SemanticInventoryError("native Drizzle catalog dependency is outside the pinned generation");
      }
      if (basis === null) {
        requireFamily([partition], "schema-data");
      }
      const identity = identityCatalog(catalogPartition);
      // Source/epoch admission is repeated even when the pinned raw catalog was already parsed.
      const catalog = replaySchemaIdentityCatalog(structuredClone(identity), replayFor(node, catalogPartition.program, catalogPartition, "schema identity"));
      const full = mode === "column" ? fullCatalog(catalogPartition, replayFor(node, catalogPartition.program, catalogPartition, "schema data")) : undefined;
      const columns = catalogColumns(catalogPartition, identity, full, basis === null);
      if (full !== undefined && lease === undefined) {
        replaySchemaDataCatalog(full, replayFor(node, catalogPartition.program, catalogPartition, "schema data"), {});
      }
      const evidence = replayDrizzleCallEvidence(fact.evidence, catalog, replayFor(node, program, partition, "Drizzle call"), { node, columns });
      return isolatedColumn(evidence);
    },
    invocationEvidence: (node, program, plan) => {
      const { partition, span } = nativeSpan(node, program, "invocation-evidence");
      const query = { ...plan, node: span };
      const matches = [...(lease?.invocationEvidence(partition.id, query) ?? readInventoryInvocationEvidence(db, partition.id, query))];
      const wire = matches[0];
      if (matches.length !== 1 || wire === undefined) {
        throw new SemanticInventoryError("native invocation query is unavailable in its captured native partition");
      }
      if (wire.query.mode === "observations") {
        const basis = wire.observationBasis;
        const catalog = basis === null ? partition : indexes.find((candidate) => candidate.program === basis?.program && candidate.id === basis.partition);
        if (catalog === undefined || basis === undefined || !catalog.families.includes("schema-data") || !catalog.families.includes("drizzle-identities")) {
          throw new SemanticInventoryError("native ordinary complete catalog basis is outside the pinned generation");
        }
        readInventorySchemaIdentity(db, catalog.id);
        readInventorySchemaData(db, catalog.id);
      }
      assertValueSourceBasis(db, wire, partition, indexes);
      const replay = replayFor(node, program, partition, "invocation");
      const bindings = invocationBindings(wire, replay, (file) => lease?.bindings(partition.id, file) ?? readInventoryGlobalBindings(db, partition.id, file));
      const computed = invocationComputed(computedFacts.load(partition.id, invocationComputedKeys(wire)), wire, replay);
      const globals = invocationGlobals(globalOriginFacts.load(partition.id, invocationGlobalKeys(wire)), wire, replay);
      const required = <T>(map: ReadonlyMap<Node, T>, subject: Node): T => {
        // Replaying again checks both query epoch and each related-source epoch on every callback read.
        if (replay(capturedSpan(subject)) !== subject || !map.has(subject)) {
          throw new SemanticInventoryError("native invocation related-value coverage is unavailable");
        }
        const value = map.get(subject);
        if (value === undefined) {
          throw new SemanticInventoryError("native invocation related-value fact is missing");
        }
        return value;
      };
      return replayInvocationEvidence(
        wire,
        replay,
        {
          globals,
          declarations: (subject) => required(bindings, subject),
          computedName: (subject) => required(computed, subject),
        },
        assertOpen,
      );
    },
    globalOrigin: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "global-origins");
      const fact = globalOriginFacts.load(partition.id, [span])[0];
      if (fact === undefined) {
        throw new SemanticInventoryError("native global origin span is unavailable in its native partition");
      }
      const replay = replayFor(node, program, partition, "global origin");
      return replayGlobalFact(fact, replay);
    },
    globalBinding: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "global-origins");
      const matches = [...readInventoryGlobalBindings(db, partition.id, span)];
      const fact = matches[0];
      if (matches.length !== 1 || fact === undefined) {
        throw new SemanticInventoryError("native global binding span is unavailable in its native partition");
      }
      return fact.symbols.lexical.map(replayFor(node, program, partition, "global binding"));
    },
    computedName: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "computed-names");
      const fact = computedFacts.load(partition.id, [span])[0];
      if (fact === undefined) {
        throw new SemanticInventoryError("native computed-name span is unavailable in its native partition");
      }
      const replay = replayFor(node, program, partition, "computed-name");
      const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
      const result = fact.result;
      return result.kind === "resolved"
        ? { kind: result.kind, value: result.value, trace }
        : { kind: result.kind, reason: result.reason, detail: result.detail, node: replay(result.node), trace };
    },
    callableDeclaration: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "callable-declarations");
      const fact = callableFacts.load(partition.id, [span])[0];
      if (fact === undefined) {
        throw new SemanticInventoryError("native callable declaration span is unavailable in its native partition");
      }
      const replay = replayFor(node, program, partition, "callable declaration");
      const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
      const result = fact.result;
      if (result.kind === "unresolved") {
        return { kind: result.kind, reason: result.reason, detail: result.detail, node: replay(result.node), trace };
      }
      return { kind: "resolved", value: replayCallableDeclarationValue(result, replay), trace };
    },
    callMemberOrigin: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "type-member-origins");
      requireFamily([partition], "bindings");
      const fact = memberFacts.load(partition.id, [span])[0];
      if (fact === undefined) {
        throw new SemanticInventoryError("native call member origin span is unavailable in its native partition");
      }
      const materialize = (value: InventorySpan): Node => nodeOf(value, [program]);
      const bindings = fact.leaf === null ? [] : (bindingFacts.load(partition.id, [fact.leaf])[0] ?? []);
      if (fact.leaf !== null && bindings.length !== 1) {
        throw new SemanticInventoryError("native call member leaf binding is unavailable in its native partition");
      }
      const trace = { origin: materialize(fact.trace.origin), declarations: fact.trace.declarations.map(materialize) };
      return {
        name: fact.name,
        leafDeclarations: (bindings[0]?.symbols.lexical ?? []).map(materialize),
        origin:
          fact.result.kind === "resolved"
            ? { kind: "resolved", value: fact.result.declarations.map(materialize), trace }
            : { kind: "unresolved", reason: fact.result.reason, detail: fact.result.detail, node: materialize(fact.result.node), trace },
      };
    },
    declarationOutput: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "declaration-outputs");
      const match = outputFacts.load(partition.id, [span])[0];
      if (match === undefined) {
        throw new SemanticInventoryError("native declaration output span is unavailable in its native partition");
      }
      return match.unknown;
    },
    assertShapeSource: (source) => {
      assertOpen();
      const selected = worlds(source);
      if (selected.length !== 1) {
        throw new SemanticInventoryError("native shape catalog context is unavailable");
      }
      requireFamily(selected, "shape-catalog");
      if (source.wasForgotten()) {
        throw new SemanticInventoryError("native shape source/epoch is unavailable");
      }
      const text = source.getFullText();
      const captured = capturedTexts.get(source);
      if (captured !== undefined) {
        if (text !== captured) {
          throw new SemanticInventoryError("native shape source/epoch is unavailable");
        }
        return;
      }
      const recorded = texts.get(canonicalPath(source.getFilePath()));
      if (recorded === undefined || inventoryTextVersion(inventoryTextParts(text)) !== recorded.source.textVersion) {
        throw new SemanticInventoryError("native shape source/epoch is unavailable");
      }
      capturedTexts.set(source, text);
    },
    shape: (node) => {
      const selected = worlds(node);
      const partition = selected[0];
      if (selected.length !== 1 || partition === undefined) {
        throw new SemanticInventoryError("native shape source has no unambiguous catalog owner");
      }
      inventory.assertShapeSource(node.getSourceFile());
      // Pair planning asks for the same two shapes per field query; the loader answers repeats from the pinned session.
      const shape = shapeFacts.load(partition.id, [capturedSpan(node)])[0];
      if (shape === undefined) {
        throw new SemanticInventoryError("native shape catalog span is unavailable");
      }
      return shape;
    },
    shapePair: (query) => {
      assertOpen();
      if (shapeCohort !== true) {
        throw new SemanticInventoryError("native shape membership cohort is unavailable");
      }
      if (!(texts.has(query.left.file) && texts.has(query.right.file))) {
        throw new SemanticInventoryError("native shape pair source is unavailable");
      }
      const key = shapePairKey(query);
      return indexes
        .filter((partition) => hasAvailableSource(partition, query.left.file) && hasAvailableSource(partition, query.right.file))
        .map((partition) => {
          const match = pairFacts.load(partition.id, [key])[0];
          if (match === undefined) {
            throw new SemanticInventoryError("native shape pair query coverage is unavailable");
          }
          return { program: partition.program, result: match.result };
        });
    },
    exportDeclarations: (source, program, name) => {
      const { partition, span } = nativeSpan(source, program, "export-declarations");
      if (!TsNode.isSourceFile(source)) {
        throw new SemanticInventoryError("native export declarations require an exporting source file");
      }
      const entries = [...readInventoryExportDeclarations(db, partition.id, { file: span.file, name })];
      const captured = entries[0];
      if (entries.length !== 1 || captured === undefined) {
        throw new SemanticInventoryError("native export source/name coverage is unavailable");
      }
      return captured.declarations?.map(replayFor(source, program, partition, "export declaration")) ?? null;
    },
    runtimeExports: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "runtime-exports");
      if (!TsNode.isSourceFile(node)) {
        throw new SemanticInventoryError("native runtime exports require an exporting source file");
      }
      return runtimeExportFacts.load(partition.id, [span.file])[0] ?? [];
    },
    programs: partitions.map((partition) => partition.program),
    canonicalPath,
    sameNode: (left, right) => {
      assertOpen();
      if (semanticInventoryOf(left.getProject()) !== inventory || semanticInventoryOf(right.getProject()) !== inventory) {
        return false;
      }
      assertCapturedSource(left);
      assertCapturedSource(right);
      return inventorySpanKey(capturedSpan(left)) === inventorySpanKey(capturedSpan(right));
    },
    bindingUsage: (source) => {
      assertCapturedSource(source);
      const contextKey = (node: Node): string => {
        const selected = worlds(node);
        if (selected.length === 0) {
          throw new SemanticInventoryError("native binding usage has no admitted compiler context");
        }
        requireFamily(selected, "bindings");
        return `${canonicalPath(node.getSourceFile().getFilePath())}${INVENTORY_KEY_SEPARATOR}${selected.map((partition) => partition.id).join(INVENTORY_KEY_SEPARATOR)}`;
      };
      const key = contextKey(source);
      let usage = bindingUses.get(key);
      if (usage === undefined) {
        usage = createSourceBindingUsage(source, {
          bindings: declarationBindingKeySets,
          queryNode: inventoryBindingNode,
          declarationKey: inventoryDeclarationKey,
          admit: (node) => {
            assertCapturedSource(node);
            if (contextKey(node) !== key) {
              throw new SemanticInventoryError("native binding usage belongs to a foreign compiler context");
            }
          },
        });
        bindingUses.set(key, usage);
      }
      return usage;
    },
    sourceCorpus: () => corpus,
    exports: (source, importer) => {
      const file = canonicalPath(source.getFilePath());
      const selected = worlds(importer ?? source);
      requireFamily(selected, "exports");
      const sets = selected.map((partition) => (exportFacts.load(partition.id, [file])[0] ?? []).map(({ name, declarations }) => ({ name, declarations })));
      const exports = agreed(sets, `exports of ${file}`) ?? [];
      const context = selected.map((partition) => partition.program);
      return new Map(exports.map((entry) => [entry.name, entry.declarations.map((span) => nodeOf(span, context))]));
    },
    moduleTarget: (node, program, importer) => {
      if (program !== undefined) {
        return nativeModuleTarget(node, program, importer);
      }
      if (importer !== undefined) {
        throw new SemanticInventoryError("native contextual module target requires an explicit program");
      }
      const key = inventorySpanKey(capturedSpan(node));
      const selected = worlds(node);
      requireFamily(selected, "modules");
      const target = agreed(
        selected.map((partition) => moduleFacts.load(partition.id, [capturedSpan(node)])[0]?.at(-1)?.target ?? null),
        `module target at ${key}`,
      );
      return target === undefined || target === null
        ? undefined
        : sourceFile(
            target,
            selected.map((partition) => partition.program),
          );
    },
    symbols: (node): InventorySymbols => {
      const key = inventorySpanKey(capturedSpan(node));
      const selected = worlds(node);
      requireFamily(selected, "bindings");
      return (
        agreed(
          selected.map((partition) => bindingFacts.load(partition.id, [capturedSpan(node)])[0]?.at(-1)?.symbols ?? { lexical: [], origins: [] }),
          `binding at ${key}`,
        ) ?? { lexical: [], origins: [] }
      );
    },
    references: (node, program, importer) => {
      assertOpen();
      assertReferenceModes(indexes);
      if (program !== undefined) {
        return nativeReferences(node, program, importer);
      }
      assertCapturedSource(node);
      if (indexes.some((partition) => partition.families.includes("references") && partition.referenceMode === "closed")) {
        throw new SemanticInventoryError("native declaration reference union requires complete reference coverage");
      }
      const origin = capturedSpan(node);
      if (!authored.has(origin.file)) {
        throw new SemanticInventoryError(
          `native semantic inventory references unsupported for non-authored origin: ${origin.file}:${String(origin.start)}-${String(origin.end)}; dependency-origin references are not indexed; use a native semantic view`,
        );
      }
      requireFamily(indexes, "references");
      const found = new Map<string, InventorySpan>();
      for (const partition of indexes) {
        for (const { reference } of readInventoryReferences(db, partition.id, origin)) {
          found.set(inventorySpanKey(reference), reference);
        }
      }
      return [...found.values()].toSorted((a, b) => a.file.localeCompare(b.file) || a.start - b.start).map((span) => nodeOf(span));
    },
    witnessOrigins: (node) => {
      const key = inventorySpanKey(capturedSpan(node));
      const selected = worlds(node);
      requireFamily(selected, "witnesses");
      const spans =
        agreed(
          selected.map((partition) => witnessFacts.load(partition.id, [capturedSpan(node)])[0]?.at(-1)?.declarations ?? []),
          `witness at ${key}`,
        ) ?? [];
      return spans.map((span) => nodeOf(span));
    },
    [Symbol.dispose]: () => {
      if (!open) {
        return;
      }
      open = false;
      indexes = [];
      available.clear();
      texts.clear();
      capturedTexts.clear();
      materializedSources.clear();
      projections.clear();
      loader[Symbol.dispose]();
      shapeOwners.clear();
      aliases.clear();
      canonicalPaths.clear();
      authored.clear();
      for (const usage of bindingUses.values()) {
        usage[Symbol.dispose]();
      }
      bindingUses.clear();
      identityCatalogs.clear();
      fullCatalogs.clear();
      columnCatalogs.clear();
      for (const source of project.getSourceFiles()) {
        source.forget();
      }
      for (const carrier of contextProjects.values()) {
        for (const source of carrier.getSourceFiles()) {
          source.forget();
        }
      }
      contextProjects.clear();
      try {
        lease?.[Symbol.dispose]();
      } finally {
        dispose();
      }
    },
  };
  inventories.set(project, inventory);
  inventories.set(corpus, inventory);
  return inventory;
}

function invocationBindings(
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => Node,
  read: (file: string) => Iterable<InventoryPartition["bindings"][number]>,
): ReadonlyMap<Node, readonly Node[]> {
  const bindings = new Map<Node, readonly Node[]>();
  for (const source of wire.sources) {
    for (const fact of read(source.file)) {
      bindings.set(replay(fact.node), fact.symbols.lexical.map(replay));
    }
  }
  return bindings;
}
function invocationComputedKeys(wire: InventoryInvocationEvidence): readonly InventorySpan[] {
  return [...wire.sources.flatMap((source) => source.computed), ...(wire.observations?.keys ?? [])];
}
function invocationComputed(
  facts: readonly (InventoryPartition["computedNames"][number] | undefined)[],
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => Node,
): ReadonlyMap<Node, ReferenceFact<string>> {
  const computed = new Map<Node, ReferenceFact<string>>();
  invocationComputedKeys(wire).forEach((key, index) => {
    const fact = facts[index];
    if (fact === undefined) {
      throw new SemanticInventoryError("native invocation computed name is unavailable");
    }
    const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
    computed.set(
      replay(key),
      fact.result.kind === "resolved" ? { kind: fact.result.kind, value: fact.result.value, trace } : { ...fact.result, node: replay(fact.result.node), trace },
    );
  });
  return computed;
}
function invocationGlobalKeys(wire: InventoryInvocationEvidence): readonly InventorySpan[] {
  return wire.profiles.filter((profile) => profile.global === true).map((profile) => profile.node);
}
function invocationGlobals(
  facts: readonly (InventoryPartition["globalOrigins"][number] | undefined)[],
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => Node,
): ReadonlyMap<Node, ReferenceFact<GlobalMemberOrigin>> {
  const globals = new Map<Node, ReferenceFact<GlobalMemberOrigin>>();
  invocationGlobalKeys(wire).forEach((node, index) => {
    const fact = facts[index];
    if (fact === undefined) {
      throw new SemanticInventoryError("native invocation global origin is unavailable");
    }
    globals.set(replay(node), replayGlobalFact(fact, replay));
  });
  return globals;
}
function replayGlobalFact(fact: InventoryPartition["globalOrigins"][number], replay: (span: InventorySpan) => Node): ReferenceFact<GlobalMemberOrigin> {
  const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
  const result = fact.result;
  return result.kind === "resolved"
    ? {
        kind: result.kind,
        value: { kind: "global", globalName: result.globalName, memberPath: result.memberPath, declarations: result.declarations.map(replay) },
        trace,
      }
    : { ...result, node: replay(result.node), trace };
}

/** Resolve origins in the importing context; ordinary native SourceFiles retain their native reader. */
export function inventoryExports(source: SourceFile, importer?: Node): ReadonlyMap<string, readonly Node[]> {
  return semanticInventoryOf(source.getProject())?.exports(source, importer) ?? source.getExportedDeclarations();
}

/** Captured carriers share physical syntax only inside one admitted snapshot; native nodes retain compiler identity. */
export function samePhysicalNode(left: Node, right: Node): boolean {
  const inventory = semanticInventoryOf(left.getProject()) ?? semanticInventoryOf(right.getProject());
  return inventory === undefined ? left.compilerNode === right.compilerNode : inventory.sameNode(left, right);
}

/** Lexical and aliased identities share one canonical symbol read. */
export function declarationBindingKeySets(node: Node): DeclarationBindingKeys {
  const inventory = semanticInventoryOf(node.getProject());
  if (inventory !== undefined) {
    const symbols = inventory.symbols(inventoryBindingNode(node));
    const keys = (spans: readonly InventorySpan[]): readonly string[] => spans.map((span) => `${span.file}${INVENTORY_KEY_SEPARATOR}${String(span.start)}`);
    return { lexical: keys(symbols.lexical), origins: keys(symbols.origins) };
  }
  const parent = node.getParent();
  const symbol = TsNode.isShorthandPropertyAssignment(parent) && parent.getNameNode() === node ? parent.getValueSymbol() : node.getSymbol();
  return {
    lexical: (symbol?.getDeclarations() ?? []).map(inventoryDeclarationKey),
    origins: ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey),
  };
}

function inventoryBindingNode(node: Node): Node {
  return (TsNode.hasName(node) ? node.getNameNode() : undefined) ?? node;
}

/** Lexical and aliased bindings remain distinct for namespace identity and origin identity. */
export function declarationBindingKeys(node: Node, alias = true): readonly string[] {
  const keys = declarationBindingKeySets(node);
  return alias ? keys.origins : keys.lexical;
}

/** Read the native module target without asking a syntax carrier to construct a compiler program. */
export function inventoryStaticTarget(node: Node): SourceFile | undefined {
  const inventory = semanticInventoryOf(node.getProject());
  if (inventory !== undefined) {
    return inventory.moduleTarget(node);
  }
  return TsNode.isImportDeclaration(node) || TsNode.isExportDeclaration(node) ? node.getModuleSpecifierSourceFile() : undefined;
}

/** Physical declaration identity is shared by candidates and every consumer of a stored origin. */
export function inventoryDeclarationKey(node: Node): string {
  const path = node.getSourceFile().getFilePath();
  const canonical = semanticInventoryOf(node.getSourceFile().compilerNode)?.canonicalPath(path) ?? canonicalInventoryPath(path);
  return `${canonical}${INVENTORY_KEY_SEPARATOR}${String(node.getStart())}`;
}

function assertValueSourceCatalog(wire: InventoryInvocationEvidence, catalog: import("./drizzle-inventory-contract.ts").InventorySchemaIdentityCatalog): void {
  const declarations = new Set(catalog.fact.status === "ready" ? catalog.fact.value.tables.map((table) => inventoryNodeQueryKey(table.declaration)) : []);
  for (const profile of wire.profiles) {
    for (const table of profile["drizzle-value-sources"]?.tables ?? []) {
      if (table.references.some((reference) => reference.kind === "table" && !declarations.has(inventoryNodeQueryKey(reference.declaration)))) {
        throw new SemanticInventoryError("native value-source table declaration is foreign to its complete catalog");
      }
    }
  }
}

function assertValueSourceBasis(
  db: DatabaseSync,
  wire: InventoryInvocationEvidence,
  partition: StoredInventoryPartition,
  indexes: readonly StoredInventoryPartition[],
): void {
  if (invocationNeedsValueSourceCatalog(wire.query)) {
    const basis = wire.drizzleSourcesBasis;
    const catalog = basis === null ? partition : indexes.find((candidate) => candidate.program === basis?.program && candidate.id === basis.partition);
    if (catalog === undefined || basis === undefined || !catalog.families.includes("drizzle-identities")) {
      throw new SemanticInventoryError("native value-source catalog basis is outside the pinned generation");
    }
    assertValueSourceCatalog(wire, readInventorySchemaIdentity(db, catalog.id));
  }
}
