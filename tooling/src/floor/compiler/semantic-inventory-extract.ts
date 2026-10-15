// Each extraction owns exactly one native descriptor. No Project crosses the worker boundary.

import { createRequire } from "node:module";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { FileSystemHost, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import type { AssignabilityChecker } from "../code-facts/assignability.ts";
import { readAssignabilityChecker, readNativeTypeRelation } from "../code-facts/assignability.ts";
import { readDeclarationOutput } from "../code-facts/declaration-output.ts";
import { nativeIdBrand } from "../code-facts/id-brand.ts";
import { inventoryConsumerClass } from "../code-facts/inventory-consumers.ts";
import { beginReferencePass, endReferencePass, referenceResolutionServices, resolveGlobalMemberOrigin } from "../code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../code-facts/reference-fact-call.ts";
import { readRuntimeExports } from "../code-facts/runtime-export.ts";
import type { InventoryBuildRequest, InventoryFamily, InventoryInput, InventoryPartition, InventorySpan } from "../code-facts/semantic-inventory-contract.ts";
import { INVENTORY_FORMAT, inventoryFamilies, inventoryNodeQueryKey } from "../code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath, descriptorVersion, inputVersion, inventoryAuthoredFiles } from "../code-facts/semantic-inventory-inputs.ts";
import { originRefusalLeaf, readCallMemberDeclarationOrigin } from "../code-facts/type-member-origin.ts";
import { inventoryFileSystem } from "./semantic-inventory-filesystem.ts";
import { extractShape, extractShapePairs } from "./shape-inventory-extract.ts";
import { collectByKinds, descendantsOfKind, nativeCompilerSourceFiles, nativeReferenceNode } from "./ts-workspace.ts";

interface InventorySpans {
  readonly path: (path: string) => string;
  readonly span: (path: string, start: number, end: number, kind: number) => InventorySpan;
  readonly node: (node: MorphNode) => InventorySpan;
}

interface InventoryFileSpans {
  readonly path: string;
  readonly spans: Map<string, InventorySpan>;
}

interface InventorySources {
  readonly files: readonly SourceFile[];
  readonly nativeSources: ReadonlyMap<string, ts.SourceFile>;
}

function inventorySpans(fileSystem: FileSystemHost): InventorySpans {
  const files = new Map<string, InventoryFileSpans>();
  const observe = (path: string): void => {
    if (!fileSystem.fileExistsSync(path)) {
      fileSystem.directoryExistsSync(path);
    }
  };
  const file = (path: string): InventoryFileSpans => {
    const existing = files.get(path);
    if (existing !== undefined) {
      return existing;
    }
    // The tracked filesystem pins alias identities; publication rejects retargets before exposing these spans.
    observe(path);
    const canonical = canonicalInventoryPath(path);
    let entry = files.get(canonical);
    if (entry === undefined) {
      if (canonical !== path) {
        observe(canonical);
      }
      entry = { path: canonical, spans: new Map() };
      files.set(canonical, entry);
    }
    files.set(path, entry);
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
  const families = request.intent === "membership" ? [] : inventoryFamilies(request.families);
  if (request.intent === "membership" && request.families !== undefined && request.families.length > 0) {
    throw new Error("membership extraction cannot supply typed families");
  }
  const inputs = new Map<string, InventoryInput>();
  const base = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
  const fileSystem = inventoryFileSystem(base, request.overlay, inputs);
  const spans = inventorySpans(fileSystem);
  const implementationInputs = [
    import.meta.filename,
    fileURLToPath(new URL("./shape-inventory-extract.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/shape-fields.ts", import.meta.url)),
    fileURLToPath(new URL("../code-facts/shape-derivation.ts", import.meta.url)),
    ...(families.includes("runtime-exports")
      ? [
          fileURLToPath(new URL("../code-facts/runtime-export.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/expression-value.ts", import.meta.url)),
        ]
      : []),
    ...(families.includes("id-brands") ? [fileURLToPath(new URL("../code-facts/id-brand.ts", import.meta.url))] : []),
    ...(families.includes("declaration-outputs") ? [fileURLToPath(new URL("../code-facts/declaration-output.ts", import.meta.url))] : []),
    ...(families.includes("callable-declarations") || families.includes("computed-names") || families.includes("global-origins")
      ? [
          "reference-fact.ts",
          "reference-fact-call.ts",
          "reference-fact-alias.ts",
          "reference-fact-binding-name.ts",
          "reference-fact-global.ts",
          "reference-fact-member.ts",
          "reference-fact-module.ts",
          "reference-fact-module-helpers.ts",
          "reference-fact-overload.ts",
          "reference-fact-same-file-merge.ts",
          "reference-fact-state.ts",
          "reference-fact-writes.ts",
          "reference-fact-contract.ts",
        ].map((name) => fileURLToPath(new URL(`../code-facts/${name}`, import.meta.url)))
      : []),
    ...(families.includes("type-member-origins")
      ? [
          fileURLToPath(new URL("../code-facts/type-member-origin.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/type-member-origin-core.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/reference-fact.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/reference-fact-alias.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/reference-fact-member.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/reference-fact-writes.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/reference-fact-contract.ts", import.meta.url)),
        ]
      : []),
    ...(families.some((family) => family === "cast-relations" || family === "shape-pairs")
      ? [
          fileURLToPath(new URL("../code-facts/assignability.ts", import.meta.url)),
          fileURLToPath(new URL("../code-facts/assignability-contract.ts", import.meta.url)),
        ]
      : []),
    ts.sys.getExecutingFilePath(),
    fileURLToPath(new URL("./ts-workspace.ts", import.meta.url)),
    fileURLToPath(new URL("./authored-repository.ts", import.meta.url)),
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
  const sources = project.forgetNodesCreatedInBlock(() => {
    for (const path of request.descriptor.files) {
      project.addSourceFileAtPath(resolve(request.root, path));
    }
    project.resolveSourceFileDependencies();
    // Project wrappers can cache unredirected parses; capture the Program's admitted nodes before wrapping.
    const nativeSources = new Map(
      project
        .getProgram()
        .compilerObject.getSourceFiles()
        .map((source) => [source.fileName, source]),
    );
    return { files: nativeCompilerSourceFiles(project), nativeSources };
  });
  // Bootstrap forgetting can recreate ancestors; retain the native SourceFiles, not their incidental wrappers.
  for (const sf of sources.files) {
    sf.forgetDescendants();
  }
  const roots = request.descriptor.files.map((path) => spans.path(resolve(request.root, path)));
  const callableQueries = callableDemandFor(request, families, roots);
  const computedNameQueries = computedDemandFor(request, families, roots);
  const globalOriginQueries = globalDemandFor(request, families, roots, "globalOriginQueries");
  const globalBindingQueries = globalDemandFor(request, families, roots, "globalBindingQueries");
  const authoredFiles = inventoryAuthoredFiles(request.root, request.overlay);
  const authored = (path: string): boolean => {
    const version = inputVersion(path, "authored", authoredFiles);
    const key = `authored\0${path}`;
    if (!inputs.has(key)) {
      inputs.set(key, { path, kind: "authored", version });
    }
    return version === "true";
  };
  const available = [...new Set(sources.files.map((source) => spans.path(source.getFilePath())))];
  const facts =
    request.intent === "membership"
      ? {
          exports: [],
          modules: [],
          bindings: [],
          witnesses: [],
          casts: [],
          brands: [],
          runtimeExports: [],
          declarationOutputs: [],
          memberOrigins: [],
          callableDeclarations: [],
          computedNames: [],
          globalOrigins: [],
          globalBindings: [],
          shapes: [],
          pairs: [],
          references: [],
        }
      : extractTypedFacts(project, {
          sources,
          authored,
          spans,
          families,
          queries: request.shapeQueries ?? [],
          callableQueries,
          computedNameQueries,
          globalOriginQueries,
          globalBindingQueries,
        });
  return {
    intent: request.intent ?? "facts",
    available,
    format: INVENTORY_FORMAT,
    families,
    program: request.descriptor.id,
    descriptorVersion: descriptorVersion(request.descriptor),
    compilerOptionsJson: JSON.stringify(request.descriptor.commandLine.options),
    configPaths: [...request.descriptor.configPaths],
    projectReferences: [...request.descriptor.references],
    workerPid: process.pid,
    roots,
    nativeRoots: [...project.getProgram().compilerObject.getRootFileNames()],
    sources: sources.files.map((sf) => ({
      file: spans.path(sf.getFilePath()),
      path: sf.getFilePath(),
      consumerClass: inventoryConsumerClass(sf.getFilePath()),
      text: sf.getFullText(),
      authored: authored(spans.path(sf.getFilePath())),
    })),
    // Metadata also observes membership; capture inputs only after every source decision has been recorded.
    inputs: [...inputs.values()].toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind)),
    ...facts,
  };
}

interface ReferenceDeclaration {
  readonly declaration: InventorySpan;
  readonly name: InventorySpan | undefined;
  readonly query: { readonly file: string; readonly start: number };
}

function extractTypedFacts(
  project: Project,
  input: {
    readonly sources: InventorySources;
    readonly authored: (path: string) => boolean;
    readonly spans: InventorySpans;
    readonly families: readonly InventoryFamily[];
    readonly queries: readonly import("../code-facts/semantic-inventory-contract.ts").InventoryShapeQuery[];
    readonly callableQueries: readonly InventorySpan[];
    readonly computedNameQueries: readonly InventorySpan[];
    readonly globalOriginQueries: readonly InventorySpan[];
    readonly globalBindingQueries: readonly InventorySpan[];
  },
): SourceFactValues & Pick<InventoryPartition, "pairs" | "references"> {
  const { sources, authored, spans, families, queries, callableQueries, computedNameQueries, globalOriginQueries, globalBindingQueries } = input;
  const service = project.getLanguageService().compilerObject;
  const program = service.getProgram();
  if (program === undefined) {
    throw new Error("native inventory language service has no Program");
  }
  const callablePass = families.includes("callable-declarations") || families.includes("computed-names") || families.includes("global-origins");
  if (callablePass) {
    beginReferencePass();
  }
  try {
    const { referenceDeclarations, ...sourceFacts } = extractSourceFacts(program, sources, authored, {
      spans,
      families: new Set(families),
      callableQueries,
      computedNameQueries,
      globalOriginQueries,
      globalBindingQueries,
    });
    return {
      ...sourceFacts,
      pairs: families.includes("shape-pairs") ? extractShapePairs(program, queries) : [],
      references: families.includes("references") ? extractReferenceFacts(service, program, referenceDeclarations, spans) : [],
    };
  } finally {
    if (callablePass) {
      endReferencePass();
    }
  }
}

function registerReferenceDeclarations(
  declarations: readonly MorphNode[],
  authored: (path: string) => boolean,
  target: Map<InventorySpan, ReferenceDeclaration>,
  spans: InventorySpans,
): void {
  for (const declaration of declarations) {
    if (authored(spans.path(declaration.getSourceFile().getFilePath())) && Node.isReferenceFindable(declaration)) {
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

function sharedSourceFile(program: ts.Program, native: ts.SourceFile | undefined, wrappers: ReadonlyMap<ts.SourceFile, SourceFile>): SourceFile | undefined {
  if (native === undefined) {
    return undefined;
  }
  const exact = wrappers.get(native);
  if (exact !== undefined) {
    return exact;
  }
  const admitted = program.getSourceFile(native.fileName);
  // Recreated package redirects share native syntax; equal filenames or bytes alone prove nothing.
  return admitted !== undefined &&
    admitted.fileName === native.fileName &&
    admitted.text === native.text &&
    admitted.statements === native.statements &&
    admitted.endOfFileToken === native.endOfFileToken
    ? wrappers.get(admitted)
    : undefined;
}

function assertAuthoredSyntax(original: SourceFile, admitted: SourceFile, spans: InventorySpans): void {
  if (
    original.getFullText() !== admitted.getFullText() ||
    spans.path(admitted.compilerNode.endOfFileToken.getSourceFile().fileName) !== spans.path(original.getFilePath())
  ) {
    throw new Error(`native inventory authored source selects a different syntax origin: ${original.getFilePath()}`);
  }
}

type SourceFactValues = Pick<
  InventoryPartition,
  | "exports"
  | "modules"
  | "bindings"
  | "witnesses"
  | "casts"
  | "brands"
  | "runtimeExports"
  | "declarationOutputs"
  | "memberOrigins"
  | "callableDeclarations"
  | "computedNames"
  | "globalOrigins"
  | "globalBindings"
  | "shapes"
>;
interface SourceFactCollection {
  readonly families: ReadonlySet<InventoryFamily>;
  readonly spans: InventorySpans;
  readonly authored: (path: string) => boolean;
  readonly values: SourceFactValues;
  readonly referenceDeclarations: Map<InventorySpan, ReferenceDeclaration>;
  readonly shapeNodes: WeakSet<ts.Node>;
  readonly checker: AssignabilityChecker | undefined;
  readonly callableQueries: Set<string>;
  readonly computedNameQueries: Set<string>;
  readonly computedKinds: ReadonlySet<SyntaxKind>;
  readonly globalOriginQueries: Set<string>;
  readonly globalBindingQueries: Set<string>;
  readonly globalKinds: ReadonlySet<SyntaxKind>;
}

function collectExportFacts(sf: SourceFile, context: SourceFactCollection): void {
  if (!(context.families.has("exports") || context.families.has("references") || context.families.has("shape-catalog"))) {
    return;
  }
  for (const [name, declarations] of sf.getExportedDeclarations()) {
    collectExportShapes(sf, declarations, context);
    if (context.families.has("exports")) {
      context.values.exports.push({ file: context.spans.path(sf.getFilePath()), name, declarations: declarations.map(context.spans.node) });
    }
    if (context.families.has("references")) {
      registerReferenceDeclarations(declarations, context.authored, context.referenceDeclarations, context.spans);
    }
  }
}

function collectShapeFact(node: MorphNode, context: SourceFactCollection): void {
  if (context.shapeNodes.has(node.compilerNode)) {
    return;
  }
  context.shapeNodes.add(node.compilerNode);
  context.values.shapes.push(extractShape(node, context.spans.node));
}

function collectExportShapes(sf: SourceFile, declarations: readonly MorphNode[], context: SourceFactCollection): void {
  if (!(context.families.has("shape-catalog") && context.authored(context.spans.path(sf.getFilePath())))) {
    return;
  }
  for (const declaration of declarations) {
    if (declaration.getSourceFile().compilerNode === sf.compilerNode) {
      collectShapeFact(declaration, context);
    }
  }
}

function collectIdentifierFacts(node: MorphNode, context: SourceFactCollection): void {
  const span = context.spans.node(node);
  const closed = context.globalBindingQueries.delete(inventoryNodeQueryKey(span));
  if (context.families.has("bindings") || closed) {
    context.values.bindings.push({ node: context.spans.node(node), symbols: bindingFacts(node, context.spans) });
  }
  if (closed) {
    context.values.globalBindings.push(span);
  }
  if (context.families.has("references")) {
    registerReferenceDeclarations(node.getSymbol()?.getDeclarations() ?? [], context.authored, context.referenceDeclarations, context.spans);
  }
}

function collectCastFact(node: MorphNode, context: SourceFactCollection): void {
  if (!Node.isAsExpression(node)) {
    throw new Error("native cast visitor received another node kind");
  }
  context.values.casts.push({
    node: context.spans.node(node),
    result:
      context.checker === undefined
        ? { kind: "unavailable", reason: "primitive-absent" }
        : { kind: "resolved", value: readNativeTypeRelation(context.checker, node.getExpression().getType(), node.getType()) },
  });
}

function collectBrandFact(node: MorphNode, context: SourceFactCollection): void {
  if (!(Node.isAsExpression(node) || Node.isTypeAliasDeclaration(node))) {
    throw new Error("native brand visitor received another node kind");
  }
  const target = node.getTypeNode();
  if (target !== undefined) {
    context.values.brands.push({ node: context.spans.node(target), brand: nativeIdBrand(target) });
  }
}

function collectMemberOriginFact(node: MorphNode, context: SourceFactCollection): void {
  if (!Node.isCallExpression(node)) {
    throw new Error("native call member visitor received another node kind");
  }
  const fact = readCallMemberDeclarationOrigin(node);
  const origin = fact.origin;
  const leaf = originRefusalLeaf(node.getExpression());
  context.values.memberOrigins.push({
    node: context.spans.node(node),
    name: fact.name,
    leaf: Node.isIdentifier(leaf) ? context.spans.node(leaf) : null,
    trace: { origin: context.spans.node(origin.trace.origin), declarations: origin.trace.declarations.map(context.spans.node) },
    result:
      origin.kind === "resolved"
        ? { kind: "resolved", declarations: origin.value.map(context.spans.node) }
        : { kind: "unresolved", reason: origin.reason, detail: origin.detail, node: context.spans.node(origin.node) },
  });
}

function collectCallableDeclarationFact(node: MorphNode, context: SourceFactCollection): void {
  const query = context.spans.node(node);
  if (!context.callableQueries.delete(inventoryNodeQueryKey(query))) {
    return;
  }
  const fact = resolveCallableDeclaration(node);
  context.values.callableDeclarations.push({
    node: query,
    trace: { origin: context.spans.node(fact.trace.origin), declarations: fact.trace.declarations.map(context.spans.node) },
    result:
      fact.kind === "resolved"
        ? {
            kind: fact.kind,
            declaration: context.spans.node(fact.value.declaration),
            body: fact.value.body === undefined ? null : context.spans.node(fact.value.body),
          }
        : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: context.spans.node(fact.node) },
  });
}

function collectComputedNameFact(node: MorphNode, context: SourceFactCollection): void {
  const query = context.spans.node(node);
  if (!context.computedNameQueries.delete(inventoryNodeQueryKey(query))) {
    return;
  }
  const fact = referenceResolutionServices.readComputedName(node);
  context.values.computedNames.push({
    node: query,
    trace: { origin: context.spans.node(fact.trace.origin), declarations: fact.trace.declarations.map(context.spans.node) },
    result:
      fact.kind === "resolved"
        ? { kind: fact.kind, value: fact.value }
        : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: context.spans.node(fact.node) },
  });
}

function collectGlobalOriginFact(node: MorphNode, context: SourceFactCollection): void {
  const query = context.spans.node(node);
  if (!context.globalOriginQueries.delete(inventoryNodeQueryKey(query))) {
    return;
  }
  const fact = resolveGlobalMemberOrigin(node);
  context.values.globalOrigins.push({
    node: query,
    trace: { origin: context.spans.node(fact.trace.origin), declarations: fact.trace.declarations.map(context.spans.node) },
    result:
      fact.kind === "resolved"
        ? {
            kind: fact.kind,
            globalName: fact.value.globalName,
            memberPath: [...fact.value.memberPath],
            declarations: fact.value.declarations.map(context.spans.node),
          }
        : { kind: fact.kind, reason: fact.reason, detail: fact.detail, node: context.spans.node(fact.node) },
  });
}

function collectFileFacts(sf: SourceFile, context: SourceFactCollection): void {
  const { families, spans, values } = context;
  if (families.has("runtime-exports")) {
    values.runtimeExports.push(...readRuntimeExports(sf, spans.node));
  }
  if (families.has("modules")) {
    values.modules.push(...moduleFacts(sf, spans));
  }
  if (families.has("witnesses")) {
    values.witnesses.push(...witnessFacts(sf, spans));
  }
}

function collectAuthoredFacts(sf: SourceFile, context: SourceFactCollection): void {
  const { families, spans, values } = context;
  collectFileFacts(sf, context);
  const visitors = new Map<SyntaxKind, ((node: MorphNode) => void)[]>();
  if (families.has("shape-catalog")) {
    for (const kind of [
      SyntaxKind.InterfaceDeclaration,
      SyntaxKind.TypeAliasDeclaration,
      SyntaxKind.ClassDeclaration,
      SyntaxKind.TypeLiteral,
      SyntaxKind.VariableDeclaration,
      SyntaxKind.FunctionDeclaration,
      SyntaxKind.EnumDeclaration,
      SyntaxKind.ExportAssignment,
    ]) {
      visitors.set(kind, [
        (node): void => {
          collectShapeFact(node, context);
        },
      ]);
    }
  }
  if (families.has("bindings") || families.has("references") || context.globalBindingQueries.size > 0) {
    visitors.set(SyntaxKind.Identifier, [(node): void => collectIdentifierFacts(node, context)]);
  }
  if (families.has("cast-relations")) {
    visitors.set(SyntaxKind.AsExpression, [(node): void => collectCastFact(node, context)]);
  }
  if (families.has("id-brands")) {
    visitors.set(SyntaxKind.TypeAliasDeclaration, [...(visitors.get(SyntaxKind.TypeAliasDeclaration) ?? []), (node): void => collectBrandFact(node, context)]);
    visitors.set(SyntaxKind.AsExpression, [...(visitors.get(SyntaxKind.AsExpression) ?? []), (node): void => collectBrandFact(node, context)]);
  }
  if (families.has("declaration-outputs")) {
    const collect = (node: MorphNode): void => {
      values.declarationOutputs.push({ node: spans.node(node), unknown: readDeclarationOutput(node) });
    };
    visitors.set(SyntaxKind.FunctionDeclaration, [...(visitors.get(SyntaxKind.FunctionDeclaration) ?? []), collect]);
    visitors.set(SyntaxKind.VariableDeclaration, [...(visitors.get(SyntaxKind.VariableDeclaration) ?? []), collect]);
  }
  if (families.has("type-member-origins")) {
    visitors.set(SyntaxKind.CallExpression, [(node): void => collectMemberOriginFact(node, context)]);
  }
  if (families.has("callable-declarations")) {
    visitors.set(SyntaxKind.CallExpression, [
      ...(visitors.get(SyntaxKind.CallExpression) ?? []),
      (node): void => collectCallableDeclarationFact(node, context),
    ]);
  }
  addComputedVisitors(visitors, context);
  addGlobalVisitors(visitors, context);
  collectByKinds([sf], visitors);
}

function extractSourceFacts(
  program: ts.Program,
  sources: InventorySources,
  authored: (path: string) => boolean,
  input: Pick<SourceFactCollection, "families" | "spans"> & {
    readonly callableQueries: readonly InventorySpan[];
    readonly computedNameQueries: readonly InventorySpan[];
    readonly globalOriginQueries: readonly InventorySpan[];
    readonly globalBindingQueries: readonly InventorySpan[];
  },
): SourceFactValues & { referenceDeclarations: ReadonlyMap<InventorySpan, ReferenceDeclaration> } {
  const { spans } = input;
  const context: SourceFactCollection = {
    ...input,
    authored,
    callableQueries: new Set(input.callableQueries.map(inventoryNodeQueryKey)),
    computedNameQueries: new Set(input.computedNameQueries.map(inventoryNodeQueryKey)),
    computedKinds: new Set(input.computedNameQueries.map(({ kind }) => kind)),
    globalOriginQueries: new Set(input.globalOriginQueries.map(inventoryNodeQueryKey)),
    globalBindingQueries: new Set(input.globalBindingQueries.map(inventoryNodeQueryKey)),
    globalKinds: new Set(input.globalOriginQueries.map(({ kind }) => kind)),
    values: {
      exports: [],
      modules: [],
      bindings: [],
      witnesses: [],
      casts: [],
      brands: [],
      runtimeExports: [],
      declarationOutputs: [],
      memberOrigins: [],
      callableDeclarations: [],
      computedNames: [],
      globalOrigins: [],
      globalBindings: [],
      shapes: [],
    },
    referenceDeclarations: new Map(),
    shapeNodes: new WeakSet(),
    checker: readAssignabilityChecker({ compilerObject: program.getTypeChecker() }),
  };
  const standaloneSources = nativeCompilerSourceFiles(program);
  const byCompilerSource = new Map(standaloneSources.map((sf) => [sf.compilerNode, sf]));
  try {
    for (const original of sources.files) {
      const sf = sharedSourceFile(program, sources.nativeSources.get(original.getFilePath()), byCompilerSource);
      if (sf === undefined) {
        throw new Error(`native inventory source is not shared with its language-service Program: ${original.getFilePath()}`);
      }
      const file = spans.path(sf.getFilePath());
      if (authored(file)) {
        assertAuthoredSyntax(original, sf, spans);
      }
      collectExportFacts(sf, context);
      if (authored(file)) {
        collectAuthoredFacts(sf, context);
      }
      sf.forgetDescendants();
    }
    if (context.callableQueries.size > 0) {
      throw new Error("native callable query span is unavailable in its captured native program");
    }
    if (context.computedNameQueries.size > 0) {
      throw new Error("native computed-name query span is unavailable in its captured native program");
    }
    if (context.globalOriginQueries.size > 0 || context.globalBindingQueries.size > 0) {
      throw new Error("native global-origin/binding query span is unavailable in its captured native program");
    }
  } finally {
    for (const sf of standaloneSources) {
      sf.forget();
    }
  }
  return { ...context.values, referenceDeclarations: context.referenceDeclarations };
}

function extractReferenceFacts(
  service: ts.LanguageService,
  program: ts.Program,
  referenceDeclarations: ReadonlyMap<InventorySpan, ReferenceDeclaration>,
  spans: InventorySpans,
): InventoryPartition["references"] {
  const references: InventoryPartition["references"] = [];
  const pass = service.createReadonlyReferencePass();
  try {
    if (service.getProgram() !== program) {
      throw new Error("native inventory Program changed before its reference pass");
    }
    // The native pass shares only its immutable import map, never query meaning or reference groups.
    for (const declaration of referenceDeclarations.values()) {
      const nativeReferences = nativeReferenceFacts(pass, program, declaration.query, spans);
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
  } finally {
    pass.dispose();
  }
  return references;
}

function nativeReferenceFacts(
  pass: ts.ReadonlyReferencePass,
  program: ts.Program,
  query: ReferenceDeclaration["query"],
  spans: InventorySpans,
): Pick<InventoryPartition["references"][number], "reference" | "consumerClass">[] {
  // DocumentSpan wrappers subscribe to source modifications and retain every result in this read-only worker.
  const groups = pass.findReferences(query.file, query.start, { includeDefinitionDisplay: false }) ?? [];
  const references: Pick<InventoryPartition["references"][number], "reference" | "consumerClass">[] = [];
  for (const group of groups) {
    const alias = group.definition.kind === ts.ScriptElementKind.alias;
    for (const [index, reference] of group.references.entries()) {
      if (alias || reference.isDefinition !== true || index > 0) {
        const source = program.getSourceFile(reference.fileName);
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
  const best = nativeReferenceNode(source, span);
  return spans.span(source.fileName, best.getStart(source), best.end, best.kind);
}

function callableDemandFor(request: InventoryBuildRequest, families: readonly InventoryFamily[], roots: readonly string[]): readonly InventorySpan[] {
  const callableQueries = request.callableQueries ?? [];
  if (families.includes("callable-declarations") && request.callableQueries === undefined) {
    throw new Error("native callable declarations require closed call demand");
  }
  if (callableQueries.some((query) => !roots.includes(query.file)) || (callableQueries.length > 0 && !families.includes("callable-declarations"))) {
    throw new Error("native callable query is outside its demanded native roots/family");
  }
  return callableQueries;
}

function computedDemandFor(request: InventoryBuildRequest, families: readonly InventoryFamily[], roots: readonly string[]): readonly InventorySpan[] {
  const queries = request.computedNameQueries ?? [];
  if (families.includes("computed-names") && request.computedNameQueries === undefined) {
    throw new Error("native computed names require closed key demand");
  }
  if (queries.some((query) => !roots.includes(query.file)) || (queries.length > 0 && !families.includes("computed-names"))) {
    throw new Error("native computed-name query is outside its demanded native roots/family");
  }
  return queries;
}

function addComputedVisitors(visitors: Map<SyntaxKind, ((node: MorphNode) => void)[]>, context: SourceFactCollection): void {
  for (const kind of context.computedKinds) {
    visitors.set(kind, [...(visitors.get(kind) ?? []), (node): void => collectComputedNameFact(node, context)]);
  }
}

function addGlobalVisitors(visitors: Map<SyntaxKind, ((node: MorphNode) => void)[]>, context: SourceFactCollection): void {
  for (const kind of context.globalKinds) {
    visitors.set(kind, [...(visitors.get(kind) ?? []), (node): void => collectGlobalOriginFact(node, context)]);
  }
}

function globalDemandFor(
  request: InventoryBuildRequest,
  families: readonly InventoryFamily[],
  roots: readonly string[],
  kind: "globalOriginQueries" | "globalBindingQueries",
): readonly InventorySpan[] {
  const queries = request[kind] ?? [];
  if (
    (families.includes("global-origins") && request[kind] === undefined) ||
    (queries.length > 0 && !families.includes("global-origins")) ||
    queries.some((query) => !roots.includes(query.file) || (kind === "globalBindingQueries" && query.kind !== SyntaxKind.Identifier))
  ) {
    throw new Error("native global origins and bindings require closed demand in native roots/family");
  }
  return queries;
}
