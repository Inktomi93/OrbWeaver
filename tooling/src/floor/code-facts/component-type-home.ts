// Component API origins in a delivered native browser view; copy policy and population admission remain separate.
import type { FunctionDeclaration, Identifier, Node as MorphNode, ParameterDeclaration, SourceFile, VariableDeclaration } from "ts-morph";
import { Node, SymbolFlags, SyntaxKind } from "ts-morph";
import { worldOf } from "../compiler/project-worlds.ts";
import { canonicalCompilerPath, descendantsOfKind, registeredSemanticSourceView, semanticWorkspaceOf } from "../compiler/ts-workspace.ts";
import type { SemanticSourceView } from "../compiler/ts-workspace-contract.ts";
import { observeCallReturns, readCallBindings, readCallReturnProgram, readFunctionReturnPaths } from "./call-returns.ts";
import type {
  ComponentLowerDataEvidence,
  ComponentRenderEvidence,
  ComponentTypeHomeInput,
  ComponentTypeHomeResult,
  ComponentTypeHomeView,
  NativeComponentRenderContribution,
  PrimitiveAttributeApiEvidence,
  PrimitiveSearchApiEvidence,
} from "./component-type-home-contract.ts";
import { ComponentTypeHomeComparisonError } from "./component-type-home-contract.ts";
import { referenceResolutionServices, resolveStableExpression } from "./reference-fact.ts";
import { resolveCallableValueDeclaration, resolveCallableValueOrigin } from "./reference-fact-call.ts";
import { declarationBindingKeys, inventoryDeclarationKey, inventoryExports } from "./semantic-inventory-reader.ts";
import { agreeingCount, createShapeFieldAgreement, indexByField, sharedFieldCounts } from "./shape-copy.ts";
import type { ShapeCopyComparison, ShapeCopySource } from "./shape-copy-contract.ts";
import { exportedShapeDeclarations } from "./shape-declaration.ts";
import { directDerivationTargetKeys, nativeGenericReferenceContributes } from "./shape-derivation.ts";
import { readShapeFields } from "./shape-facts.ts";
import { ownDataFieldNames } from "./shape-fields.ts";
import { packageTypeHome } from "./type-home.ts";
import { declaredByPackage, resolveTypeIdentityChain, resolveTypeMemberOrigin } from "./type-member-origin.ts";
import { resolveTypePropertyOrigin, resolveTypePropertyValue } from "./type-member-origin-core.ts";
import { readReturnedValue } from "./value-carrier.ts";
import { nativeParameterFieldsUnchanged } from "./value-carrier-native.ts";
import { readReturnedDictionary, readValueDependencyContribution } from "./value-dependency.ts";

/** Capture the delivered native owner's program/source epoch without opening another compiler world. */
export function captureComponentTypeHomeView(view: SemanticSourceView): ComponentTypeHomeView {
  return { ...view, nativeProgram: view.sourceFile.getProject().getProgram().compilerObject, nativeSource: view.sourceFile.compilerNode };
}

/** Capture an existing delivered native view without resolving or loading any other program. */
export function registeredComponentTypeHomeView(sourceFile: SourceFile): ComponentTypeHomeView | undefined {
  const view = registeredSemanticSourceView(sourceFile);
  return view === undefined ? undefined : captureComponentTypeHomeView(view);
}

function unavailable(reason: string, component: ComponentRenderEvidence | null = null): ComponentTypeHomeResult {
  return { kind: "unqualified", reason, component, lowerData: { kind: "unqualified", reason, comparisons: [] } };
}

function contextRefusal(input: ComponentTypeHomeInput): string | undefined {
  const { declaration, view, path } = input;
  if (declaration.wasForgotten() || view.sourceFile.wasForgotten()) {
    return "Component ownership received a forgotten declaration or source view.";
  }
  const source = declaration.getSourceFile();
  const workspace = semanticWorkspaceOf(source.getProject());
  const registered = registeredSemanticSourceView(source);
  if (workspace === undefined || registered?.program !== view.program || workspace.program(view.program.descriptor.config) !== view.program) {
    return "Component ownership requires an existing admitted native workspace view.";
  }
  const canonicalSource = canonicalCompilerPath(workspace.root, source.getFilePath());
  if (
    source !== view.sourceFile ||
    registered.canonicalPath !== canonicalSource ||
    canonicalCompilerPath(workspace.root, path) !== canonicalSource ||
    canonicalSource !== view.canonicalPath
  ) {
    return "Component ownership source identity differs from its native browser view.";
  }
  const program = source.getProject().getProgram().compilerObject;
  if (program !== view.nativeProgram || source.compilerNode !== view.nativeSource || program.getSourceFile(source.getFilePath()) !== source.compilerNode) {
    return "Component ownership source belongs to a stale or foreign native program epoch.";
  }
  const canonicalPath = canonicalSource.slice(workspace.root.length + 1);
  return worldOf(canonicalPath) !== "browser" || !program.getSourceFiles().some((file) => file.fileName.endsWith("/lib.dom.d.ts"))
    ? "Component ownership requires the native DOM world; Node React fallback is not evidence."
    : undefined;
}

