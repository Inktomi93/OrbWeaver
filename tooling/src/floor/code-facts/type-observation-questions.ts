// Explicit raw questions retain their nominated locations and one importing capture.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices } from "./reference-fact.ts";
import { rootIdentifier } from "./reference-fact-alias.ts";
import { uncastReceiver } from "./type-member-origin-core.ts";
import type {
  SelectedPropertyGraph,
  TypeObservationCaptureOwner,
  TypeObservationDemand,
  TypeObservationQuestion,
  TypeObservationReader,
  TypeObservationValues,
} from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";
import { unwrapTypeExpression } from "./type-slot-syntax.ts";

/** Capture and replay follow the same bounded raw lexical initializer relationships. */
export function constInitializerNominations(
  nodes: readonly MorphNode[],
  readers: TypeObservationReader,
): NonNullable<TypeObservationValues["constInitializers"]> {
  return [...new Set(nodes)].map((node) => {
    const values = new Set<MorphNode>([node]);
    uncastReceiver(
      node,
      (identifier) => {
        const symbol = readers.symbol(identifier);
        return symbol === null ? [] : readers.symbolData(symbol).declarations;
      },
      (value) => {
        values.add(value);
      },
    );
    return { node, values: [...values] };
  });
}

function constInitializerProperties(node: MorphNode, names: readonly string[], readers: TypeObservationReader): void {
  if (names.length === 0) {
    return;
  }
  const selector = { ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" as const }] };
  if (readers.select(selector) !== null) {
    for (const name of names) {
      readers.propertySymbol(selector, name);
    }
  }
}
function constInitializers(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  for (const { values } of constInitializerNominations(question.nodes, readers)) {
    for (const node of values) {
      readers.symbol(node);
      constInitializerProperties(node, question.properties ?? [], readers);
      valueProfile(question, node, profile);
    }
  }
}

function drizzlePredicateInputs(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (question.properties !== undefined) {
    throw new Error("native predicate inputs do not nominate named properties");
  }
  for (const seed of question.nodes) {
    for (const node of readers.predicateInputs(seed).values) {
      readers.symbol(node);
      const root = nodeTypeSelector(node);
      const element = readers.arrayElement(root).element;
      const selector = element !== null && readers.select(element) !== null ? element : root;
      for (const part of observeTypeConstituentRoots([selector], readers, [])) {
        if (readers.primitiveFlags(part).templateLiteral === undefined) {
          throw new Error("native predicate-input template-literal flag was not captured");
        }
      }
      valueProfile(question, node, profile);
    }
  }
}

function propertyLiterals(readers: TypeObservationReader, selector: NativeTypeSelector, at: MorphNode, names: readonly string[]): void {
  if (readers.select(selector) === null) {
    return;
  }
  readers.literal(selector);
  for (const name of names) {
    const property: NativeTypeSelector = { ...selector, steps: [...selector.steps, { kind: "property", name, at }] };
    if (readers.select(property) === null) {
      continue;
    }
    readers.literal(property);
    for (const part of readers.unions(property)) {
      readers.literal(part);
    }
  }
}
function typeSlots(readers: TypeObservationReader, selector: NativeTypeSelector, at: MorphNode, names: readonly string[]): void {
  if (readers.select(selector) === null) {
    return;
  }
  propertyLiterals(readers, selector, at, names);
  for (const part of readers.unions(selector)) {
    propertyLiterals(readers, part, at, names);
  }
}
function nodeSlots(readers: TypeObservationReader, node: MorphNode, names: readonly string[]): void {
  readers.symbol(node);
  typeSlots(readers, nodeTypeSelector(node), node, names);
  typeSlots(readers, { ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" }] }, node, names);
}
function definitionClosure(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (question.files === undefined) {
    throw new Error("native definition closure has no admitted source roster");
  }
  const admitted = new Set(question.files);
  if (question.nodes.some((node) => !admitted.has(node.getSourceFile().getFilePath().replaceAll("\\", "/")))) {
    throw new Error("native definition closure root is outside its admitted roster");
  }
  const seen = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const node of pending) {
    if (seen.has(node)) {
      continue;
    }
    seen.add(node);
    for (const declaration of readers.definitions(node)) {
      if (admitted.has(declaration.getSourceFile().getFilePath().replaceAll("\\", "/"))) {
        const descendants = [declaration, ...declaration.getDescendants()];
        pending.push(...descendants.filter(Node.isIdentifier));
        for (const value of descendants.filter(isValueNode)) {
          valueProfile(question, value, profile);
        }
      }
    }
  }
}
function declarationClosure(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (question.files === undefined) {
    throw new Error("native declaration closure has no admitted source roster");
  }
  const admitted = new Set(question.files);
  const inside = (node: MorphNode): boolean => admitted.has(node.getSourceFile().getFilePath().replaceAll("\\", "/"));
  if (question.nodes.some((node) => !inside(node))) {
    throw new Error("native declaration closure root is outside its admitted roster");
  }
  const seen = new Set<MorphNode>();
  const sources = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const root of pending) {
    if (seen.has(root)) {
      continue;
    }
    closureSourceSymbols(root.getSourceFile(), sources, readers);
    for (const node of [root, ...root.getDescendants()]) {
      if (seen.has(node) || Node.isOmittedExpression(node)) {
        continue;
      }
      seen.add(node);
      pending.push(...closureDeclarations(node, readers).filter(inside));
      if (Node.isIdentifier(node)) {
        valueProfile(question, node, profile);
      }
      closureReceiver(node, question, readers);
    }
  }
}
function closureSourceSymbols(source: import("ts-morph").SourceFile, sources: Set<MorphNode>, readers: TypeObservationReader): void {
  if (sources.has(source)) {
    return;
  }
  sources.add(source);
  for (const declaration of [...source.getFunctions(), ...source.getVariableStatements()]) {
    readers.symbol(declaration);
  }
}
function closureDeclarations(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  if (!(Node.isIdentifier(node) || Node.isFunctionDeclaration(node) || Node.isVariableStatement(node))) {
    return [];
  }
  const symbol = readers.symbol(node);
  const declarations = symbol === null ? [] : [symbol, readers.symbolData(symbol).canonical].flatMap((value) => readers.symbolData(value).declarations);
  return [...declarations, ...(Node.isIdentifier(node) ? readers.definitions(node) : [])];
}
function closureReceiver(node: MorphNode, question: TypeObservationQuestion, readers: TypeObservationReader): void {
  if (!Node.isCallExpression(node) || node.getArguments().length > 0) {
    return;
  }
  const callee = node.getExpression();
  if (Node.isPropertyAccessExpression(callee) && question.receiverMethods?.includes(callee.getName()) === true) {
    primitiveFlags(readers, nodeTypeSelector(callee.getExpression()));
  }
}
function primitiveFlags(readers: TypeObservationReader, selector: NativeTypeSelector): void {
  if (readers.select(selector) === null) {
    return;
  }
  readers.primitiveFlags(selector);
  for (const part of readers.unions(selector)) {
    readers.primitiveFlags(part);
  }
}
function isValueNode(node: MorphNode): boolean {
  return !Node.isOmittedExpression(node) && (Node.isExpression(node) || Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node));
}
function valueProfile(question: TypeObservationQuestion, node: MorphNode, profile: TypeObservationCaptureOwner["profile"]): void {
  if (question.valueFacets === undefined) {
    return;
  }
  if (profile === undefined) {
    throw new Error("native value-profile demand has no captured owner");
  }
  profile(node, question.valueFacets);
}
function properties(question: TypeObservationQuestion, readers: TypeObservationReader): void {
  for (const node of question.nodes) {
    for (const selector of [nodeTypeSelector(node), { ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" as const }] }]) {
      for (const property of readers.properties(selector, node)) {
        propertyLiterals(readers, property.selector, node, question.properties ?? []);
      }
    }
  }
}
/** Record immediate edges per encountered selector; expand each native Type once per nominated root. */
export function observeTypeConstituentRoots(
  selectors: readonly NativeTypeSelector[],
  readers: TypeObservationReader,
  names: readonly string[],
): readonly NativeTypeSelector[] {
  const encountered: NativeTypeSelector[] = [];
  for (const root of selectors) {
    const seen = new Set<object>();
    const pending = [root];
    for (const selector of pending) {
      const reference = readers.select(selector);
      if (reference === null) {
        continue;
      }
      const type = readers.type(reference);
      encountered.push(selector);
      const parts = [...readers.unions(selector), ...readers.intersections(selector)];
      for (const name of names) {
        readers.propertySymbol(selector, name);
      }
      if (!seen.has(type.key)) {
        seen.add(type.key);
        pending.push(...parts);
      }
    }
  }
  return encountered;
}
function observeTypeConstituents(question: TypeObservationQuestion, readers: TypeObservationReader): void {
  for (const node of question.nodes) {
    readers.symbol(node);
  }
  observeTypeConstituentRoots(
    question.nodes.map((node) => nodeTypeSelector(node)),
    readers,
    question.properties ?? [],
  );
}

function valueSlot(readers: TypeObservationReader, node: MorphNode, names: readonly string[]): void {
  const symbol = readers.symbol(node);
  if (symbol === null) {
    return;
  }
  const declaration = readers.valueDeclaration(symbol);
  if (declaration !== null) {
    nodeSlots(readers, declaration, names);
  }
}
function executableDeclaration(declaration: MorphNode): readonly MorphNode[] {
  if (Node.isVariableDeclaration(declaration)) {
    return declaration.getInitializer() === undefined ? [] : [declaration];
  }
  if (Node.isBindingElement(declaration)) {
    const owner = declaration.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    return owner === undefined ? [] : [owner];
  }
  return Node.isFunctionDeclaration(declaration) && declaration.getBody() !== undefined ? [declaration] : [];
}
function symbolBodies(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  const symbol = readers.symbol(node);
  return symbol === null
    ? []
    : [symbol, readers.symbolData(symbol).canonical].flatMap((target) => readers.symbolData(target).declarations.flatMap(executableDeclaration));
}
function sourceWriteIdentifiers(source: import("ts-morph").SourceFile): readonly MorphNode[] {
  const writes: MorphNode[] = source.getDescendantsOfKind(SyntaxKind.BinaryExpression).map((node) => node.getLeft());
  writes.push(...source.getDescendantsOfKind(SyntaxKind.ForOfStatement).map((node) => node.getInitializer()));
  writes.push(...source.getDescendantsOfKind(SyntaxKind.ForInStatement).map((node) => node.getInitializer()));
  return writes.flatMap((write) => [write, ...write.getDescendants()].filter(Node.isIdentifier));
}
function observeClosureNode(
  node: MorphNode,
  question: TypeObservationQuestion,
  readers: TypeObservationReader,
  profile?: TypeObservationCaptureOwner["profile"],
): readonly MorphNode[] {
  if (Node.isIdentifier(node)) {
    readers.definitions(node);
  }
  if (!(Node.isExpression(node) || Node.isVariableDeclaration(node) || Node.isParameterDeclaration(node))) {
    return [];
  }
  const bodies = symbolBodies(node, readers);
  valueProfile(question, node, profile);
  questions["type-details"]({ ...question, kind: "type-details", nodes: [node] }, readers);
  return bodies;
}
function walkSymbolClosure(roots: readonly MorphNode[], observe: (node: MorphNode) => readonly MorphNode[]): void {
  const seen = new Set<MorphNode>();
  const sources = new Set<MorphNode>();
  const pending = [...roots];
  for (const root of pending) {
    const source = root.getSourceFile();
    if (!sources.has(source)) {
      sources.add(source);
      pending.push(...sourceWriteIdentifiers(source));
    }
    for (const node of [root, ...root.getDescendants()]) {
      if (seen.has(node) || Node.isOmittedExpression(node)) {
        continue;
      }
      seen.add(node);
      pending.push(...observe(node));
    }
  }
}
function symbolClosure(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  walkSymbolClosure(question.nodes, (node) => observeClosureNode(node, question, readers, profile));
}
function graphPath(selector: NativeTypeSelector, path: readonly string[], at: MorphNode): NativeTypeSelector {
  return { ...selector, steps: [...selector.steps, ...path.map((name) => ({ kind: "property" as const, name, at }))] };
}
function graphFlags(selector: NativeTypeSelector, readers: TypeObservationReader): void {
  if (readers.select(selector) === null) {
    return;
  }
  for (const part of [selector, ...readers.unions(selector)]) {
    readers.primitiveFlags(part);
    readers.categoryFlags(part);
  }
}
function graphLeaves(selector: NativeTypeSelector, at: MorphNode, graph: SelectedPropertyGraph, readers: TypeObservationReader): void {
  for (const path of graph.leafPaths) {
    const leaf = graphPath(selector, path, at);
    if (readers.select(leaf) !== null) {
      graphFlags(leaf, readers);
      readers.literalValue(leaf);
    }
  }
}
function selectedPropertyGraph(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  const graph = question.selectedPropertyGraph;
  if (graph === undefined || graph.stopPath.length === 0) {
    throw new Error("native selected-property graph descriptor is missing or unbounded");
  }
  const roots = question.nodes.flatMap((node) => {
    if (graph.exportName === undefined) {
      return [node];
    }
    if (!Node.isSourceFile(node)) {
      throw new Error("native selected-property export root is not a source file");
    }
    return readers.exportDeclarations(node, graph.exportName) ?? [];
  });
  const values = new Set(roots);
  const active = new Set<object>();
  const children = (selector: NativeTypeSelector, at: MorphNode): void => {
    for (const property of readers.properties(selector, at)) {
      const declarations = readers.symbolData(property.symbol).declarations;
      const declaration = declarations.length === 1 ? declarations[0] : undefined;
      if (declaration !== undefined) {
        values.add(declaration);
        walk(graphPath(selector, [property.name], declaration), declaration);
      }
    }
  };
  const walk = (selector: NativeTypeSelector, at: MorphNode): void => {
    const selected = readers.select(selector);
    if (selected === null) {
      return;
    }
    graphFlags(selector, readers);
    const stop = graphPath(selector, graph.stopPath, at);
    if (readers.select(stop) !== null) {
      graphLeaves(selector, at, graph, readers);
      return;
    }
    const type = readers.type(selected);
    if (!readers.categoryFlags(selector).object || type.any || type.unknown || type.never || active.has(type.key)) {
      return;
    }
    active.add(type.key);
    children(selector, at);
    active.delete(type.key);
  };
  for (const root of roots) {
    walk(graphPath(nodeTypeSelector(root), graph.rootPath, root), root);
  }
  walkSymbolClosure([...values], (node) => graphValueNode(node, question, readers, profile));
}
function graphDataDeclaration(declaration: MorphNode): boolean {
  if (!Node.isVariableDeclaration(declaration)) {
    return false;
  }
  const initial = declaration.getInitializer();
  if (initial === undefined) {
    return false;
  }
  const value = unwrapTypeExpression(initial);
  return !(Node.isArrowFunction(value) || Node.isFunctionExpression(value) || Node.isClassExpression(value));
}
function graphValueNode(
  node: MorphNode,
  question: TypeObservationQuestion,
  readers: TypeObservationReader,
  profile: TypeObservationCaptureOwner["profile"],
): readonly MorphNode[] {
  if (!isValueNode(node)) {
    return [];
  }
  graphFlags(nodeTypeSelector(node), readers);
  valueProfile(question, node, profile);
  if (question.properties !== undefined && (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node))) {
    const receiver = { ...nodeTypeSelector(node.getExpression()), steps: [{ kind: "nonnullable" as const }] };
    if (readers.select(receiver) !== null) {
      for (const name of question.properties) {
        readers.propertySymbol(receiver, name);
      }
    }
  }
  return symbolBodies(node, readers).filter(graphDataDeclaration);
}
function callableBodyValues(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (question.files === undefined) {
    throw new Error("native callable-body values have no admitted source roster");
  }
  const admitted = new Set(question.files);
  if (question.nodes.some((node) => !admitted.has(node.getSourceFile().getFilePath().replaceAll("\\", "/")))) {
    throw new Error("native callable-body root is outside its admitted roster");
  }
  const bodies = question.nodes.flatMap((node) => {
    const body = readers.callableBody(node);
    return body !== null && admitted.has(body.getSourceFile().getFilePath().replaceAll("\\", "/")) ? [body] : [];
  });
  // Only nominated callable bodies open executable syntax; reached data bindings never open callees.
  walkSymbolClosure(bodies, (node) => graphValueNode(node, question, readers, profile));
}
function rawPropertyLiterals(readers: TypeObservationReader, selector: NativeTypeSelector, at: MorphNode, names: readonly string[]): void {
  for (const name of names) {
    const property = { ...selector, steps: [...selector.steps, { kind: "property" as const, name, at }] };
    if (readers.select(property) !== null) {
      readers.literalValue(property);
      for (const part of readers.unions(property)) {
        readers.literalValue(part);
      }
    }
  }
}
function canonicalDeclarations(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  const symbol = readers.symbol(node);
  return symbol === null ? [] : readers.symbolData(readers.symbolData(symbol).canonical).declarations;
}
function directTypeUses(node: MorphNode): readonly MorphNode[] {
  if (Node.isParenthesizedTypeNode(node)) {
    return directTypeUses(node.getTypeNode());
  }
  if (Node.isUnionTypeNode(node) || Node.isIntersectionTypeNode(node)) {
    return node.getTypeNodes().flatMap(directTypeUses);
  }
  return Node.isTypeReference(node) || Node.isExpressionWithTypeArguments(node) ? [node] : [];
}
function literalGraph(node: MorphNode, readers: TypeObservationReader): void {
  const pending = [nodeTypeSelector(node)];
  const seen = new Set<object>();
  for (const selector of pending) {
    const selected = readers.select(selector);
    if (selected === null) {
      continue;
    }
    const type = readers.type(selected);
    if (seen.has(type.key)) {
      continue;
    }
    seen.add(type.key);
    readers.primitiveFlags(selector);
    pending.push(...readers.unions(selector), ...readers.intersections(selector));
    const constraint = readers.constraint(selector);
    if (constraint !== null) {
      pending.push(constraint);
    }
  }
}
function reactDeclaration(node: MorphNode): boolean {
  return node.getSourceFile().getFilePath().replaceAll("\\", "/").includes("/node_modules/@types/react/");
}
function genericConstraints(node: MorphNode, defaults: boolean): readonly MorphNode[] {
  if (!(Node.isTypeAliasDeclaration(node) || Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node))) {
    return [];
  }
  return node
    .getTypeParameters()
    .flatMap((parameter) => [parameter.getConstraint(), ...(defaults ? [parameter.getDefault()] : [])].filter((value) => value !== undefined));
}
function intrinsicBodies(node: MorphNode): readonly MorphNode[] {
  return [...(Node.isTypeAliasDeclaration(node) ? [node.getTypeNodeOrThrow()] : []), ...genericConstraints(node, true)];
}
function intrinsicReferences(body: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  const referenced = Node.isTypeReference(body) ? [...canonicalDeclarations(body.getTypeName(), readers)] : [];
  const direct = body.forEachDescendant((node) => {
    if (Node.isIdentifier(node) && node.getText() === "IntrinsicElements") {
      const declarations = canonicalDeclarations(node, readers);
      if (declarations.length > 0 && declarations.every(reactDeclaration)) {
        return true;
      }
    }
    if (Node.isTypeReference(node)) {
      referenced.push(...canonicalDeclarations(node.getTypeName(), readers));
    }
    return false;
  });
  return direct === true ? [] : referenced;
}
function captureIntrinsicClosure(roots: readonly MorphNode[], readers: TypeObservationReader): void {
  const seen = new Set<MorphNode>();
  const pending = [...roots];
  for (const body of pending) {
    for (const declaration of intrinsicReferences(body, readers)) {
      if (!reactDeclaration(declaration) || seen.has(declaration)) {
        continue;
      }
      seen.add(declaration);
      pending.push(...intrinsicBodies(declaration));
    }
  }
}
function declarationTypeParents(node: MorphNode): readonly MorphNode[] {
  if (Node.isTypeAliasDeclaration(node)) {
    return directTypeUses(node.getTypeNodeOrThrow());
  }
  return Node.isInterfaceDeclaration(node) || Node.isClassDeclaration(node) ? node.getHeritageClauses().flatMap((clause) => clause.getTypeNodes()) : [];
}
function aliasInitializers(declarations: readonly MorphNode[]): readonly MorphNode[] {
  return declarations.flatMap((declaration) => {
    if (!(Node.isVariableDeclaration(declaration) || Node.isPropertyAssignment(declaration)) || declaration.getSourceFile().isDeclarationFile()) {
      return [];
    }
    const initial = declaration.getInitializer();
    if (initial === undefined) {
      return [];
    }
    const value = referenceResolutionServices.unwrapExpression(initial);
    return Node.isIdentifier(value) || Node.isPropertyAccessExpression(value) || Node.isElementAccessExpression(value) || Node.isObjectLiteralExpression(value)
      ? [value]
      : [];
  });
}
function browserTypeReference(node: MorphNode): MorphNode {
  if (Node.isTypeReference(node)) {
    return node.getTypeName();
  }
  return Node.isExpressionWithTypeArguments(node) ? node.getExpression() : node;
}
function browserContracts(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  const visited = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const node of pending) {
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);
    const root = rootIdentifier(node);
    if (root !== undefined && root !== node) {
      pending.push(root);
    }
    const reference = browserTypeReference(node);
    const declarations = canonicalDeclarations(reference, readers);
    if (Node.isTypeReference(node) || Node.isExpressionWithTypeArguments(node)) {
      for (const argument of node.getTypeArguments()) {
        literalGraph(argument, readers);
        pending.push(...directTypeUses(argument));
      }
      pending.push(...declarations.flatMap(declarationTypeParents));
      captureIntrinsicClosure(
        declarations.filter(reactDeclaration).flatMap((declaration) => genericConstraints(declaration, false)),
        readers,
      );
    } else if (isValueNode(node)) {
      readers.signatureDeclarations(nodeTypeSelector(node), "call");
      readers.signatureDeclarations(nodeTypeSelector(node), "construct");
    }
    valueProfile(question, reference, profile);
    pending.push(...aliasInitializers(declarations));
  }
}
function ctVariableInitializers(node: MorphNode, readers: TypeObservationReader): readonly MorphNode[] {
  const symbol = readers.symbol(node);
  if (symbol === null) {
    return [];
  }
  const declarations = [symbol, readers.symbolData(symbol).canonical].flatMap((value) => readers.symbolData(value).declarations);
  const shorthand = Node.isIdentifier(node) && Node.isShorthandPropertyAssignment(node.getParent()) ? readers.definitions(node) : [];
  return [...declarations, ...shorthand].filter(
    (declaration) => Node.isVariableDeclaration(declaration) && declaration.getInitializer() !== undefined && !declaration.getSourceFile().isDeclarationFile(),
  );
}
function ctMounting(question: TypeObservationQuestion, readers: TypeObservationReader, profile?: TypeObservationCaptureOwner["profile"]): void {
  if (profile === undefined) {
    throw new Error("native CT mounting values have no captured owner");
  }
  const seen = new Set<MorphNode>();
  const pending = [...question.nodes];
  for (const root of pending) {
    for (const node of [root, ...root.getDescendants()]) {
      if (seen.has(node) || Node.isOmittedExpression(node)) {
        continue;
      }
      seen.add(node);
      if (!isValueNode(node)) {
        continue;
      }
      const facets = (question.valueFacets ?? []).filter((facet) => facet !== "reference-writes" || Node.isIdentifier(node));
      profile(node, facets);
      pending.push(...ctVariableInitializers(node, readers));
    }
  }
}
function contributionSelector(node: MorphNode, readers: TypeObservationReader): NativeTypeSelector | undefined {
  const selector = readers.typeArguments(nodeTypeSelector(node)).at(-1);
  if (selector === undefined) {
    return;
  }
  const selected = readers.select(selector);
  if (selected === null || readers.type(selected).any) {
    return;
  }
  readers.defaultDisplay(selector);
  return selector;
}
function declaredContribution(node: MorphNode, question: TypeObservationQuestion, owner: Pick<TypeObservationCaptureOwner, "module">): boolean {
  if (!Node.isCallExpression(node) || owner.module === undefined) {
    throw new Error("native contribution module context is unavailable");
  }
  const origin = owner.module(node.getExpression());
  if (origin.kind !== "resolved" || origin.value.canonical.kind !== "project") {
    return false;
  }
  const declaration = origin.value.canonical.declaration;
  return (
    Node.isFunctionDeclaration(declaration) &&
    (question.callableHomes ?? []).some(
      (home) => declaration.getName() === home.name && declaration.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(home.suffix),
    )
  );
}
function contributionCandidates(
  nodes: readonly MorphNode[],
  question: TypeObservationQuestion,
  readers: TypeObservationReader,
  owner: Pick<TypeObservationCaptureOwner, "module" | "profile">,
): readonly NativeTypeSelector[] {
  if (owner.profile === undefined) {
    throw new Error("native contribution profile owner is unavailable");
  }
  const result: NativeTypeSelector[] = [];
  for (const node of nodes) {
    if (!Node.isCallExpression(node)) {
      throw new Error("native contribution question is not a call");
    }
    owner.profile(node.getExpression(), ["module"]);
    if (!declaredContribution(node, question, owner)) {
      continue;
    }
    const selector = contributionSelector(node, readers);
    if (selector !== undefined) {
      result.push(selector);
    }
  }
  return result;
}
function ctContributions(
  question: TypeObservationQuestion,
  readers: TypeObservationReader,
  profile?: TypeObservationCaptureOwner["profile"],
  owner?: Pick<TypeObservationCaptureOwner, "references" | "module" | "node">,
): void {
  if (owner === undefined) {
    throw new Error("native contribution context is unavailable");
  }
  const candidates = contributionCandidates(question.nodes, question, readers, { ...owner, profile });
  if (candidates.length === 0) {
    return;
  }
  if (question.relationTargets === undefined || owner.node === undefined) {
    throw new Error("native contribution relation targets are unavailable");
  }
  const targets = contributionCandidates(question.relationTargets.map(owner.node), question, readers, { ...owner, profile });
  for (const candidate of candidates) {
    for (const target of targets) {
      readers.relation(candidate, target);
    }
  }
}
const questions: Record<
  TypeObservationQuestion["kind"],
  (
    question: TypeObservationQuestion,
    readers: TypeObservationReader,
    profile?: TypeObservationCaptureOwner["profile"],
    owner?: Pick<TypeObservationCaptureOwner, "references" | "module" | "node">,
  ) => void
