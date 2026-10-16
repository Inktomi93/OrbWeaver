import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { Node, SourceFile } from "ts-morph";
import { Project, Node as TsNode } from "ts-morph";
import { predictedProgram } from "../compiler/project-worlds.ts";
import { createSourceBindingUsage } from "./binding-usage.ts";
import type { DeclarationBindingKeys, SourceBindingUsage } from "./binding-usage-contract.ts";
import { replayDrizzleCallEvidence, replaySchemaIdentityCatalog } from "./drizzle-evidence-replay.ts";
import { replayInvocationEvidence } from "./invocation-evidence-replay.ts";
import type { GlobalMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";
import type {
  InventoryFamily,
  InventoryInvocationEvidence,
  InventoryPartition,
  InventoryReaderStorage,
  InventorySourceCorpus,
  InventorySpan,
  InventorySymbols,
  SemanticInventory,
  StoredInventoryPartition,
  StoredInventorySource,
} from "./semantic-inventory-contract.ts";
import { INVENTORY_KEY_SEPARATOR, SemanticInventoryError, shapePairKey } from "./semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "./semantic-inventory-inputs.ts";
import {
  readInventoryBindings,
  readInventoryBrands,
  readInventoryCallableDeclarations,
  readInventoryCasts,
  readInventoryComputedNames,
  readInventoryDeclarationOutputs,
  readInventoryDrizzleCall,
  readInventoryExportDeclarations,
  readInventoryExports,
  readInventoryGlobalBindings,
  readInventoryGlobalOrigins,
  readInventoryInvocationEvidence,
  readInventoryMemberOrigins,
  readInventoryModules,
  readInventoryPairs,
  readInventoryReferences,
  readInventoryRuntimeExports,
  readInventorySchemaIdentity,
  readInventoryShape,
  readInventorySourceMetadata,
  readInventorySourceText,
  readInventoryWitnesses,
} from "./semantic-inventory-queries.ts";
import { inventoryTextParts, inventoryTextVersion } from "./semantic-inventory-records.ts";

const inventories = new WeakMap<object, SemanticInventory>();

/** Identify a syntax carrier whose semantic queries belong to a pinned native generation. */
export function semanticInventoryOf(value: object): SemanticInventory | undefined {
  return inventories.get(value);
}

function spanKey(span: InventorySpan): string {
  return `${span.file}${INVENTORY_KEY_SEPARATOR}${String(span.start)}${INVENTORY_KEY_SEPARATOR}${String(span.end)}${INVENTORY_KEY_SEPARATOR}${String(span.kind)}`;
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

/** Materialize source syntax only; all typed questions select immutable native facts explicitly. */
export function inventoryReader(
  root: string,
  generation: number,
  partitions: readonly StoredInventoryPartition[],
  storage: InventoryReaderStorage,
): SemanticInventory {
  const { db, dispose, shapeCohort } = storage;
  const shapeOwners = new Map(storage.shapeOwners);
  let indexes = [...partitions];
  let open = true;
  const assertOpen = (): void => {
    if (!open) {
      throw new SemanticInventoryError("native semantic inventory has been disposed");
    }
  };
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
  const bindingUses = new Map<string, SourceBindingUsage>();
  const texts = new Map<string, { partition: string; source: StoredInventorySource }>();
  const aliases = new Map<string, string>();
  const roots = new Set(partitions.flatMap((partition) => partition.roots));
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
  const canonicalPath = (path: string): string => aliases.get(resolve(root, path)) ?? resolve(root, path);
  const capturedSpan = (node: Node): InventorySpan => ({ ...nodeSpan(node), file: canonicalPath(node.getSourceFile().getFilePath()) });
  const sourceFile = (path: string, context?: readonly string[]): SourceFile | undefined => {
    assertOpen();
    const file = canonicalPath(path);
    const carrier = contextProject(context);
    const existing = carrier.getSourceFile(file);
    const text = texts.get(file);
    if (existing !== undefined || text === undefined) {
      return existing;
    }
    const captured = readInventorySourceText(db, text.partition, text.source);
    const created = carrier.createSourceFile(file, captured);
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
    const leaf = sf?.getDescendantAtPos(span.start);
    const node = [sf, leaf, ...(leaf?.getAncestors() ?? [])].find(
      (candidate) => candidate?.getStart() === span.start && candidate.getEnd() === span.end && candidate.getKind() === span.kind,
    );
    if (node === undefined) {
      throw new SemanticInventoryError(`native semantic inventory cannot materialize span: ${spanKey(span)}`);
    }
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
      if (!partition.available.includes(value.file)) {
        throw new SemanticInventoryError(`native ${label} source is outside its native closure`);
      }
      const captured = sourceFile(value.file, [program]);
      if (captured === undefined) {
        throw new SemanticInventoryError(`native ${label} source is unavailable`);
      }
      const original = value.file === capturedSpan(node).file ? node.getSourceFile() : node.getProject().getSourceFile(value.file);
      if (original !== undefined && (original.wasForgotten() || original.getFullText() !== captured.getFullText())) {
        throw new SemanticInventoryError(`native ${label} replay source/epoch is stale`);
      }
      return nodeOf(value, [program], original ?? captured);
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
      const catalog = readInventorySchemaIdentity(db, partition.id);
      const expected = sources.map((source) => JSON.stringify(capturedSpan(source))).toSorted();
      if (JSON.stringify(catalog.sources.map(({ node }) => JSON.stringify(node)).toSorted()) !== JSON.stringify(expected)) {
        throw new SemanticInventoryError("native schema identity source demand is incomplete or foreign");
      }
      const first = sources[0];
      if (first === undefined) {
        if (catalog.fact.status !== "missing") {
          throw new SemanticInventoryError("native empty schema demand has nonmissing evidence");
        }
        return catalog.fact;
      }
      return replaySchemaIdentityCatalog(catalog, replayFor(first, program, partition, "schema identity"));
    },
    drizzleEvidence: (node, program, mode) => {
      const { partition, span } = nativeSpan(node, program, "drizzle-identities");
      if (!TsNode.isCallExpression(node)) {
        throw new SemanticInventoryError("native Drizzle query is not a call");
      }
      const fact = readInventoryDrizzleCall(db, partition.id, { node: span, mode });
      const catalogPartition = indexes.find((candidate) => candidate.id === fact.basis.partition && candidate.program === fact.basis.program);
      if (catalogPartition === undefined) {
        throw new SemanticInventoryError("native Drizzle catalog dependency is outside the pinned generation");
      }
      const catalog = replaySchemaIdentityCatalog(
        readInventorySchemaIdentity(db, catalogPartition.id),
        replayFor(node, catalogPartition.program, catalogPartition, "schema identity"),
      );
      return replayDrizzleCallEvidence(fact.evidence, catalog, replayFor(node, program, partition, "Drizzle call"), node);
    },
    invocationEvidence: (node, program, plan) => {
      const { partition, span } = nativeSpan(node, program, "invocation-evidence");
      const matches = [...readInventoryInvocationEvidence(db, partition.id, { ...plan, node: span })];
      const wire = matches[0];
      if (matches.length !== 1 || wire === undefined) {
        throw new SemanticInventoryError("native invocation query is unavailable in its captured native partition");
      }
      const replay = replayFor(node, program, partition, "invocation");
      const bindings = invocationBindings(db, partition.id, wire, replay);
      const computed = invocationComputed(db, partition.id, wire, replay);
      const globals = invocationGlobals(db, partition.id, wire, replay);
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
      return replayInvocationEvidence(wire, replay, {
        globals,
        declarations: (subject) => required(bindings, subject),
        computedName: (subject) => required(computed, subject),
      });
    },
    globalOrigin: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "global-origins");
      const matches = [...readInventoryGlobalOrigins(db, partition.id, span)];
      const fact = matches[0];
      if (matches.length !== 1 || fact === undefined) {
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
      const matches = [...readInventoryComputedNames(db, partition.id, span)];
      const fact = matches[0];
      if (matches.length !== 1 || fact === undefined) {
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
      const matches = [...readInventoryCallableDeclarations(db, partition.id, span)];
      const fact = matches[0];
      if (matches.length !== 1 || fact === undefined) {
        throw new SemanticInventoryError("native callable declaration span is unavailable in its native partition");
      }
      const replay = replayFor(node, program, partition, "callable declaration");
      const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
      const result = fact.result;
      if (result.kind === "unresolved") {
        return { kind: result.kind, reason: result.reason, detail: result.detail, node: replay(result.node), trace };
      }
      const declaration = replay(result.declaration);
      if (
        !(
          TsNode.isFunctionDeclaration(declaration) ||
          TsNode.isArrowFunction(declaration) ||
          TsNode.isFunctionExpression(declaration) ||
          TsNode.isMethodDeclaration(declaration)
        )
      ) {
        throw new SemanticInventoryError("native callable declaration is not a function-like source");
      }
      const body = result.body === null ? undefined : replay(result.body);
      const expectedBody = declaration.getBody();
      if (body?.compilerNode !== expectedBody?.compilerNode) {
        throw new SemanticInventoryError("native callable declaration body is incomplete or foreign");
      }
      return { kind: "resolved", value: { declaration, body, sourceFile: declaration.getSourceFile() }, trace };
    },
    callMemberOrigin: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "type-member-origins");
      requireFamily([partition], "bindings");
      const matches = [...readInventoryMemberOrigins(db, partition.id, span)];
      const fact = matches[0];
      if (matches.length !== 1 || fact === undefined) {
        throw new SemanticInventoryError("native call member origin span is unavailable in its native partition");
      }
      const materialize = (value: InventorySpan): Node => nodeOf(value, [program]);
      const bindings = fact.leaf === null ? [] : [...readInventoryBindings(db, partition.id, fact.leaf)];
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
      const matches = [...readInventoryDeclarationOutputs(db, partition.id, span)];
      const match = matches[0];
      if (matches.length !== 1 || match === undefined) {
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
      return readInventoryShape(db, partition.id, capturedSpan(node));
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
        .filter((partition) => partition.available.includes(query.left.file) && partition.available.includes(query.right.file))
        .map((partition) => {
          const matches = [...readInventoryPairs(db, partition.id, key)];
          const match = matches[0];
          if (matches.length !== 1 || match === undefined) {
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
      return [...readInventoryRuntimeExports(db, partition.id, span.file)];
    },
    idBrand: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "id-brands");
      const matches = [...readInventoryBrands(db, partition.id, span)];
      const match = matches[0];
      if (matches.length !== 1 || match === undefined) {
        throw new SemanticInventoryError("native id brand span is unavailable in its native partition");
      }
      return match.brand;
    },
    castRelation: (node, program) => {
      const { partition, span } = nativeSpan(node, program, "cast-relations");
      const matches = [...readInventoryCasts(db, partition.id, span)];
      const match = matches[0];
      if (matches.length !== 1 || match === undefined) {
        throw new SemanticInventoryError("native cast relation span is unavailable in its native partition");
      }
      return match.result;
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
      return spanKey(capturedSpan(left)) === spanKey(capturedSpan(right));
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
      const sets = selected.map((partition) => [...readInventoryExports(db, partition.id, file)].map(({ name, declarations }) => ({ name, declarations })));
      const exports = agreed(sets, `exports of ${file}`) ?? [];
      const context = selected.map((partition) => partition.program);
      return new Map(exports.map((entry) => [entry.name, entry.declarations.map((span) => nodeOf(span, context))]));
    },
    moduleTarget: (node) => {
      const key = spanKey(capturedSpan(node));
      const selected = worlds(node);
      requireFamily(selected, "modules");
      const target = agreed(
        selected.map((partition) => [...readInventoryModules(db, partition.id, capturedSpan(node))].at(-1)?.target ?? null),
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
      const key = spanKey(capturedSpan(node));
      const selected = worlds(node);
      requireFamily(selected, "bindings");
      return (
        agreed(
          selected.map((partition) => [...readInventoryBindings(db, partition.id, capturedSpan(node))].at(-1)?.symbols ?? { lexical: [], origins: [] }),
          `binding at ${key}`,
        ) ?? { lexical: [], origins: [] }
      );
    },
    references: (node) => {
      assertCapturedSource(node);
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
          found.set(spanKey(reference), reference);
        }
      }
      return [...found.values()].toSorted((a, b) => a.file.localeCompare(b.file) || a.start - b.start).map((span) => nodeOf(span));
    },
    witnessOrigins: (node) => {
      const key = spanKey(capturedSpan(node));
      const selected = worlds(node);
      requireFamily(selected, "witnesses");
      const spans =
        agreed(
          selected.map((partition) => [...readInventoryWitnesses(db, partition.id, capturedSpan(node))].at(-1)?.declarations ?? []),
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
      texts.clear();
      capturedTexts.clear();
      shapeOwners.clear();
      aliases.clear();
      authored.clear();
      for (const usage of bindingUses.values()) {
        usage[Symbol.dispose]();
      }
      bindingUses.clear();
      for (const source of project.getSourceFiles()) {
        source.forget();
      }
      for (const carrier of contextProjects.values()) {
        for (const source of carrier.getSourceFiles()) {
          source.forget();
        }
      }
      contextProjects.clear();
      dispose();
    },
  };
  inventories.set(project, inventory);
  inventories.set(corpus, inventory);
  return inventory;
}

function invocationBindings(
  db: DatabaseSync,
  id: string,
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => Node,
): ReadonlyMap<Node, readonly Node[]> {
  const bindings = new Map<Node, readonly Node[]>();
  for (const source of wire.sources) {
    for (const fact of readInventoryGlobalBindings(db, id, source.file)) {
      bindings.set(replay(fact.node), fact.symbols.lexical.map(replay));
    }
  }
  return bindings;
}
function invocationComputed(
  db: DatabaseSync,
  id: string,
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => Node,
): ReadonlyMap<Node, ReferenceFact<string>> {
  const computed = new Map<Node, ReferenceFact<string>>();
  for (const source of wire.sources) {
    for (const key of source.computed) {
      const [fact] = readInventoryComputedNames(db, id, key);
      if (fact === undefined) {
        throw new SemanticInventoryError("native invocation computed name is unavailable");
      }
      const trace = { origin: replay(fact.trace.origin), declarations: fact.trace.declarations.map(replay) };
      computed.set(
        replay(key),
        fact.result.kind === "resolved"
          ? { kind: fact.result.kind, value: fact.result.value, trace }
          : { ...fact.result, node: replay(fact.result.node), trace },
      );
    }
  }
  return computed;
}
function invocationGlobals(
  db: DatabaseSync,
  id: string,
  wire: InventoryInvocationEvidence,
  replay: (span: InventorySpan) => Node,
): ReadonlyMap<Node, ReferenceFact<GlobalMemberOrigin>> {
  const globals = new Map<Node, ReferenceFact<GlobalMemberOrigin>>();
  for (const profile of wire.profiles) {
    if (profile.global !== true) {
      continue;
    }
    const [fact] = readInventoryGlobalOrigins(db, id, profile.node);
    if (fact === undefined) {
      throw new SemanticInventoryError("native invocation global origin is unavailable");
    }
    globals.set(replay(profile.node), replayGlobalFact(fact, replay));
  }
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