function supportingViewRefusal(input: ComponentTypeHomeInput): string | undefined {
  const workspace = semanticWorkspaceOf(input.declaration.getProject());
  if (workspace === undefined) {
    return "Component supporting sources require the delivered native owner.";
  }
  const owner = packageTypeHome(input.path)?.packageName;
  for (const view of input.supportingViews ?? []) {
    const source = view.sourceFile;
    if (
      source.wasForgotten() ||
      source.getProject() !== input.declaration.getProject() ||
      view.program !== input.view.program ||
      view.nativeProgram !== input.view.nativeProgram
    ) {
      return "Component supporting source belongs to a foreign owner or native program epoch.";
    }
    const path = canonicalCompilerPath(workspace.root, source.getFilePath());
    if (
      path !== view.canonicalPath ||
      source.compilerNode !== view.nativeSource ||
      input.view.nativeProgram.getSourceFile(source.getFilePath()) !== view.nativeSource
    ) {
      return "Component supporting source belongs to a stale or foreign source epoch.";
    }
    const relative = path.slice(workspace.root.length + 1);
    if (owner === undefined || packageTypeHome(relative)?.packageName !== owner || worldOf(relative) !== "browser") {
      return "Component supporting source belongs to a foreign declaration owner boundary.";
    }
  }
  // biome-ignore lint/complexity/noUselessUndefined: noImplicitReturns requires an explicit refusal-free result.
  return undefined;
}

function componentViews(input: ComponentTypeHomeInput): readonly ComponentTypeHomeView[] {
  return [...new Map([input.view, ...(input.supportingViews ?? [])].map((view) => [view.sourceFile, view])).values()];
}

interface ComponentTypeGraph {
  readonly declarations: readonly (import("ts-morph").InterfaceDeclaration | import("ts-morph").TypeAliasDeclaration)[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
  readonly opaque: ReadonlySet<string>;
}

function supportedGenericReference(identifier: Identifier, view: ComponentTypeHomeView): boolean {
  return nativeGenericReferenceContributes(identifier, { program: view.nativeProgram, source: view.nativeSource });
}

function componentTypeGraph(input: ComponentTypeHomeInput): ComponentTypeGraph {
  const views = componentViews(input);
  const types = views.flatMap(({ sourceFile }) => [...sourceFile.getInterfaces(), ...sourceFile.getTypeAliases()]);
  const keys = new Set(types.map(inventoryDeclarationKey));
  const edges = new Map(types.map((type) => [inventoryDeclarationKey(type), [...directDerivationTargetKeys(type)].filter((key) => keys.has(key))]));
  const opaque = new Set<string>();
  for (const view of views) {
    typeGraphOrigins(view, keys, edges, opaque);
  }
  return { declarations: types, edges, opaque };
}

function typeGraphOrigins(view: ComponentTypeHomeView, keys: ReadonlySet<string>, edges: ReadonlyMap<string, string[]>, opaque: Set<string>): void {
  for (const identifier of descendantsOfKind(view.sourceFile, SyntaxKind.Identifier)) {
    const owner = identifier.getFirstAncestor((node) => Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node));
    const targets = owner === undefined ? undefined : edges.get(inventoryDeclarationKey(owner));
    if (targets === undefined) {
      continue;
    }
    const origins = declarationBindingKeys(identifier).filter((key) => keys.has(key));
    if (supportedGenericReference(identifier, view)) {
      targets.push(...origins);
    } else {
      for (const origin of origins) {
        opaque.add(origin);
      }
    }
  }
}

function exportedCallable(exported: FunctionDeclaration | VariableDeclaration): MorphNode | undefined {
  const name = exported.getNameNode();
  if (name === undefined) {
    return exported;
  }
  const fact = resolveCallableValueDeclaration(name);
  return fact.kind === "resolved" ? fact.value.declaration : undefined;
}

