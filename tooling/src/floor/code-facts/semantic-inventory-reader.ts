import { resolve } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { Project, Node as TsNode } from "ts-morph";
import { predictedProgram } from "../compiler/project-worlds.ts";
import type { SourceCorpus } from "../compiler/ts-workspace-contract.ts";
import type { InventoryPartition, InventorySpan, InventorySymbols, SemanticInventory } from "./semantic-inventory-contract.ts";
import { INVENTORY_KEY_SEPARATOR, SemanticInventoryError } from "./semantic-inventory-contract.ts";
import { canonicalInventoryPath } from "./semantic-inventory-inputs.ts";

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
  if (values.some((value) => JSON.stringify(value) !== JSON.stringify(first))) {
    throw new SemanticInventoryError(`native semantic inventory ambiguity: ${label}`);
  }
  return first;
}

interface PartitionIndex {
  readonly partition: InventoryPartition;
  readonly exports: ReadonlyMap<string, InventoryPartition["exports"]>;
  readonly modules: ReadonlyMap<string, InventoryPartition["modules"][number]>;
  readonly bindings: ReadonlyMap<string, InventorySymbols>;
  readonly witnesses: ReadonlyMap<string, readonly InventorySpan[]>;
  readonly references: ReadonlyMap<string, readonly InventorySpan[]>;
}

function indexPartition(partition: InventoryPartition): PartitionIndex {
  const exports = new Map<string, InventoryPartition["exports"]>();
  for (const entry of partition.exports) {
    const entries = exports.get(entry.file) ?? [];
    entries.push(entry);
    exports.set(entry.file, entries);
  }
  const references = new Map<string, InventorySpan[]>();
  for (const entry of partition.references) {
    const key = spanKey(entry.declaration);
    const spans = references.get(key) ?? [];
    spans.push(entry.reference);
    references.set(key, spans);
  }
  return {
    partition,
    exports,
    references,
    modules: new Map(partition.modules.map((entry) => [spanKey(entry.node), entry])),
    bindings: new Map(partition.bindings.map((entry) => [spanKey(entry.node), entry.symbols])),
    witnesses: new Map(partition.witnesses.map((entry) => [spanKey(entry.node), entry.declarations])),
  };
}

