// Each extraction owns exactly one native descriptor. No Project crosses the worker boundary.

import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { inventoryConsumerClass } from "../code-facts/inventory-consumers.ts";
import type { InventoryBuildRequest, InventoryInput, InventoryPartition, InventorySpan } from "../code-facts/semantic-inventory-contract.ts";
import { INVENTORY_FORMAT } from "../code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath, descriptorVersion, inputVersion } from "../code-facts/semantic-inventory-inputs.ts";
import { readAuthoredRepositoryInventory } from "./authored-repository.ts";
import { inventoryFileSystem } from "./semantic-inventory-filesystem.ts";
import { descendantsOfKind, nativeCompilerSourceFiles } from "./ts-workspace.ts";

interface InventorySpans {
  readonly path: (path: string) => string;
  readonly span: (path: string, start: number, end: number, kind: number) => InventorySpan;
  readonly node: (node: MorphNode) => InventorySpan;
}

interface InventoryFileSpans {
  readonly path: string;
  readonly spans: Map<string, InventorySpan>;
}

function inventorySpans(): InventorySpans {
  const files = new Map<string, InventoryFileSpans>();
  const file = (path: string): InventoryFileSpans => {
    // Intern resolved values, not lookup results: a symlink change must still be observed.
    const canonical = canonicalInventoryPath(path);
    let entry = files.get(canonical);
    if (entry === undefined) {
      entry = { path: canonical, spans: new Map() };
      files.set(canonical, entry);
    }
    return entry;
  };
  const span = (path: string, start: number, end: number, kind: number): InventorySpan => {
    const entry = file(path);
    const key = `${String(start)}:${String(end)}:${String(kind)}`;
    let value = entry.spans.get(key);
    if (value === undefined) {
      value = Object.freeze({ file: entry.path, start, end, kind });
      entry.spans.set(key, value);
    }
    return value;
  };
  return {
    path: (path: string): string => file(path).path,
    span,
    node: (node: MorphNode): InventorySpan => span(node.getSourceFile().getFilePath(), node.getStart(), node.getEnd(), node.getKind()),
  };
}

function bindingFacts(node: MorphNode, spans: InventorySpans): { lexical: InventorySpan[]; origins: InventorySpan[] } {
  const parent = node.getParent();
  const symbol = Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === node ? parent.getValueSymbol() : node.getSymbol();
  return {
    lexical: (symbol?.getDeclarations() ?? []).map(spans.node),
    origins: ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).map(spans.node),
  };
}

function moduleFacts(sf: SourceFile, spans: InventorySpans): InventoryPartition["modules"] {
  const out: InventoryPartition["modules"] = [];
  for (const node of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const literal = node.getModuleSpecifier();
    if (literal === undefined) {
      continue;
    }
    const target = node.getModuleSpecifierSourceFile();
    out.push({
      node: spans.node(node),
      target: target === undefined ? null : spans.path(target.getFilePath()),
      declarations: (literal.getSymbol()?.getDeclarations() ?? []).map(spans.node),
      specifier: literal.getLiteralText(),
      dynamic: false,
    });
  }
  for (const call of descendantsOfKind(sf, SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const literal = call.getArguments()[0];
    if (literal === undefined || !Node.isStringLiteral(literal)) {
      out.push({ node: spans.node(call), target: null, declarations: [], specifier: null, dynamic: true });
      continue;
    }
    const [module] = call.getType().getTypeArguments();
    const target = module?.getSymbol()?.getDeclarations().find(Node.isSourceFile);
    out.push({
      node: spans.node(call),
      target: target === undefined ? null : spans.path(target.getFilePath()),
      declarations: (module?.getSymbol()?.getDeclarations() ?? []).map(spans.node),
      specifier: literal.getLiteralText(),
      dynamic: true,
    });
  }
  return out;
}

function witnessFacts(sf: SourceFile, spans: InventorySpans): InventoryPartition["witnesses"] {
  const out: InventoryPartition["witnesses"] = [];
  for (const node of descendantsOfKind(sf, SyntaxKind.SatisfiesExpression)) {
    const type = node.getTypeNode();
    if (!Node.isTypeOperatorTypeNode(type) || type.getOperator() !== SyntaxKind.KeyOfKeyword) {
      continue;
    }
    const imported = type.getTypeNode();
    const expression = node.getExpression();
    if (!(Node.isImportTypeNode(imported) && imported.compilerNode.isTypeOf) || imported.getQualifier() !== undefined || !Node.isStringLiteral(expression)) {
      continue;
    }
    const name = expression.getLiteralText();
    const symbol = imported.getType().getProperty(name);
    out.push({ node: spans.node(node), name, declarations: ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).map(spans.node) });
  }
  return out;
}