function renderParameter(callable: MorphNode): ParameterDeclaration | undefined {
  return Node.isFunctionDeclaration(callable) || Node.isArrowFunction(callable) || Node.isFunctionExpression(callable)
    ? callable.getParameters()[0]
    : undefined;
}

function renderLeaves(raw: MorphNode, sources: ReadonlySet<SourceFile>, seen: ReadonlySet<MorphNode> = new Set()): readonly MorphNode[] | undefined {
  const value = referenceResolutionServices.unwrapExpression(raw);
  if (seen.has(value) || !sources.has(value.getSourceFile())) {
    return;
  }
  const visited = new Set([...seen, value]);
  if (Node.isJsxElement(value) || Node.isJsxSelfClosingElement(value) || Node.isJsxFragment(value) || value.getKind() === SyntaxKind.NullKeyword) {
    return [value];
  }
  if (Node.isCallExpression(value)) {
    return nativeRenderContribution(value) === undefined ? undefined : [value];
  }
  if (Node.isConditionalExpression(value)) {
    const yes = renderLeaves(value.getWhenTrue(), sources, visited);
    const no = renderLeaves(value.getWhenFalse(), sources, visited);
    return yes === undefined || no === undefined ? undefined : [...yes, ...no];
  }
  if (Node.isIdentifier(value) || Node.isPropertyAccessExpression(value) || Node.isElementAccessExpression(value)) {
    const binding = resolveStableExpression(value);
    return binding.kind === "resolved" ? renderLeaves(binding.value, sources, visited) : undefined;
  }
  // biome-ignore lint/complexity/noUselessUndefined: noImplicitReturns requires an explicit unsupported result.
  return undefined;
}

function renderReturns(callable: MorphNode, sources: ReadonlySet<SourceFile>): readonly MorphNode[] | undefined {
  const returned = readFunctionReturnPaths(callable);
  if (returned.kind !== "resolved") {
    return;
  }
  const expressions: MorphNode[] = [];
  for (const value of returned.value) {
    const leaves = renderLeaves(value, sources);
    if (leaves === undefined) {
      return;
    }
    expressions.push(...leaves);
  }
  return expressions.some((value) => value.getKind() !== SyntaxKind.NullKeyword) ? expressions : undefined;
}

function supportingTypeKeys(
  parameter: ParameterDeclaration | import("ts-morph").TypeNode,
  graph: ComponentTypeGraph,
  view: ComponentTypeHomeView,
): ReadonlySet<string> {
  const identity = resolveTypeIdentityChain(parameter);
  const pending = identity.kind === "resolved" ? identity.value.flatMap((origin) => origin.declarations.map(inventoryDeclarationKey)) : [];
  const annotation = Node.isParameterDeclaration(parameter) ? parameter.getTypeNode() : parameter;
  if (annotation !== undefined) {
    for (const identifier of annotation.getDescendantsOfKind(SyntaxKind.Identifier)) {
      if (supportedGenericReference(identifier, view)) {
        pending.push(...declarationBindingKeys(identifier));
      }
    }
  }
  const visited = new Set<string>();
  for (const key of pending) {
    if (!visited.has(key)) {
      visited.add(key);
      pending.push(...(graph.edges.get(key) ?? []));
    }
  }
  return visited;
}

interface ComponentOriginRead {
  readonly component: ComponentRenderEvidence | undefined;
  readonly reason: string;
}

function componentEvidence(input: ComponentTypeHomeInput): ComponentOriginRead {
  const views = componentViews(input);
  const bySource = new Map(views.map((view) => [view.sourceFile, view]));
  const sources = new Set(bySource.keys());
  const graph = componentTypeGraph(input);
  const target = inventoryDeclarationKey(input.declaration);
  let evidence: ComponentRenderEvidence | undefined;
  for (const exported of new Set(views.flatMap(({ sourceFile }) => [...inventoryExports(sourceFile).values()].flat()))) {
    const rendered = renderedCallable(exported, bySource, sources);
    if (rendered === undefined) {
      continue;
    }
    const { callable, parameter, returns, view } = rendered;
    const visited = supportingTypeKeys(parameter, graph, view);
    const primitive = visited.has(target) ? undefined : primitiveAttributeEvidence(rendered, input, sources, graph);
    if (visited.has(target) || primitive !== undefined) {
      evidence = {
        callable,
        parameter,
        returns,
        nativeRenders: returns.flatMap((value) => {
          const contribution = Node.isCallExpression(value) ? nativeRenderContribution(value) : undefined;
          return contribution === undefined ? [] : [contribution];
        }),
        ...(primitive === undefined ? {} : { primitiveAttributes: [primitive] }),
        supportingDeclarations: graph.declarations.filter((type) => visited.has(inventoryDeclarationKey(type)) || type === input.declaration),
      };
      break;
    }
  }
  evidence ??= primitiveSearchEvidence(input, views, graph);
  return {
    component: evidence,
    reason: graph.opaque.has(target)
      ? "Supporting API contribution through an opaque generic is unqualified."
      : "No exported local render callable parameter/supporting graph proves this API.",
  };
}