> = {
  "const-initializers": constInitializers,
  "callable-body-values": callableBodyValues,
  "selected-property-graph": selectedPropertyGraph,
  "browser-contracts": browserContracts,
  "mount-signatures": (question, readers): void => {
    for (const node of question.nodes) {
      readers.signatureDeclarations({ ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" }] }, "call");
    }
  },
  "ct-mounting": ctMounting,
  "ct-contributions": ctContributions,
  "drizzle-predicate-inputs": drizzlePredicateInputs,
  "declaration-closure": declarationClosure,
  "literal-values": (question, readers): void => {
    for (const node of question.nodes) {
      const selector = nodeTypeSelector(node);
      if (readers.select(selector) === null) {
        continue;
      }
      for (const part of [selector, ...readers.unions(selector)]) {
        readers.literalValue(part);
        if (readers.primitiveFlags(part).booleanLiteral) {
          readers.defaultDisplay(part);
        }
      }
    }
  },
  "primitive-flags": (question, readers): void => {
    for (const node of question.nodes) {
      primitiveFlags(readers, nodeTypeSelector(node));
    }
  },
  "property-symbols": (question, readers): void => {
    for (const node of question.nodes) {
      const selector = nodeTypeSelector(node);
      if (readers.select(selector) === null) {
        continue;
      }
      for (const part of [selector, ...readers.unions(selector)]) {
        readers.primitiveFlags(part);
        for (const name of question.properties ?? []) {
          readers.propertySymbol(part, name);
        }
      }
    }
  },
  "reference-closure": (question, readers, _profile, owner): void => {
    const references = owner?.references;
    if (references === undefined) {
      throw new Error("native raw reference closure has no strict reference owner");
    }
    for (const node of question.nodes) {
      symbolClosure({ ...question, nodes: [node, ...references(node)] }, readers);
    }
  },
  "symbol-closure": symbolClosure,
  "type-details": (question, readers): void => {
    const details = (selector: NativeTypeSelector, at: MorphNode): void => {
      if (readers.select(selector) === null) {
        return;
      }
      readers.defaultDisplay(selector);
      readers.literalValue(selector);
      for (const argument of readers.typeArguments(selector)) {
        const selected = readers.select(argument);
        if (selected !== null) {
          readers.type(selected);
        }
      }
      rawPropertyLiterals(readers, selector, at, question.properties ?? []);
    };
    for (const node of question.nodes) {
      readers.symbol(node);
      const selector = nodeTypeSelector(node);
      details(selector, node);
      for (const part of readers.unions(selector)) {
        details(part, node);
      }
    }
  },
  "function-exports": (question, readers): void => {
    for (const node of question.nodes) {
      readers.functionExport(node);
    }
  },
  "node-types": (question, readers): void => {
    for (const node of question.nodes) {
      nodeSlots(readers, node, question.properties ?? []);
    }
  },
  "type-properties": properties,
  "type-constituents": observeTypeConstituents,
  "definition-nodes": (question, readers): void => {
    for (const node of question.nodes) {
      readers.definitions(node);
    }
  },
  "definition-closure": definitionClosure,
  "call-parameters": (question, readers): void => {
    for (const node of question.nodes) {
      for (const selector of readers.callParameters(node) ?? []) {
        typeSlots(readers, selector, node, question.properties ?? []);
      }
    }
  },
  "signature-parameters": (question, readers): void => {
    for (const node of question.nodes) {
      for (const parameters of readers.signatureParameters({ ...nodeTypeSelector(node), steps: [{ kind: "nonnullable" }] }, node)) {
        for (const selector of parameters) {
          typeSlots(readers, selector, node, question.properties ?? []);
        }
      }
    }
  },
  "symbol-values": (question, readers): void => {
    for (const node of question.nodes) {
      valueSlot(readers, node, question.properties ?? []);
    }
  },
  "value-profiles": (question, _readers, profile): void => {
    for (const node of question.nodes) {
      valueProfile(question, node, profile);
    }
  },
};
/** Capture and replay execute the same closed primitive questions. */
export function observeRawQuestions(
  demand: TypeObservationDemand,
  readers: TypeObservationReader,
  profile?: TypeObservationCaptureOwner["profile"],
  owner?: Pick<TypeObservationCaptureOwner, "references" | "module" | "node">,
): void {
  for (const question of demand.questions ?? []) {
    questions[question.kind](question, readers, profile, owner);
  }
}
