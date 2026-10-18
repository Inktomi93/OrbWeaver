// Each extraction owns exactly one native descriptor. No Project crosses the worker boundary.

import { resolve } from "node:path";
import process from "node:process";
import type { FileSystemHost, Node as MorphNode, SourceFile } from "ts-morph";
import { Node, Project, SyntaxKind, ts } from "ts-morph";
import { readDeclarationOutput } from "../code-facts/declaration-output.ts";
import { nativeIdBrand } from "../code-facts/id-brand.ts";
import { inventoryConsumerClass } from "../code-facts/inventory-consumers.ts";
import { beginReferencePass, endReferencePass, referenceResolutionServices, resolveGlobalMemberOrigin } from "../code-facts/reference-fact.ts";
import { resolveCallableDeclaration } from "../code-facts/reference-fact-call.ts";
import { readRuntimeExports } from "../code-facts/runtime-export.ts";
import type { SchemaIdentityTable } from "../code-facts/schema-identity-contract.ts";
import type { SchemaQuery } from "../code-facts/schema-model-contract.ts";
import { schemaDataProjectionSchema } from "../code-facts/schema-projection-contract.ts";
import type {
  InventoryBuildRequest,
  InventoryExportDeclarationQuery,
  InventoryExportDeclarations,
  InventoryFamily,
  InventoryInput,
  InventoryInvocationQuery,
  InventoryModuleTargetQuery,
  InventoryPartition,
  InventorySpan,
  InventorySymbols,
} from "../code-facts/semantic-inventory-contract.ts";
import {
  exportDeclarationQueryKey,
  exportDeclarationQuerySchema,
  INVENTORY_FORMAT,
  INVENTORY_REFERENCE_MODES,
  inventoryFamilies,
  inventoryNodeQueryKey,
  invocationNeedsValueSourceCatalog,
  moduleTargetQuerySchema,
  referenceQueryKey,
} from "../code-facts/semantic-inventory-contract.ts";
import { canonicalInventoryPath, descriptorVersion, inputsCurrent, inputVersion, inventoryAuthoredFiles } from "../code-facts/semantic-inventory-inputs.ts";
import { originRefusalLeaf, readCallMemberDeclarationOrigin } from "../code-facts/type-member-origin.ts";
import { mapTypeObservationDemand } from "../code-facts/type-observations-codec.ts";
import type { TypeObservationCaptureRequest } from "../code-facts/type-observations-contract.ts";
import { hasTypeObservationValueDemand, typeObservationNeedsSourceBindings } from "../code-facts/type-observations-contract.ts";
import { extractDrizzleIdentities, inventoryQueryNode } from "./drizzle-inventory-extract.ts";
import { captureInvocationEvidence, encodeInvocationEvidence } from "./invocation-evidence-extract.ts";
import { assertSemanticAnalysisProgram } from "./project-worlds.ts";
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

function moduleFact(
  node: import("ts-morph").ImportDeclaration | import("ts-morph").ExportDeclaration,
  spans: InventorySpans,
): InventoryPartition["modules"][number] | undefined {
  const literal = node.getModuleSpecifier();
  if (literal === undefined) {
    return;
  }
  const target = node.getModuleSpecifierSourceFile();
  return {
    node: spans.node(node),
    target: target === undefined ? null : spans.path(target.getFilePath()),
    declarations: (literal.getSymbol()?.getDeclarations() ?? []).map(spans.node),
    specifier: literal.getLiteralText(),
    dynamic: false,
  };
}
function moduleFacts(sf: SourceFile, spans: InventorySpans): InventoryPartition["modules"] {
  const out: InventoryPartition["modules"] = [];
  for (const node of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
    const fact = moduleFact(node, spans);
    if (fact !== undefined) {
      out.push(fact);
    }
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
  assertSemanticAnalysisProgram(request.descriptor.config);
  const families = request.intent === "membership" ? [] : inventoryFamilies(request.families);
  if (request.intent === "membership" && request.families !== undefined && request.families.length > 0) {
    throw new Error("membership extraction cannot supply typed families");
  }
  const inputs = new Map<string, InventoryInput>();
  const base = new Project({ skipAddingFilesFromTsConfig: true }).getFileSystem();
  const fileSystem = inventoryFileSystem(base, request.overlay, inputs);
  const spans = inventorySpans(fileSystem);
  for (const absolute of [...request.descriptor.configPaths.map((path) => resolve(request.root, path)), resolve(request.root, "pnpm-lock.yaml")]) {
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
  const exportQueries = exportDemandFor(request, families, roots);
  const callableQueries = callableDemandFor(request, families, roots);
  const computedNameQueries = computedDemandFor(request, families, roots);
  const globalOriginQueries = globalDemandFor(request, families, roots, "globalOriginQueries");
  const globalBindingQueries = globalDemandFor(request, families, roots, "globalBindingQueries");
  const invocationQueries = invocationDemandFor(request, families, roots);
  const idBrandQueries = idBrandDemandFor(request, families, roots);
  const moduleTargetQueries = moduleDemandFor(request, families, roots);
  assertDrizzleRequest(request, families, roots, fileSystem);
  assertReferenceRequest(request, families);
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
          exportDeclarations: [],
          modules: [],
          bindings: [],
          witnesses: [],
          brands: [],
          runtimeExports: [],
          declarationOutputs: [],
          memberOrigins: [],
          callableDeclarations: [],
          computedNames: [],
          globalOrigins: [],
          globalBindings: [],
          invocationEvidence: [],
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
          exportQueries,
          callableQueries,
          computedNameQueries,
          globalOriginQueries,
          globalBindingQueries,
          invocationQueries,
          idBrandQueries,
          moduleTargetQueries,
          drizzle: request,
        });
  return {
    intent: request.intent ?? "facts",
    referenceMode: workerReferenceMode(request),
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
    inputs: mergeDependencyInputs(inputs, request),
    ...exportFactProjection(facts, families),
  };
}