function nativeSearchConstructor(call: import("ts-morph").CallExpression, value: MorphNode, input: ComponentTypeHomeInput): MorphNode | undefined {
  if (!Node.isNewExpression(value)) {
    return;
  }
  const origin = resolveCallableValueOrigin(value);
  const signature = value.getProject().getTypeChecker().getResolvedSignature(value)?.getDeclaration();
  const method = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  const member = resolveTypeMemberOrigin(call.getExpression());
  if (member.kind !== "resolved" || referenceResolutionServices.inspectSymbolWrites(member.value.symbol, call.getExpression()).kind !== "resolved") {
    return;
  }
  if (origin.kind !== "resolved" || origin.value.target.kind !== "module" || origin.value.target.canonical.kind !== "project") {
    return;
  }
  const owner = origin.value.target.canonical.declaration;
  return Node.isClassDeclaration(owner) &&
    owner.getName() === "MiniSearch" &&
    declaredByPackage([owner], "minisearch") &&
    signature?.getParent().compilerNode === owner.compilerNode &&
    method?.getParent().compilerNode === owner.compilerNode &&
    input.view.nativeProgram.isSourceFileFromExternalLibrary(owner.getSourceFile().compilerNode) &&
    member.value.declarations.every((declaration) => declaration.getParent()?.compilerNode === owner.compilerNode)
    ? owner
    : undefined;
}

function nativeSearchFieldOrigins(
  value: MorphNode,
  parameter: ParameterDeclaration,
  observations: import("./reference-fact-contract.ts").CallReturnObservations,
  input: ComponentTypeHomeInput,
): readonly MorphNode[] | undefined {
  if (!Node.isNewExpression(value)) {
    return;
  }
  const program = readCallReturnProgram(parameter, observations);
  if (program.kind !== "resolved" || !nativeParameterFieldsUnchanged(parameter, program.value)) {
    return;
  }
  const options = value.getArguments()[0];
  if (options === undefined) {
    return;
  }
  const fields = readReturnedValue(options, ["fields"], observations, { terminals: new Set(), bindings: new Map(), nativeValueTransfers: true });
  if (fields.kind !== "resolved" || fields.value.some((field) => !field.present)) {
    return;
  }
  const origins = fields.value.flatMap((field) => {
    const declaration = Node.isIdentifier(field.value) ? field.value.getSymbol()?.getValueDeclaration() : undefined;
    if (declaration !== parameter || field.path.length === 0) {
      return [];
    }
    const property = resolveTypePropertyValue(field.value, field.path);
    return property.kind === "resolved"
      ? property.value.declarations.filter((origin) => {
          const parent = origin.getParent();
          return (
            parent?.compilerNode === input.declaration.compilerNode ||
            (Node.isTypeLiteral(parent) && parent.getParent().compilerNode === input.declaration.compilerNode)
          );
        })
      : [];
  });
  return origins.length === 0 ? undefined : origins;
}

interface PrimitiveSearchContext {
  readonly input: ComponentTypeHomeInput;
  readonly observations: ReturnType<typeof observeCallReturns>;
  readonly searches: readonly import("ts-morph").CallExpression[];
  readonly graph: ReturnType<typeof componentTypeGraph>;
}