/** Extract primitive compiler facts without running any consumer classification. */
export function extractInventoryPartition(request: InventoryBuildRequest): InventoryPartition {
  const spans = inventorySpans();
  const inputs = new Map<string, InventoryInput>();
  const base = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
  const fileSystem = inventoryFileSystem(base, request.overlay, inputs);
  const implementationInputs = [
    import.meta.filename,
    ts.sys.getExecutingFilePath(),
    fileURLToPath(new URL("./ts-workspace.ts", import.meta.url)),
    fileURLToPath(new URL("./semantic-inventory-filesystem.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-contract.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-inputs.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-database.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-records.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-queries.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory-reader.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/semantic-inventory.ts", import.meta.url)),
    fileURLToPath(import.meta.resolve("ts-morph")),
    createRequire(import.meta.resolve("ts-morph")).resolve("@ts-morph/common"),
    resolve(request.root, "pnpm-lock.yaml"),
  ];
  for (const absolute of [...request.descriptor.configPaths.map((path) => resolve(request.root, path)), ...implementationInputs]) {
    inputs.set(`file\0${absolute}`, { path: absolute, kind: "file", version: inputVersion(absolute, "file", fileSystem) });
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: request.descriptor.commandLine.options, fileSystem });
  const files = project.forgetNodesCreatedInBlock(() => {
    for (const path of request.descriptor.files) {
      project.addSourceFileAtPath(resolve(request.root, path));
    }
    project.resolveSourceFileDependencies();
    return nativeCompilerSourceFiles(project);
  });
  // Bootstrap forgetting can recreate ancestors; retain the native SourceFiles, not their incidental wrappers.
  for (const sf of files) {
    sf.forgetDescendants();
  }
  const roots = request.descriptor.files.map((path) => spans.path(resolve(request.root, path)));
  const authored = new Set(
    [...readAuthoredRepositoryInventory(request.root).paths, ...(request.overlay?.files.map((file) => file.path) ?? [])].map((path) =>
      spans.path(resolve(request.root, path)),
    ),
  );
  const service = project.getLanguageService().compilerObject;
  const program = service.getProgram();
  if (program === undefined) {
    throw new Error("native inventory language service has no Program");
  }
  const { referenceDeclarations, ...sourceFacts } = extractSourceFacts(program, files, authored, spans);
  const facts = { ...sourceFacts, references: extractReferenceFacts(service, referenceDeclarations, spans) };
  return {
    format: INVENTORY_FORMAT,
    program: request.descriptor.id,
    descriptorVersion: descriptorVersion(request.descriptor),
    compilerOptionsJson: JSON.stringify(request.descriptor.commandLine.options),
    configPaths: [...request.descriptor.configPaths],
    projectReferences: [...request.descriptor.references],
    workerPid: process.pid,
    roots,
    nativeRoots: [...project.getProgram().compilerObject.getRootFileNames()],
    inputs: [...inputs.values()].toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)),
    sources: files.map((sf) => ({
      file: spans.path(sf.getFilePath()),
      path: sf.getFilePath(),
      consumerClass: inventoryConsumerClass(sf.getFilePath()),
      text: sf.getFullText(),
      authored: authored.has(spans.path(sf.getFilePath())),
    })),
    ...facts,
  };
}

interface ReferenceDeclaration {
  readonly declaration: InventorySpan;
  readonly name: InventorySpan | undefined;
  readonly query: { readonly file: string; readonly start: number };
}

function registerReferenceDeclarations(
  declarations: readonly MorphNode[],
  authored: ReadonlySet<string>,
  target: Map<InventorySpan, ReferenceDeclaration>,
  spans: InventorySpans,
): void {
  for (const declaration of declarations) {
    if (authored.has(spans.path(declaration.getSourceFile().getFilePath())) && Node.isReferenceFindable(declaration)) {
      const span = spans.node(declaration);
      const query = referenceQueryNode(declaration);
      const name = Node.hasName(declaration) ? declaration.getNameNode() : undefined;
      target.set(span, {
        declaration: span,
        name: name !== undefined && Node.isReferenceFindable(name) ? spans.node(name) : undefined,
        query: { file: query.getSourceFile().getFilePath(), start: query.getStart() },
      });
    }
  }
}