interface ReferenceDeclaration {
  readonly declaration: InventorySpan;
  readonly name: InventorySpan | undefined;
  readonly query: { readonly file: string; readonly start: number };
}

function mergeDependencyInputs(inputs: ReadonlyMap<string, InventoryInput>, request: InventoryBuildRequest): InventoryInput[] {
  const merged = new Map(inputs);
  for (const input of request.schemaDependency?.inputs ?? []) {
    const key = `${input.kind}\0${input.path}`;
    const existing = merged.get(key);
    if (existing !== undefined && existing.version !== input.version) {
      throw new Error("native Drizzle catalog and consumer input versions disagree");
    }
    merged.set(key, input);
  }
  return [...merged.values()].toSorted((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}

function assertDrizzleRequest(
  request: InventoryBuildRequest,
  families: readonly InventoryFamily[],
  roots: readonly string[],
  fileSystem: FileSystemHost,
): void {
  schemaDataProjectionSchema.parse(request.schemaDataProjection ?? {});
  if (
    families.includes("drizzle-identities") !== (request.drizzleQueries !== undefined) ||
    request.drizzleQueries?.some((query) => !roots.includes(query.node.file)) === true ||
    request.schemaSources?.some((query) => !roots.includes(query.file) || query.kind !== SyntaxKind.SourceFile) === true ||
    (request.schemaSources !== undefined && !families.includes("drizzle-identities")) ||
    request.schemaDataSources?.some((query) => !roots.includes(query.file) || query.kind !== SyntaxKind.SourceFile) === true ||
    (request.schemaDataSources !== undefined && !families.includes("schema-data"))
  ) {
    throw new Error("native Drizzle identities require closed source/call demand in admitted roots");
  }
  if (request.schemaDataProjection !== undefined && request.schemaDataSources === undefined) {
    throw new Error("native schema projection has no closed source demand");
  }
  if (
    request.schemaDependency !== undefined &&
    !inputsCurrent(request.schemaDependency.inputs, { authored: inventoryAuthoredFiles(request.root, request.overlay), fileSystem })
  ) {
    throw new Error("native Drizzle catalog dependency inputs are stale");
  }
}

function extractTypedFacts(
  project: Project,
  input: {
    readonly sources: InventorySources;
    readonly authored: (path: string) => boolean;
    readonly spans: InventorySpans;
    readonly families: readonly InventoryFamily[];
    readonly queries: readonly import("../code-facts/semantic-inventory-contract.ts").InventoryShapeQuery[];
    readonly exportQueries: readonly InventoryExportDeclarationQuery[];
    readonly callableQueries: readonly InventorySpan[];
    readonly computedNameQueries: readonly InventorySpan[];
    readonly globalOriginQueries: readonly InventorySpan[];
    readonly globalBindingQueries: readonly InventorySpan[];
    readonly invocationQueries: readonly InventoryInvocationQuery[];
    readonly idBrandQueries: readonly InventorySpan[];
    readonly moduleTargetQueries: readonly InventoryModuleTargetQuery[];
    readonly drizzle: InventoryBuildRequest;
  },
): SourceFactValues & Pick<InventoryPartition, "pairs" | "references" | "referenceQueries" | "schemaIdentity" | "schemaData" | "drizzleCalls"> {
  const {
    sources,
    authored,
    spans,
    families,
    queries,
    exportQueries,
    callableQueries,
    computedNameQueries,
    globalOriginQueries,
    globalBindingQueries,
    invocationQueries,
    idBrandQueries,
    moduleTargetQueries,
  } = input;
  const needsProject =
    idBrandQueries.length > 0 ||
    invocationQueries.length > 0 ||
    input.drizzle.schemaSources !== undefined ||
    input.drizzle.schemaDataSources !== undefined ||
    (input.drizzle.drizzleQueries?.length ?? 0) > 0;
  const invocationProgram = needsProject ? project.getProgram().compilerObject : undefined;
  // Physical input metadata retains host parses; semantic reads require the exact Program-admitted AST,
  // including compiler-owned package redirects whose descendants belong to their canonical target.
  const invocationSources = invocationProgram?.getSourceFiles().map((source) => project.getProgramSourceFile(source, invocationProgram)) ?? [];
  const service = project.getLanguageService().compilerObject;
  const program = service.getProgram();
  if (program === undefined) {
    throw new Error("native inventory language service has no Program");
  }
  const callablePass = usesReferencePass(families);
  if (callablePass) {
    beginReferencePass();
  }
  let referencePass: ts.ReadonlyReferencePass | undefined;
  try {
    referencePass = createNativeReferencePass(service, families);
    const referenceQueries = captureStrictReferenceQueries(
      { pass: referencePass, service, program },
      {
        spans,
        queries: workerReferenceQueries(input.drizzle),
      },
    );
    let valueSourceDeclarations: ReadonlySet<string> | undefined;
    let valueSourceTables: readonly SchemaIdentityTable[] | undefined;
    let ordinarySchema: SchemaQuery | undefined;
    let ordinaryBasis: import("../code-facts/drizzle-inventory-contract.ts").InventorySchemaBasis | null = null;
    const drizzle =
      families.includes("drizzle-identities") || families.includes("schema-data")
        ? extractDrizzleIdentities(input.drizzle, invocationSources, spans.node, {
            assertSource: (source) => {
              if (invocationProgram === undefined) {
                throw new Error("native Drizzle Project owner is unavailable");
              }
              assertInvocationSource(source, invocationProgram, "drizzle-capture");
            },
            valueSourceDeclarations: (declarations, tables) => {
              valueSourceDeclarations = declarations;
              valueSourceTables = tables;
            },
            ordinarySchema: (query) => {
              ordinarySchema = query;
              const dependency = input.drizzle.schemaDependency;
              ordinaryBasis = dependency === undefined ? null : { program: dependency.program, partition: dependency.partition };
            },
          })
        : {};
    const { referenceDeclarations, ...sourceFacts } = extractSourceFacts(program, sources, authored, {
      spans,
      families: sourceFamilies(families, input.drizzle),
      exportQueries,
      callableQueries,
      computedNameQueries,
      globalOriginQueries,
      globalBindingQueries,
      invocationQueries,
      idBrandQueries,
      moduleTargetQueries,
      invocationSources,
      invocationProgram,
      ordinarySchema,
      valueSourceDeclarations,
      valueSourceTables,
      ordinaryBasis,
      referenceQueries,
    });
    const facts = {
      ...sourceFacts,
      ...drizzle,
      pairs: families.includes("shape-pairs") ? extractShapePairs(program, queries) : [],
      ...(families.includes("references")
        ? { ...extractReferenceFacts(referencePass, program, referenceDeclarations, spans), referenceQueries }
        : { references: [], referenceQueries: [] }),
    };
    // A later LS-owned family must not silently replace the Project owner whose invocation bytes were captured.
    for (const source of invocationSources) {
      if (invocationProgram === undefined) {
        throw new Error("native invocation owner Program is unavailable");
      }
      assertInvocationSource(source, invocationProgram, "after-families");
    }
    return facts;
  } finally {
    referencePass?.dispose();
    if (callablePass) {
      endReferencePass();
    }
  }
}

function workerReferenceMode(request: InventoryBuildRequest): import("../code-facts/semantic-inventory-contract.ts").InventoryReferenceMode {
  return request.referenceDemand?.mode ?? "complete";
}
function workerReferenceQueries(request: InventoryBuildRequest): readonly import("../code-facts/semantic-inventory-contract.ts").InventoryReferencePair[] {
  return request.referenceDemand?.queries ?? [];
}

function assertReferenceRequest(request: InventoryBuildRequest, families: readonly InventoryFamily[]): void {
  if (request.referenceDemand !== undefined && !(families.includes("references") && INVENTORY_REFERENCE_MODES.includes(request.referenceDemand.mode))) {
    throw new Error("native exact references require reference-family demand");
  }
}
function sourceFamilies(families: readonly InventoryFamily[], request: InventoryBuildRequest): Set<InventoryFamily> {
  return new Set(families.filter((family) => family !== "references" || request.referenceDemand?.mode !== "closed"));
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
  | "brands"
  | "runtimeExports"
  | "declarationOutputs"
  | "memberOrigins"
  | "callableDeclarations"
  | "computedNames"
  | "globalOrigins"
  | "globalBindings"
  | "invocationEvidence"
  | "shapes"
> & { exportDeclarations: InventoryExportDeclarations[] };
interface SourceFactCollection {
  readonly families: ReadonlySet<InventoryFamily>;
  readonly spans: InventorySpans;
  readonly authored: (path: string) => boolean;
  readonly values: SourceFactValues;
  readonly referenceDeclarations: Map<InventorySpan, ReferenceDeclaration>;
  readonly shapeNodes: WeakSet<ts.Node>;
  readonly exportQueries: Map<string, InventoryExportDeclarationQuery[]>;
  readonly callableQueries: Set<string>;
  readonly callableKinds: ReadonlySet<SyntaxKind>;
  readonly computedNameQueries: Set<string>;
  readonly computedKinds: ReadonlySet<SyntaxKind>;
  readonly globalOriginQueries: Set<string>;
  readonly globalBindingQueries: Set<string>;
  readonly globalKinds: ReadonlySet<SyntaxKind>;
  readonly invocationBindings: Map<string, InventorySymbols>;
  readonly brandKeys: Set<string>;
}

function exportFactProjection(
  facts: SourceFactValues & Pick<InventoryPartition, "pairs" | "references">,
  families: readonly InventoryFamily[],
): Omit<SourceFactValues, "exportDeclarations"> & Pick<InventoryPartition, "pairs" | "references" | "exportDeclarations"> {
  if (families.includes("export-declarations")) {
    return facts;
  }
  const { exportDeclarations: _exports, ...legacy } = facts;
  return legacy;
}

function exportDemandBySource(queries: readonly InventoryExportDeclarationQuery[]): Map<string, InventoryExportDeclarationQuery[]> {
  const grouped = new Map<string, InventoryExportDeclarationQuery[]>();
  for (const query of queries) {
    const rows = grouped.get(query.file) ?? [];
    rows.push(query);
    grouped.set(query.file, rows);
  }
  return grouped;
}

function collectExportFacts(sf: SourceFile, context: SourceFactCollection): void {
  const file = context.spans.path(sf.getFilePath());
  const queries = context.exportQueries.get(file);
  const complete = context.families.has("exports") || context.families.has("references") || context.families.has("shape-catalog");
  if (!complete && queries === undefined) {
    return;
  }
  const exports = sf.getExportedDeclarations();
  for (const query of queries ?? []) {
    const declarations = exports.get(query.name);
    context.values.exportDeclarations.push({ query, declarations: declarations === undefined ? null : declarations.map(context.spans.node) });
  }
  context.exportQueries.delete(file);
  if (!complete) {
    return;
  }
  for (const [name, declarations] of exports) {
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
    const symbols = bindingFacts(node, context.spans);
    const expected = context.invocationBindings.get(inventoryNodeQueryKey(span));
    if (expected !== undefined && JSON.stringify(expected) !== JSON.stringify(symbols)) {
      throw new Error("native invocation binding differs between its admitted Project and language-service owners");
    }
    context.values.bindings.push({ node: span, symbols });
  }
  if (closed) {
    context.values.globalBindings.push(span);
  }
  if (context.families.has("references")) {
    registerReferenceDeclarations(node.getSymbol()?.getDeclarations() ?? [], context.authored, context.referenceDeclarations, context.spans);
  }
}

function collectBrandFact(node: MorphNode, context: SourceFactCollection): void {
  if (!(Node.isAsExpression(node) || Node.isTypeAliasDeclaration(node))) {
    throw new Error("native brand visitor received another node kind");
  }
  const target = node.getTypeNode();
  if (target !== undefined) {
    collectBrandTarget(target, context);
  }
}

function collectBrandTarget(target: MorphNode, context: SourceFactCollection): void {
  const span = context.spans.node(target);
  const key = inventoryNodeQueryKey(span);
  if (!context.brandKeys.has(key)) {
    context.values.brands.push({ node: span, brand: nativeIdBrand(target) });
    context.brandKeys.add(key);
  }
}

function collectIdBrandQueries(
  queries: readonly InventorySpan[],
  sources: readonly SourceFile[],
  program: ts.Program | undefined,
  context: SourceFactCollection,
): void {
  const byFile = new Map(sources.map((source) => [context.spans.node(source).file, source]));
  for (const query of queries) {
    const source = byFile.get(query.file);
    if (source === undefined || program === undefined) {
      throw new Error("native id-brand query source is unavailable");
    }
    assertInvocationSource(source, program, "id-brand-capture");
    const target = inventoryQueryNode(source, query);
    if (!ts.isTypeNode(target.compilerNode)) {
      throw new Error("native id-brand query is not a TypeNode");
    }
    collectBrandTarget(target, context);
    assertInvocationSource(source, program, "id-brand-complete");
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

function addCallableVisitors(visitors: Map<SyntaxKind, ((node: MorphNode) => void)[]>, context: SourceFactCollection): void {
  if (context.families.has("callable-declarations")) {
    for (const kind of context.callableKinds) {
      visitors.set(kind, [...(visitors.get(kind) ?? []), (node): void => collectCallableDeclarationFact(node, context)]);
    }
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
  addCallableVisitors(visitors, context);
  addComputedVisitors(visitors, context);
  addGlobalVisitors(visitors, context);
  collectByKinds([sf], visitors);
}

function moduleDemandFor(
  request: InventoryBuildRequest,
  families: readonly InventoryFamily[],
  roots: readonly string[],
): readonly InventoryModuleTargetQuery[] {
  const queries = (request.moduleTargetQueries ?? []).map((query) => moduleTargetQuerySchema.parse(query));
  if (queries.some((query) => !roots.includes(query.importer.file)) || (queries.length > 0 && !families.includes("modules"))) {
    throw new Error("native contextual module query has no admitted importer/family");
  }
  return queries;
}
function collectModuleDoor(node: MorphNode, file: string, context: SourceFactCollection): void {
  if (!(Node.isImportDeclaration(node) || Node.isExportDeclaration(node))) {
    throw new Error("native contextual module query is not an authored import/export door");
  }
  if (!context.authored(file)) {
    const fact = moduleFact(node, context.spans);
    if (fact === undefined) {
      throw new Error("native contextual module query has no module specifier");
    }
    if (!context.values.modules.some((entry) => inventoryNodeQueryKey(entry.node) === inventoryNodeQueryKey(fact.node))) {
      context.values.modules.push(fact);
    }
  }
}
function collectModuleQueries(
  queries: readonly InventoryModuleTargetQuery[],
  input: {
    readonly program: ts.Program;
    readonly sources: InventorySources;
    readonly context: SourceFactCollection;
    readonly byCompilerSource: ReadonlyMap<ts.SourceFile, SourceFile>;
  },
): void {
  const { program, sources, context, byCompilerSource } = input;
  for (const query of queries) {
    const source = sources.files.find((file) => context.spans.path(file.getFilePath()) === query.node.file);
    const importer = sources.files.find((file) => context.spans.path(file.getFilePath()) === query.importer.file);
    if (importer === undefined) {
      throw new Error("native contextual module importer is unavailable");
    }
    const owner = sharedSourceFile(program, sources.nativeSources.get(importer.getFilePath()), byCompilerSource);
    inventoryQueryNode(owner, query.importer);
    // Unavailable prospective doors remain closure refusals, never captured module absences.
    if (source === undefined) {
      continue;
    }
    const captured = sharedSourceFile(program, sources.nativeSources.get(source.getFilePath()), byCompilerSource);
    const node = inventoryQueryNode(captured, query.node);
    collectModuleDoor(node, query.node.file, context);
  }
}
function extractSourceFacts(
  program: ts.Program,
  sources: InventorySources,
  authored: (path: string) => boolean,
  input: Pick<SourceFactCollection, "families" | "spans"> & {
    readonly exportQueries: readonly InventoryExportDeclarationQuery[];
    readonly callableQueries: readonly InventorySpan[];
    readonly computedNameQueries: readonly InventorySpan[];
    readonly globalOriginQueries: readonly InventorySpan[];
    readonly globalBindingQueries: readonly InventorySpan[];
    readonly invocationQueries: readonly InventoryInvocationQuery[];
    readonly idBrandQueries: readonly InventorySpan[];
    readonly moduleTargetQueries: readonly InventoryModuleTargetQuery[];
    readonly invocationSources: readonly SourceFile[];
    readonly invocationProgram: ts.Program | undefined;
    readonly ordinarySchema: SchemaQuery | undefined;
    readonly valueSourceDeclarations: ReadonlySet<string> | undefined;
    readonly valueSourceTables: readonly SchemaIdentityTable[] | undefined;
    readonly ordinaryBasis: import("../code-facts/drizzle-inventory-contract.ts").InventorySchemaBasis | null;
    readonly referenceQueries: NonNullable<InventoryPartition["referenceQueries"]>;
  },
): SourceFactValues & { referenceDeclarations: ReadonlyMap<InventorySpan, ReferenceDeclaration> } {
  const { spans } = input;
  const context: SourceFactCollection = {
    ...input,
    authored,
    exportQueries: exportDemandBySource(input.exportQueries),
    callableQueries: new Set(input.callableQueries.map(inventoryNodeQueryKey)),
    callableKinds: new Set(input.callableQueries.map(({ kind }) => kind)),
    computedNameQueries: new Set(input.computedNameQueries.map(inventoryNodeQueryKey)),
    computedKinds: new Set(input.computedNameQueries.map(({ kind }) => kind)),
    globalOriginQueries: new Set(input.globalOriginQueries.map(inventoryNodeQueryKey)),
    globalBindingQueries: new Set(input.globalBindingQueries.map(inventoryNodeQueryKey)),
    globalKinds: new Set(input.globalOriginQueries.map(({ kind }) => kind)),
    values: {
      exports: [],
      exportDeclarations: [],
      modules: [],
      bindings: [],
      witnesses: [],
      brands: [],
      runtimeExports: [],
      declarationOutputs: [],
      memberOrigins: [],
      callableDeclarations: [],
      computedNames: [],
      globalOrigins: [],
      globalBindings: [],
      invocationEvidence: [],
      shapes: [],
    },
    invocationBindings: new Map(),
    brandKeys: new Set(),
    referenceDeclarations: new Map(),
    shapeNodes: new WeakSet(),
  };
  const standaloneSources = nativeCompilerSourceFiles(program);
  const byCompilerSource = new Map(standaloneSources.map((sf) => [sf.compilerNode, sf]));
  try {
    collectIdBrandQueries(input.idBrandQueries, input.invocationSources, input.invocationProgram, context);
    collectModuleQueries(input.moduleTargetQueries, { program, sources, context, byCompilerSource });
    collectInvocationFacts(input.invocationQueries, input.invocationSources, context, {
      program: input.invocationProgram,
      schema: input.ordinarySchema,
      valueSourceDeclarations: input.valueSourceDeclarations,
      valueSourceTables: input.valueSourceTables,
      basis: input.ordinaryBasis,
      referenceQueries: input.referenceQueries,
    });
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
    if (context.exportQueries.size > 0) {
      throw new Error("native export query source is unavailable in its captured native program");
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
  pass: ts.ReadonlyReferencePass | undefined,
  program: ts.Program,
  referenceDeclarations: ReadonlyMap<InventorySpan, ReferenceDeclaration>,
  spans: InventorySpans,
): Pick<InventoryPartition, "references" | "referenceNames"> {
  if (pass === undefined) {
    throw new Error("native inventory reference pass is unavailable");
  }
  const references: InventoryPartition["references"] = [];
  const referenceNames: NonNullable<InventoryPartition["referenceNames"]> = [];
  const declarations = [...referenceDeclarations.values()];
  const occurrences =
    typeof pass.findReferencesFromOccurrences === "function"
      ? pass.findReferencesFromOccurrences(declarations.map(({ query }) => ({ fileName: query.file, position: query.start })))
      : undefined;
  if (occurrences !== undefined && occurrences.length !== declarations.length) {
    throw new Error("native occurrence answers differ from their complete declaration demand");
  }
  for (const [index, declaration] of declarations.entries()) {
    const answer = occurrences?.[index];
    // Indexed and computed answers are already native search output; only a never-computed query searches here.
    const captured = answer === undefined || answer.kind === "native" ? undefined : answer.references;
    const nativeReferences = nativeReferenceFacts({ pass, program }, declaration.query, spans, captured);
    for (const reference of nativeReferences) {
      references.push({ declaration: declaration.declaration, ...reference });
    }
    if (declaration.name !== undefined) {
      referenceNames.push({ name: declaration.name, declaration: declaration.declaration });
      for (const reference of nativeReferences) {
        references.push({ declaration: declaration.name, ...reference });
      }
    }
  }
  return { references, referenceNames };
}

function captureStrictReferenceQueries(
  owner: { readonly pass: ts.ReadonlyReferencePass | undefined; readonly service: ts.LanguageService; readonly program: ts.Program },
  options: { readonly spans: InventorySpans; readonly queries: readonly import("../code-facts/semantic-inventory-contract.ts").InventoryReferencePair[] },
): NonNullable<InventoryPartition["referenceQueries"]> {
  if (owner.pass === undefined) {
    return [];
  }
  if (owner.service.getProgram() !== owner.program) {
    throw new Error("native inventory Program changed before its reference pass");
  }
  const sources = options.queries.length === 0 ? [] : nativeCompilerSourceFiles(owner.program);
  try {
    return captureReferenceQueries({ ...owner, pass: owner.pass }, sources, options);
  } finally {
    for (const source of sources) {
      source.forget();
    }
  }
}

function createNativeReferencePass(service: ts.LanguageService, families: readonly InventoryFamily[]): ts.ReadonlyReferencePass | undefined {
  return families.includes("references") ? service.createReadonlyReferencePass() : undefined;
}

function captureReferenceQueries(
  owner: { readonly pass: ts.ReadonlyReferencePass; readonly service: ts.LanguageService; readonly program: ts.Program },
  sources: readonly SourceFile[],
  options: { readonly spans: InventorySpans; readonly queries: readonly import("../code-facts/semantic-inventory-contract.ts").InventoryReferencePair[] },
): NonNullable<InventoryPartition["referenceQueries"]> {
  const { spans, queries } = options;
  const referenceQueries: NonNullable<InventoryPartition["referenceQueries"]> = [];
  const byFile = new Map(sources.map((source) => [spans.path(source.getFilePath()), source]));
  const seen = new Set<string>();
  for (const pair of queries) {
    const query = pair.node;
    const key = referenceQueryKey(pair);
    if (seen.has(key)) {
      throw new Error("native exact reference query is ambiguous");
    }
    seen.add(key);
    const root = inventoryQueryNode(byFile.get(pair.root.file), pair.root);
    if (
      !(
        Node.isSourceFile(root) &&
        owner.program.getRootFileNames().includes(root.getFilePath()) &&
        owner.program.getSourceFile(root.getFilePath()) === root.compilerNode
      )
    ) {
      throw new Error("native reference importer is outside its admitted native roots");
    }
    const source = byFile.get(query.file);
    const node = inventoryQueryNode(source, query);
    if (source === undefined || !Node.isReferenceFindable(node) || owner.program.getSourceFile(source.getFilePath()) !== source.compilerNode) {
      throw new Error("native exact reference query is outside its admitted language-service source");
    }
    const target = referenceQueryNode(node);
    referenceQueries.push({
      root: pair.root,
      query,
      references: nativeReferenceFacts(owner, { file: target.getSourceFile().getFilePath(), start: target.getStart() }, spans),
    });
    owner.pass.validate(root.getFilePath());
    owner.pass.validate(source.getFilePath());
    if (
      owner.service.getProgram() !== owner.program ||
      source.wasForgotten() ||
      root.wasForgotten() ||
      owner.program.getSourceFile(root.getFilePath()) !== root.compilerNode ||
      owner.program.getSourceFile(source.getFilePath()) !== source.compilerNode
    ) {
      throw new Error("native exact reference language-service owner changed during capture");
    }
  }
  return referenceQueries;
}

function nativeReferenceFacts(
  owner: { readonly pass: ts.ReadonlyReferencePass; readonly program: ts.Program },
  query: ReferenceDeclaration["query"],
  spans: InventorySpans,
  captured?: readonly ts.ReferencedSymbol[],
): Pick<InventoryPartition["references"][number], "reference" | "consumerClass">[] {
  const { pass, program } = owner;
  // DocumentSpan wrappers subscribe to source modifications and retain every result in this read-only worker.
  const groups = captured ?? pass.findReferences(query.file, query.start, { includeDefinitionDisplay: false }) ?? [];
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

function exportDemandFor(
  request: InventoryBuildRequest,
  families: readonly InventoryFamily[],
  roots: readonly string[],
): readonly InventoryExportDeclarationQuery[] {
  const queries = [
    ...new Map((request.exportQueries ?? []).map((query) => [exportDeclarationQueryKey(query), exportDeclarationQuerySchema.parse(query)])).values(),
  ];
  if (
    (families.includes("export-declarations") && request.exportQueries === undefined) ||
    (request.exportQueries !== undefined && !families.includes("export-declarations")) ||
    queries.some((query) => !roots.includes(query.file))
  ) {
    throw new Error("native export declarations require closed source/name demand in admitted native roots");
  }
  return queries;
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

function idBrandDemandFor(request: InventoryBuildRequest, families: readonly InventoryFamily[], roots: readonly string[]): readonly InventorySpan[] {
  const queries = request.idBrandQueries ?? [];
  if (queries.some((query) => !roots.includes(query.file)) || (queries.length > 0 && !families.includes("id-brands"))) {
    throw new Error("native id-brand query is outside its demanded native roots/family");
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

interface InvocationCollection {
  readonly context: SourceFactCollection;
  readonly program: ts.Program;
  readonly byFile: ReadonlyMap<string, SourceFile>;
  readonly schema: SchemaQuery | undefined;
  readonly valueSourceDeclarations: ReadonlySet<string> | undefined;
  readonly valueSourceTables: readonly SchemaIdentityTable[] | undefined;
  readonly basis: import("../code-facts/drizzle-inventory-contract.ts").InventorySchemaBasis | null;
  readonly related: Map<string, InventoryPartition["invocationEvidence"][number]["sources"][number]>;
  readonly bindingKeys: Set<string>;
  readonly computedKeys: Set<string>;
  readonly globalKeys: Set<string>;
  readonly referenceQueries: NonNullable<InventoryPartition["referenceQueries"]>;
}

/** Requested roots close related binding/name sources before the ordinary authored walk forgets wrappers. */
function collectInvocationFacts(
  queries: readonly InventoryInvocationQuery[],
  sources: readonly SourceFile[],
  context: SourceFactCollection,
  owner: {
    readonly program: ts.Program | undefined;
    readonly schema: SchemaQuery | undefined;
    readonly valueSourceDeclarations: ReadonlySet<string> | undefined;
    readonly valueSourceTables: readonly SchemaIdentityTable[] | undefined;
    readonly basis: import("../code-facts/drizzle-inventory-contract.ts").InventorySchemaBasis | null;
    readonly referenceQueries: NonNullable<InventoryPartition["referenceQueries"]>;
  },
): void {
  const { program, schema, basis } = owner;
  if (queries.length === 0) {
    return;
  }
  if (program === undefined) {
    throw new Error("native invocation owner Program is unavailable");
  }
  const state: InvocationCollection = {
    context,
    program,
    schema,
    valueSourceDeclarations: owner.valueSourceDeclarations,
    valueSourceTables: owner.valueSourceTables,
    basis,
    byFile: new Map(sources.map((source) => [context.spans.path(source.getFilePath()), source])),
    related: new Map(),
    bindingKeys: new Set(),
    computedKeys: new Set(context.values.computedNames.map((fact) => inventoryNodeQueryKey(fact.node))),
    globalKeys: new Set(context.values.globalOrigins.map((fact) => inventoryNodeQueryKey(fact.node))),
    referenceQueries: owner.referenceQueries,
  };
  for (const source of sources) {
    assertInvocationSource(source, program, "before-queries");
  }
  for (const query of queries) {
    collectInvocationQuery(query, state);
  }
  for (const [index, source] of sources.entries()) {
    assertInvocationSource(source, program, "after-queries", index);
    source.forgetDescendants();
  }
}
function assertInvocationSource(source: SourceFile, program: ts.Program, phase: string, cleanupIndex?: number): void {
  const current = source.getProject().getProgram().compilerObject;
  const path = source.getFilePath();
  const expectedSource = program.getSourceFile(path);
  const actualSource = source.compilerNode;
  if (current !== program || expectedSource !== actualSource) {
    const currentSource = current.getSourceFile(path);
    throw new Error(
      `native invocation Project source differs from its captured native Program: phase=${phase}; cleanupIndex=${cleanupIndex ?? "none"}; priorForget=${cleanupIndex !== undefined && cleanupIndex > 0}; source=${path}; programSame=${current === program}; expectedSourceSame=${expectedSource === actualSource}; currentSourceSame=${currentSource === actualSource}; expectedTextSame=${expectedSource?.text === actualSource.text}; currentTextSame=${currentSource?.text === actualSource.text}; optionsSame=${current.getCompilerOptions() === program.getCompilerOptions()}; expectedRoots=${program.getRootFileNames().length}; currentRoots=${current.getRootFileNames().length}`,
    );
  }
}
function typeObservationDemand(
  query: InventoryInvocationQuery,
  byFile: ReadonlyMap<string, SourceFile>,
): import("../code-facts/type-observations-contract.ts").TypeObservationDemand | undefined {
  if (query.mode !== "types" || query.typeObservations === undefined) {
    return undefined;
  }
  const node = (span: InventorySpan): MorphNode => inventoryQueryNode(byFile.get(span.file), span);
  return mapTypeObservationDemand(query.typeObservations, node);
}
function collectInvocationQuery(query: InventoryInvocationQuery, state: InvocationCollection): void {
  const { context, byFile, program } = state;
  const source = byFile.get(query.node.file);
  const node = inventoryQueryNode(source, query.node);
  assertInvocationSource(node.getSourceFile(), program, "before-query");
  const ordinary =
    query.mode !== "observations" || query.observations === undefined
      ? undefined
      : {
          schema: state.schema,
          basis: state.basis,
          demand: {
            ...query.observations,
            roots: query.observations.roots.map((subject) => inventoryQueryNode(byFile.get(subject.file), subject)),
            reads: query.observations.reads.map((read) => ({ ...read, node: inventoryQueryNode(byFile.get(read.node.file), read.node) })),
          },
        };
  const evidence = captureInvocationEvidence(node, query, ordinary, typeCaptureForQuery(query, state));
  assertInvocationSource(node.getSourceFile(), program, "after-query");
  const wire = encodeInvocationEvidence(node, query, evidence, context.spans.node);
  for (const keyNode of evidence.observations?.keys ?? []) {
    const key = inventoryNodeQueryKey(context.spans.node(keyNode));
    if (!state.computedKeys.has(key)) {
      state.computedKeys.add(key);
      context.computedNameQueries.add(key);
      collectComputedNameFact(keyNode, context);
    }
  }
  const closed: InvocationCollection["related"] = invocationRelatedSources(query, evidence.sources, state);
  for (const related of evidence.sources) {
    if (!byFile.has(context.spans.path(related.getFilePath()))) {
      throw new Error("native ordinary source is outside the captured closure");
    }
    assertInvocationSource(related, program, "ordinary-related-source");
  }
  for (const [subject, fact] of evidence.globals) {
    const span = context.spans.node(subject);
    const key = inventoryNodeQueryKey(span);
    if (state.globalKeys.has(key)) {
      continue;
    }
    state.globalKeys.add(key);
    context.globalOriginQueries.delete(key);
    context.values.globalOrigins.push({
      node: span,
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
  context.values.invocationEvidence.push({ ...wire, sources: [...closed.values()] });
}
function typeCaptureForQuery(query: InventoryInvocationQuery, state: InvocationCollection): TypeObservationCaptureRequest | undefined {
  const demand = typeObservationDemand(query, state.byFile);
  return demand === undefined
    ? undefined
    : {
        demand,
        references: (subject) => invocationReferences(state, subject),
        node: (span) => inventoryQueryNode(state.byFile.get(span.file), span),
        ...(!invocationNeedsValueSourceCatalog(query) || state.valueSourceDeclarations === undefined
          ? {}
          : { drizzleSources: { declarations: state.valueSourceDeclarations, basis: state.basis, tables: state.valueSourceTables } }),
      };
}

function invocationReferences(state: InvocationCollection, subject: MorphNode): readonly MorphNode[] {
  const importer = subject.getSourceFile();
  assertInvocationSource(importer, state.program, "raw-reference-importer");
  const pair = { root: state.context.spans.node(importer), node: state.context.spans.node(subject) };
  const key = referenceQueryKey(pair);
  const answer = state.referenceQueries.find((row) => referenceQueryKey({ root: row.root, node: row.query }) === key);
  if (answer === undefined) {
    throw new Error("native raw reference closure has no exact strict importer/query answer");
  }
  return answer.references.map(({ reference }) => {
    const result = inventoryQueryNode(state.byFile.get(reference.file), reference);
    assertInvocationSource(result.getSourceFile(), state.program, "raw-reference-result");
    return result;
  });
}
function invocationRelatedSources(
  query: InventoryInvocationQuery,
  sources: readonly SourceFile[],
  state: InvocationCollection,
): InvocationCollection["related"] {
  return query.mode === "observations" || (query.mode === "types" && !typeObservationNeedsSourceBindings(query.typeObservations))
    ? new Map()
    : closeInvocationSources(sources, state);
}
function closeInvocationSources(sources: readonly SourceFile[], state: InvocationCollection): InvocationCollection["related"] {
  const closed: InvocationCollection["related"] = new Map();
  for (const source of sources) {
    const file = state.context.spans.path(source.getFilePath());
    if (!state.byFile.has(file)) {
      throw new Error("native invocation related source is outside its captured native closure");
    }
    closed.set(file, collectInvocationSource(source, state));
  }
  return closed;
}
function collectInvocationSource(source: SourceFile, state: InvocationCollection): InventoryPartition["invocationEvidence"][number]["sources"][number] {
  const file = state.context.spans.path(source.getFilePath());
  const previous = state.related.get(file);
  if (previous !== undefined) {
    return previous;
  }
  const identifiers = descendantsOfKind(source, SyntaxKind.Identifier);
  const result = { file, bindings: identifiers.length, computed: [] as InventorySpan[] };
  state.related.set(file, result);
  for (const identifier of identifiers) {
    collectInvocationBinding(identifier, state);
  }
  for (const member of descendantsOfKind(source, SyntaxKind.ElementAccessExpression)) {
    const keyNode = member.getArgumentExpression();
    if (keyNode === undefined) {
      continue;
    }
    const span = state.context.spans.node(keyNode);
    const key = inventoryNodeQueryKey(span);
    result.computed.push(span);
    if (!state.computedKeys.has(key)) {
      state.computedKeys.add(key);
      state.context.computedNameQueries.add(key);
      collectComputedNameFact(keyNode, state.context);
    }
  }
  return result;
}
function collectInvocationBinding(identifier: MorphNode, state: InvocationCollection): void {
  const { context } = state;
  const node = context.spans.node(identifier);
  const key = inventoryNodeQueryKey(node);
  if (state.bindingKeys.has(key)) {
    return;
  }
  state.bindingKeys.add(key);
  context.globalBindingQueries.delete(key);
  context.values.globalBindings.push(node);
  const symbols = bindingFacts(identifier, context.spans);
  context.invocationBindings.set(key, symbols);
  // Complete authored order stays with its walk; matching normalized bytes prove the shared row for both owners.
  if (!(context.families.has("bindings") && context.authored(node.file))) {
    context.values.bindings.push({ node, symbols });
  }
}

function invocationDemandFor(
  request: InventoryBuildRequest,
  families: readonly InventoryFamily[],
  roots: readonly string[],
): readonly InventoryInvocationQuery[] {
  const invocationQueries = request.invocationQueries ?? [];
  if (
    (families.includes("invocation-evidence") &&
      (request.invocationQueries === undefined ||
        ((invocationQueries.length === 0 ||
          invocationQueries.some((query) => query.mode !== "types" || hasTypeObservationValueDemand(query.typeObservations))) &&
          !(families.includes("computed-names") && families.includes("global-origins"))))) ||
    invocationQueries.some((query) => !roots.includes(query.node.file)) ||
    (invocationQueries.length > 0 && !families.includes("invocation-evidence"))
  ) {
    throw new Error("native invocation queries require closed native root/family demand");
  }
  return invocationQueries;
}

function usesReferencePass(families: readonly InventoryFamily[]): boolean {
  return (
    families.includes("callable-declarations") ||
    families.includes("computed-names") ||
    families.includes("global-origins") ||
    families.includes("drizzle-identities") ||
    families.includes("schema-data")
  );
}