function primitiveSearchProof(
  call: import("ts-morph").CallExpression,
  parameter: ParameterDeclaration,
  returns: readonly MorphNode[],
  context: PrimitiveSearchContext,
): PrimitiveSearchApiEvidence | undefined {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression)) {
    return;
  }
  const receivers = readReturnedValue(expression.getExpression(), [], context.observations, {
    terminals: new Set(),
    bindings: new Map(),
    nativeValueTransfers: true,
  });
  if (
    receivers.kind !== "resolved" ||
    receivers.value.length === 0 ||
    receivers.value.some(
      (receiver) => !receiver.present || receiver.path.length > 0 || nativeSearchConstructor(call, receiver.value, context.input) === undefined,
    )
  ) {
    return;
  }
  const origins = receivers.value.map((receiver) => nativeSearchFieldOrigins(receiver.value, parameter, context.observations, context.input));
  if (origins.some((origin) => origin === undefined || origin.length === 0)) {
    return;
  }
  const dependency = returns
    .map((value) =>
      readValueDependencyContribution({ value, observations: context.observations, terminals: new Set([call.compilerNode]), nativeValueTransfers: true }),
    )
    .find((result) => result.kind === "qualified");
  const method = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  const construction = receivers.value[0]?.value;
  if (dependency?.kind !== "qualified" || method === undefined || construction === undefined) {
    return;
  }
  return { call, constructor: construction, method, fieldOrigins: origins.flatMap((origin) => origin ?? []), dependency };
}

function primitiveCallableEvidence(exported: MorphNode, view: ComponentTypeHomeView, context: PrimitiveSearchContext): ComponentRenderEvidence | undefined {
  if (!(Node.isFunctionDeclaration(exported) || Node.isVariableDeclaration(exported))) {
    return;
  }
  const callable = exportedCallable(exported);
  if (callable === undefined || !(Node.isFunctionDeclaration(callable) || Node.isArrowFunction(callable) || Node.isFunctionExpression(callable))) {
    return;
  }
  const returns = readFunctionReturnPaths(callable, { nativeValueTransfers: true });
  if (returns.kind !== "resolved") {
    return;
  }
  for (const parameter of callable.getParameters()) {
    const visited = supportingTypeKeys(parameter, context.graph, view);
    if (!visited.has(inventoryDeclarationKey(context.input.declaration))) {
      continue;
    }
    const searches = context.searches.filter(
      (call) =>
        call.getFirstAncestor((parent) => Node.isFunctionDeclaration(parent) || Node.isArrowFunction(parent) || Node.isFunctionExpression(parent)) === callable,
    );
    const search = searches.map((call) => primitiveSearchProof(call, parameter, returns.value, context)).find((proof) => proof !== undefined);
    if (search !== undefined) {
      return {
        callable,
        parameter,
        returns: returns.value,
        primitiveSearches: [search],
        supportingDeclarations: context.graph.declarations.filter((declaration) => visited.has(inventoryDeclarationKey(declaration))),
      };
    }
  }
  return undefined;
}

function primitiveSearchEvidence(
  input: ComponentTypeHomeInput,
  views: readonly ComponentTypeHomeView[],
  graph: ReturnType<typeof componentTypeGraph>,
): ComponentRenderEvidence | undefined {
  const calls = views.flatMap((view) => view.sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression));
  const searches = calls.filter((call) => {
    const expression = call.getExpression();
    return Node.isPropertyAccessExpression(expression) && expression.getName() === "search";
  });
  if (searches.length === 0) {
    return;
  }
  const observations = observeCallReturns(
    calls,
    views.flatMap((view) => view.sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)),
    { nativeValueTransfers: true },
  );
  const context = { input, observations, searches, graph };
  for (const view of views) {
    for (const exported of new Set([...inventoryExports(view.sourceFile).values()].flat())) {
      const evidence = primitiveCallableEvidence(exported, view, context);
      if (evidence !== undefined) {
        return evidence;
      }
    }
  }
  return undefined;
}

interface RenderedCallable {
  readonly callable: MorphNode;
  readonly parameter: ParameterDeclaration;
  readonly returns: readonly MorphNode[];
  readonly view: ComponentTypeHomeView;
}

function renderedCallable(
  exported: MorphNode,
  views: ReadonlyMap<SourceFile, ComponentTypeHomeView>,
  sources: ReadonlySet<SourceFile>,
): RenderedCallable | undefined {
  if (!(sources.has(exported.getSourceFile()) && (Node.isFunctionDeclaration(exported) || Node.isVariableDeclaration(exported)))) {
    return;
  }
  const callable = exportedCallable(exported);
  const parameter = callable === undefined ? undefined : renderParameter(callable);
  const returns = callable === undefined ? undefined : renderReturns(callable, sources);
  const view = callable === undefined ? undefined : views.get(callable.getSourceFile());
  return callable === undefined || parameter === undefined || returns === undefined || view === undefined ? undefined : { callable, parameter, returns, view };
}