function extractSourceFacts(
  program: ts.Program,
  files: readonly SourceFile[],
  authored: ReadonlySet<string>,
  spans: InventorySpans,
): Pick<InventoryPartition, "exports" | "modules" | "bindings" | "witnesses"> & { referenceDeclarations: ReadonlyMap<InventorySpan, ReferenceDeclaration> } {
  const exports: InventoryPartition["exports"] = [];
  const modules: InventoryPartition["modules"] = [];
  const bindings: InventoryPartition["bindings"] = [];
  const witnesses: InventoryPartition["witnesses"] = [];
  const referenceDeclarations = new Map<InventorySpan, ReferenceDeclaration>();
  const standaloneSources = nativeCompilerSourceFiles(program);
  const byCompilerSource = new Map(standaloneSources.map((sf) => [sf.compilerNode, sf]));
  try {
    for (const original of files) {
      const sf = byCompilerSource.get(original.compilerNode);
      if (sf === undefined) {
        throw new Error(`native inventory source is not shared with its language-service Program: ${original.getFilePath()}`);
      }
      const file = spans.path(sf.getFilePath());
      // Dependency exports are required because importing worlds can resolve a package to a distinct closure.
      for (const [name, declarations] of sf.getExportedDeclarations()) {
        exports.push({ file, name, declarations: declarations.map(spans.node) });
        registerReferenceDeclarations(declarations, authored, referenceDeclarations, spans);
      }
      if (authored.has(file)) {
        modules.push(...moduleFacts(sf, spans));
        witnesses.push(...witnessFacts(sf, spans));
        for (const id of descendantsOfKind(sf, SyntaxKind.Identifier)) {
          const symbols = bindingFacts(id, spans);
          bindings.push({ node: spans.node(id), symbols });
          const symbol = id.getSymbol();
          registerReferenceDeclarations(symbol?.getDeclarations() ?? [], authored, referenceDeclarations, spans);
        }
      }
      sf.forgetDescendants();
    }
  } finally {
    // These wrappers belong to the standalone checker context, never either native Program's host.
    for (const sf of standaloneSources) {
      sf.forget();
    }
  }
  return { exports, modules, bindings, witnesses, referenceDeclarations };
}

function extractReferenceFacts(
  service: ts.LanguageService,
  referenceDeclarations: ReadonlyMap<InventorySpan, ReferenceDeclaration>,
  spans: InventorySpans,
): InventoryPartition["references"] {
  const references: InventoryPartition["references"] = [];
  // Use the native language service, not an approximation based on equal-spelled identifiers.
  for (const declaration of referenceDeclarations.values()) {
    const nativeReferences = nativeReferenceFacts(service, declaration.query, spans);
    for (const reference of nativeReferences) {
      references.push({
        declaration: declaration.declaration,
        ...reference,
      });
    }
    if (declaration.name !== undefined) {
      for (const reference of nativeReferences) {
        references.push({
          declaration: declaration.name,
          ...reference,
        });
      }
    }
  }
  return references;
}

function nativeReferenceFacts(
  service: ts.LanguageService,
  query: ReferenceDeclaration["query"],
  spans: InventorySpans,
): Pick<InventoryPartition["references"][number], "reference" | "consumerClass">[] {
  // DocumentSpan wrappers subscribe to source modifications and retain every result in this read-only worker.
  const groups = service.findReferences(query.file, query.start, { includeDefinitionDisplay: false }) ?? [];
  const program = service.getProgram();
  const references: Pick<InventoryPartition["references"][number], "reference" | "consumerClass">[] = [];
  for (const group of groups) {
    const alias = group.definition.kind === ts.ScriptElementKind.alias;
    for (const [index, reference] of group.references.entries()) {
      if (alias || reference.isDefinition !== true || index > 0) {
        const source = program?.getSourceFile(reference.fileName);
        if (source === undefined) {
          throw new Error(`native reference source is outside its language-service program: ${reference.fileName}`);
        }
        references.push({ reference: nativeReferenceSpan(source, reference.textSpan, spans), consumerClass: inventoryConsumerClass(reference.fileName) });
      }
    }
  }
  return references;
}

function referenceQueryNode(declaration: MorphNode): MorphNode {
  if (Node.isIdentifier(declaration) || Node.isStringLiteral(declaration)) {
    return declaration;
  }
  const name = declaration.getNodeProperty<"name", ts.NamedDeclaration>("name");
  return name ?? (Node.isExportable(declaration) ? (declaration.getDefaultKeyword() ?? declaration) : declaration);
}

function nativeReferenceSpan(source: ts.SourceFile, span: ts.TextSpan, spans: InventorySpans): InventorySpan {
  let best: ts.Node = source;
  let found = false;
  let node: ts.Node | undefined = source;
  while (node !== undefined) {
    if (!found) {
      best = node;
    }
    // DocumentSpan compares node width with the span's end, not length; retain its physical-node selection.
    if (node.getStart(source) === span.start && node.getWidth(source) === span.start + span.length) {
      best = node;
      found = true;
    } else if (found) {
      break;
    }
    node = node.getChildren(source).find((child) => child.pos <= span.start && span.start < child.end);
  }
  return spans.span(source.fileName, best.getStart(source), best.end, best.kind);
}