/** Materialize source syntax only; all typed questions select immutable native facts explicitly. */
export function inventoryReader(root: string, generation: number, partitions: readonly InventoryPartition[], dispose: () => void): SemanticInventory {
  let indexes = partitions.map(indexPartition);
  let open = true;
  const assertOpen = (): void => {
    if (!open) {
      throw new SemanticInventoryError("native semantic inventory has been disposed");
    }
  };
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true, useInMemoryFileSystem: true });
  const contextProjects = new Map<string, Project>();
  const contextWorlds = new WeakMap<Project, readonly string[]>();
  const texts = new Map<string, string>();
  const aliases = new Map<string, string>();
  const roots = new Set(partitions.flatMap((partition) => partition.roots));
  for (const partition of partitions) {
    for (const source of partition.sources) {
      const previous = texts.get(source.file);
      if (previous !== undefined && previous !== source.text) {
        throw new SemanticInventoryError(`native semantic inventory mixed source versions: ${source.file}`);
      }
      texts.set(source.file, source.text);
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
    const carrier = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true, useInMemoryFileSystem: true });
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
    return existing ?? (text === undefined ? undefined : carrier.createSourceFile(file, text));
  };
  const nodeOf = (span: InventorySpan, context?: readonly string[]): Node => {
    const sf = sourceFile(span.file, context);
    const leaf = sf?.getDescendantAtPos(span.start);
    const node = [sf, leaf, ...(leaf?.getAncestors() ?? [])].find(
      (candidate) => candidate?.getStart() === span.start && candidate.getEnd() === span.end && candidate.getKind() === span.kind,
    );
    if (node === undefined) {
      throw new SemanticInventoryError(`native semantic inventory cannot materialize span: ${spanKey(span)}`);
    }
    return node;
  };
  const worlds = (node: Node): readonly PartitionIndex[] => {
    const file = canonicalPath(node.getSourceFile().getFilePath());
    assertOpen();
    const context = contextWorlds.get(node.getProject());
    if (context !== undefined) {
      return indexes.filter(({ partition }) => context.includes(partition.program));
    }
    const owners = indexes.filter(({ partition }) => partition.roots.includes(file));
    const predicted = predictedProgram(file.slice(root.length + 1));
    const primary = owners.find(({ partition }) => partition.program === predicted);
    return primary === undefined ? owners : [primary];
  };
  const corpus: SourceCorpus = {
    getSourceFiles: () =>
      [...roots].toSorted().map((file) => {
        const sf = sourceFile(file);
        if (sf === undefined) {
          throw new SemanticInventoryError(`native semantic inventory missing authored root: ${file}`);
        }
        return sf;
      }),
    getSourceFile: sourceFile,
  };
  // biome-ignore lint/nursery/useDisposables: the returned handle transfers disposal ownership to the caller.
  const inventory: SemanticInventory = {
    generation,
    programs: partitions.map((partition) => partition.program),
    canonicalPath,
    sourceCorpus: () => corpus,
    exports: (source, importer) => {
      const file = canonicalPath(source.getFilePath());
      const selected = worlds(importer ?? source);
      const sets = selected.map((partition) => (partition.exports.get(file) ?? []).map(({ name, declarations }) => ({ name, declarations })));
      const exports = agreed(sets, `exports of ${file}`) ?? [];
      const context = selected.map(({ partition }) => partition.program);
      return new Map(exports.map((entry) => [entry.name, entry.declarations.map((span) => nodeOf(span, context))]));
    },
    moduleTarget: (node) => {
      const key = spanKey(capturedSpan(node));
      const selected = worlds(node);
      const target = agreed(
        selected.map((partition) => partition.modules.get(key)?.target ?? null),
        `module target at ${key}`,
      );
      return target === undefined || target === null
        ? undefined
        : sourceFile(
            target,
            selected.map(({ partition }) => partition.program),
          );
    },
    symbols: (node): InventorySymbols => {
      const key = spanKey(capturedSpan(node));
      return (
        agreed(
          worlds(node).map((partition) => partition.bindings.get(key) ?? { lexical: [], origins: [] }),
          `binding at ${key}`,
        ) ?? { lexical: [], origins: [] }
      );
    },
    references: (node) => {
      const key = spanKey(capturedSpan(node));
      const found = new Map<string, InventorySpan>();
      assertOpen();
      for (const partition of indexes) {
        for (const span of partition.references.get(key) ?? []) {
          found.set(spanKey(span), span);
        }
      }
      return [...found.values()].toSorted((a, b) => a.file.localeCompare(b.file) || a.start - b.start).map((span) => nodeOf(span));
    },
    witnessOrigins: (node) => {
      const key = spanKey(capturedSpan(node));
      const spans =
        agreed(
          worlds(node).map((partition) => partition.witnesses.get(key) ?? []),
          `witness at ${key}`,
        ) ?? [];
      return spans.map((span) => nodeOf(span));
    },
    [Symbol.dispose]: () => {
      open = false;
      indexes = [];
      texts.clear();
      aliases.clear();
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

/** Resolve origins in the importing context; ordinary native SourceFiles retain their native reader. */
export function inventoryExports(source: SourceFile, importer?: Node): ReadonlyMap<string, readonly Node[]> {
  return semanticInventoryOf(source.getProject())?.exports(source, importer) ?? source.getExportedDeclarations();
}

function inventoryBindingKeys(node: Node, alias = true): readonly string[] | undefined {
  const inventory = semanticInventoryOf(node.getProject());
  if (inventory === undefined) {
    return;
  }
  const name = TsNode.hasName(node) ? node.getNameNode() : undefined;
  const symbols = inventory.symbols(name ?? node);
  return (alias ? symbols.origins : symbols.lexical).map((span) => `${span.file}${INVENTORY_KEY_SEPARATOR}${String(span.start)}`);
}

/** Lexical and aliased bindings remain distinct for namespace identity and origin identity. */
export function declarationBindingKeys(node: Node, alias = true): readonly string[] {
  const stored = inventoryBindingKeys(node, alias);
  if (stored !== undefined) {
    return stored;
  }
  const parent = node.getParent();
  const symbol = TsNode.isShorthandPropertyAssignment(parent) && parent.getNameNode() === node ? parent.getValueSymbol() : node.getSymbol();
  return ((alias ? (symbol?.getAliasedSymbol() ?? symbol) : symbol)?.getDeclarations() ?? []).map(inventoryDeclarationKey);
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
  const canonical = semanticInventoryOf(node.getProject())?.canonicalPath(path) ?? canonicalInventoryPath(path);
  return `${canonical}${INVENTORY_KEY_SEPARATOR}${String(node.getStart())}`;
}