function lowerData(input: ComponentTypeHomeInput): ComponentLowerDataEvidence {
  const { declaration } = input;
  const body = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : declaration;
  const fields = body !== undefined && (Node.isInterfaceDeclaration(body) || Node.isTypeLiteral(body)) ? ownDataFieldNames(body) : new Set<string>();
  const origins = input.lowerDeclarations.filter((lower) => directDerivationTargetKeys(declaration).has(inventoryDeclarationKey(lower)));
  if (fields.size === 0 && origins.length > 0) {
    return { kind: "derived", origins };
  }
  const sources: ShapeCopySource[] = input.lowerDeclarations.flatMap((decl) => {
    const properties = readShapeFields(decl, "copy");
    return properties === undefined
      ? []
      : [{ name: decl.getName(), file: decl.getSourceFile().getFilePath(), decl, fields: new Set(properties.map((property) => property.name)) }];
  });
  const agree = createShapeFieldAgreement(
    () => declaration.getProject().getTypeChecker(),
    (kind): never => {
      throw new ComponentTypeHomeComparisonError(`Component lower-data comparison refused: ${kind}`);
    },
  );
  const comparisons: ShapeCopyComparison[] = [...sharedFieldCounts(fields, indexByField(sources))].map(([contract, shared]) => ({
    contract,
    shared,
    agreeing: agreeingCount({ decl: declaration, fields }, contract, agree),
    exact: shared === fields.size && shared === contract.fields.size,
  }));
  return { kind: "unqualified", reason: "Field nonmatches or an incomplete lower-owner set do not prove lower-data ownership.", comparisons };
}

/** Prove actual exported render-callable support, never ownership from a name, path or structural type fit. */
export function componentTypeHome(input: ComponentTypeHomeInput): ComponentTypeHomeResult {
  const refusal = contextRefusal(input) ?? supportingViewRefusal(input);
  if (refusal !== undefined) {
    return { kind: "refused", reason: refusal };
  }
  if (
    !exportedShapeDeclarations(input.declaration.getSourceFile()).some(
      ([, declaration]) => inventoryDeclarationKey(declaration) === inventoryDeclarationKey(input.declaration),
    )
  ) {
    return unavailable("The candidate is not a local exported type origin.");
  }
  if (input.lowerDeclarations.some((declaration) => declaration.wasForgotten() || declaration.getProject() !== input.declaration.getProject())) {
    return { kind: "refused", reason: "Lower-owner evidence belongs to a stale or foreign compiler world." };
  }
  const origin = componentEvidence(input);
  const component = origin.component;
  if (component === undefined) {
    return unavailable(origin.reason);
  }
  let data: ComponentLowerDataEvidence;
  try {
    data = lowerData(input);
  } catch (error) {
    if (error instanceof ComponentTypeHomeComparisonError) {
      return { kind: "refused", reason: error.message };
    }
    throw error;
  }
  if (data.kind === "unqualified" && data.comparisons.some((comparison) => comparison.agreeing > 0)) {
    return {
      kind: "unqualified",
      reason: "Hand-written fields overlap lower-owned data; component use does not establish derivation.",
      component,
      lowerData: data,
    };
  }
  return { kind: "owned", component, lowerData: data };
}

function nativeRenderContribution(call: import("ts-morph").CallExpression): NativeComponentRenderContribution | undefined {
  const target = nativeRenderTarget(call);
  if (target === undefined) {
    return;
  }
  const program = call.getProject().getProgram().compilerObject;
  const argument = call.getArguments()[0];
  if (argument === undefined) {
    return;
  }
  const observations = observeCallReturns([call]);
  const terminals = new Set([call.compilerNode]);
  const contribution = readValueDependencyContribution({ value: call, observations, terminals });
  if (contribution.kind !== "qualified") {
    return;
  }
  const tags = readReturnedValue(argument, ["defaultTagName"], observations, terminals);
  const enabled = readReturnedValue(argument, ["enabled"], observations, terminals);
  if (tags.kind !== "resolved" || tags.value.length !== 1 || enabled.kind !== "resolved") {
    return;
  }
  if (enabled.value.some((alternative) => alternative.present && alternative.value.getKind() !== SyntaxKind.TrueKeyword)) {
    return;
  }
  const tag = tags.value[0];
  if (tag === undefined || !tag.present || tag.path.length > 0 || !Node.isStringLiteral(tag.value)) {
    return;
  }
  const map = call.getSymbolsInScope(SymbolFlags.Type).find((symbol) => symbol.getName() === "HTMLElementTagNameMap");
  const declaration = map?.getDeclarations()[0];
  if (declaration === undefined || !program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)) {
    return;
  }
  const property = resolveTypePropertyOrigin(declaration, tag.value.getLiteralValue());
  const domTag = property.kind === "resolved" ? property.value[0] : undefined;
  return domTag === undefined ? undefined : { call, callee: target.declaration, domTag, dependency: contribution };
}

function nativeRenderTarget(
  call: import("ts-morph").CallExpression,
): Extract<import("./reference-fact-contract.ts").ModuleMemberOrigin["canonical"], { kind: "project" }> | undefined {
  const origin = resolveCallableValueOrigin(call);
  if (origin.kind !== "resolved" || origin.value.target.kind !== "module" || origin.value.target.canonical.kind !== "project") {
    return;
  }
  const target = origin.value.target.canonical;
  const program = call.getProject().getProgram().compilerObject;
  return target.exportedName !== "useRender" ||
    !Node.isFunctionDeclaration(target.declaration) ||
    !declaredByPackage([target.declaration], "@base-ui/react") ||
    program.getSourceFile(target.sourceFile.getFilePath()) !== target.sourceFile.compilerNode
    ? undefined
    : target;
}

function intrinsicDomTag(tag: MorphNode): MorphNode | undefined {
  if (!Node.isIdentifier(tag)) {
    return;
  }
  const program = tag.getProject().getProgram().compilerObject;
  const map = tag.getSymbolsInScope(SymbolFlags.Type).find((symbol) => symbol.getName() === "HTMLElementTagNameMap");
  const declaration = map?.getDeclarations()[0];
  if (declaration === undefined || !program.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode)) {
    return;
  }
  const property = resolveTypePropertyOrigin(declaration, tag.getText());
  return property.kind === "resolved" ? property.value[0] : undefined;
}

function spreadElement(
  spread: import("ts-morph").JsxSpreadAttribute,
): import("ts-morph").JsxOpeningElement | import("ts-morph").JsxSelfClosingElement | undefined {
  return spread.getFirstAncestor(
    (node): node is import("ts-morph").JsxOpeningElement | import("ts-morph").JsxSelfClosingElement =>
      Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node),
  );
}

function spreadCannotWrite(
  spread: import("ts-morph").JsxSpreadAttribute,
  keys: readonly string[],
  observations: import("./reference-fact-contract.ts").CallReturnObservations,
): boolean {
  return keys.every((key) => {
    const sources = readReturnedValue(spread.getExpression(), [key], observations, new Set());
    return sources.kind === "resolved" && sources.value.every((source) => !source.present);
  });
}

function laterAttributesRetain(
  spread: import("ts-morph").JsxSpreadAttribute,
  keys: readonly string[],
  observations: import("./reference-fact-contract.ts").CallReturnObservations,
): boolean {
  const parent = spreadElement(spread);
  if (parent === undefined) {
    return false;
  }
  return parent
    .getAttributes()
    .slice(parent.getAttributes().indexOf(spread) + 1)
    .every((attribute) =>
      Node.isJsxAttribute(attribute)
        ? !keys.includes(attribute.getNameNode().getText())
        : Node.isJsxSpreadAttribute(attribute) && spreadCannotWrite(attribute, keys, observations),
    );
}

function dictionaryApiDeclaration(
  declaration: ComponentTypeHomeInput["declaration"],
  callable: MorphNode,
  origins: readonly MorphNode[],
  context: { readonly input: ComponentTypeHomeInput; readonly graph: ComponentTypeGraph },
): boolean {
  if (!(Node.isFunctionDeclaration(callable) || Node.isArrowFunction(callable) || Node.isFunctionExpression(callable))) {
    return false;
  }
  const returned = callable.getReturnTypeNode();
  if (
    returned !== undefined &&
    Node.isTypeReference(returned) &&
    declarationBindingKeys(returned.getTypeName()).includes(inventoryDeclarationKey(declaration))
  ) {
    return true;
  }
  const view = componentViews(context.input).find((candidate) => candidate.sourceFile === callable.getSourceFile());
  if (returned === undefined || view === undefined || !supportingTypeKeys(returned, context.graph, view).has(inventoryDeclarationKey(declaration))) {
    return false;
  }
  const body = Node.isTypeAliasDeclaration(declaration) ? declaration.getTypeNode() : undefined;
  if (body === undefined || !Node.isIndexedAccessTypeNode(body) || body.getIndexTypeNode().getKind() !== SyntaxKind.NumberKeyword) {
    return false;
  }
  let query = body.getObjectTypeNode();
  while (Node.isParenthesizedTypeNode(query)) {
    query = query.getTypeNode();
  }
  const originKeys = new Set(origins.map(inventoryDeclarationKey));
  return Node.isTypeQuery(query) && declarationBindingKeys(query.getExprName()).some((key) => originKeys.has(key));
}

function returnedAttributeKeys(call: import("ts-morph").CallExpression, keys: readonly string[]): boolean {
  const type = call.getType();
  const properties = type.getProperties();
  return (
    properties.length === keys.length &&
    properties.every((property) => keys.includes(property.getName())) &&
    type.getStringIndexType() === undefined &&
    type.getNumberIndexType() === undefined
  );
}

function attributeHelper(
  call: import("ts-morph").CallExpression,
  sources: ReadonlySet<SourceFile>,
):
  | {
      readonly callable: MorphNode;
      readonly observations: import("./reference-fact-contract.ts").CallReturnObservations;
      readonly dictionary: PrimitiveAttributeApiEvidence["dictionary"];
    }
  | undefined {
  const helper = resolveCallableValueDeclaration(call);
  if (helper.kind !== "resolved" || !sources.has(helper.value.sourceFile)) {
    return;
  }
  const returned = readFunctionReturnPaths(helper.value.declaration);
  if (returned.kind !== "resolved" || returned.value.length !== 1 || returned.value[0] === undefined) {
    return;
  }
  const observations = observeCallReturns([call, ...helper.value.declaration.getDescendantsOfKind(SyntaxKind.CallExpression)], undefined, {
    explicitAbsentReturns: true,
  });
  const dictionary = readReturnedDictionary({ value: returned.value[0], observations, bindings: readCallBindings(call, helper.value.declaration, new Map()) });
  return dictionary.kind !== "qualified" ||
    dictionary.keys.some((key) => !key.startsWith("data-") || key.length <= "data-".length) ||
    !returnedAttributeKeys(call, dictionary.keys)
    ? undefined
    : { callable: helper.value.declaration, observations, dictionary };
}

function primitiveAttributeAtSpread(
  spread: import("ts-morph").JsxSpreadAttribute,
  context: {
    readonly rendered: RenderedCallable;
    readonly input: ComponentTypeHomeInput;
    readonly sources: ReadonlySet<SourceFile>;
    readonly graph: ComponentTypeGraph;
  },
): PrimitiveAttributeApiEvidence | undefined {
  const site = spreadElement(spread);
  const owner = spread.getFirstAncestor((node) => Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node));
  if (site === undefined || owner !== context.rendered.callable) {
    return;
  }
  const domTag = intrinsicDomTag(site.getTagNameNode());
  const call = referenceResolutionServices.unwrapExpression(spread.getExpression());
  if (domTag === undefined || !Node.isCallExpression(call)) {
    return;
  }
  const helper = attributeHelper(call, context.sources);
  if (
    helper === undefined ||
    !laterAttributesRetain(spread, helper.dictionary.keys, helper.observations) ||
    !dictionaryApiDeclaration(context.input.declaration, helper.callable, helper.dictionary.vocabularyOrigins, context)
  ) {
    return;
  }
  return { callable: helper.callable, call, consumedSpread: spread, domTag, dictionary: helper.dictionary };
}

function primitiveAttributeEvidence(
  rendered: RenderedCallable,
  input: ComponentTypeHomeInput,
  sources: ReadonlySet<SourceFile>,
  graph: ComponentTypeGraph,
): PrimitiveAttributeApiEvidence | undefined {
  for (const returned of rendered.returns) {
    for (const spread of returned.getDescendantsOfKind(SyntaxKind.JsxSpreadAttribute)) {
      const evidence = primitiveAttributeAtSpread(spread, { rendered, input, sources, graph });
      if (evidence !== undefined) {
        return evidence;
      }
    }
  }
  // biome-ignore lint/complexity/noUselessUndefined: noImplicitReturns requires the unsupported result.
  return undefined;
}
