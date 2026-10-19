// Placement follows compiler-checked public declarations, never instantiated structural type graphs.
// A walk stays inside its root's tier: every other linted server file judges its own imports, so a declaration
// outside that tier (lib, node_modules, packages, another tier, an augmentation) stops it, except from an unlinted file.
import { matchesGlob, relative } from "node:path";
import ts from "typescript";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { DeclarationMeaning, GenericFormal } from "./server-public-boundary-grammar.ts";
import {
  aliasTarget,
  annotationChildren,
  closedExpression,
  constituents,
  declarationHasMeaning,
  defaultNeedsBinding,
  formalContribution,
  genericDeclaration,
  genericFormals,
  inferredOperands,
  isPublicSignature,
  namedDeclaration,
  primitiveLiteral,
  publicAnnotationDeclaration,
  publicClassMember,
  publicParameterProperty,
  reflectedOperands,
  returnedExpressions,
  shapeDeclaration,
  terminalDeclaration,
  typeApplication,
  typeOnlyReference,
  valueDeclaration,
  vocabularyChildren,
} from "./server-public-boundary-grammar.ts";
import { WIRE_SHAPE_SUFFIXES } from "./shape-declaration.ts";
import { nativeFactoryTypeHomePopulation, packageTypeHome, serverTypeTier, TYPE_HOME_NATIVE_CONTRACT_GLOBS, unjudgedServerFile } from "./type-home.ts";
import { readParserTransparentAliasOrigin } from "./type-member-origin.ts";
import type { NativeParserTypeContext } from "./type-member-origin-contract.ts";

// Erasable syntax admits no authored namespace, so any module declaration around a server node is an ambient augmentation.
function isAugmentationMember(node: ts.Node): boolean {
  for (let parent: ts.Node | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isModuleDeclaration(parent)) {
      return true;
    }
  }
  return false;
}

// A generic declared outside the shape's tier is never walked, so each of its actuals counts as a direct use.
function signatureOwns(declaration: ts.Declaration, checker: ts.TypeChecker, foreign: (node: ts.Node) => boolean): boolean {
  let owned = false;
  const reference = (node: ts.Node): void => {
    if (!ts.isTypeReferenceNode(node)) {
      ts.forEachChild(node, reference);
      return;
    }
    const symbol = checker.getSymbolAtLocation(node.typeName);
    const declarations = symbol === undefined ? [] : (aliasTarget(symbol, checker).declarations ?? []);
    if (declarations.includes(declaration)) {
      owned = true;
    }
    const local = declarations.filter((candidate) => !foreign(candidate));
    for (const [index, argument] of (node.typeArguments ?? []).entries()) {
      if (local.length === 0 || genericFormals(local, index).some(({ owner, parameter }) => formalContribution(parameter, owner, checker) === "direct")) {
        reference(argument);
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (isPublicSignature(node)) {
      for (const annotation of annotationChildren(node)) {
        reference(annotation);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(declaration.getSourceFile());
  return owned;
}

interface BoundaryWalk {
  readonly start: (tier: string | undefined) => void;
  readonly visitRoot: (node: ts.Node) => void;
  readonly visitAugmentation: (augmentation: ts.ModuleDeclaration) => void;
  readonly refuse: (detail: string) => void;
  readonly fact: (origin: ts.Node) => ReferenceFact<readonly ts.Declaration[], ts.Node>;
}

function boundaryWalk(parser: NativeParserTypeContext, root: string, consumer: string): BoundaryWalk {
  const { program, checker } = parser;
  const findings = new Set<ts.Declaration>();
  const visited = { type: new Set<ts.Declaration>(), value: new Set<ts.Declaration>() };
  const opaqueVisited = { type: new Set<ts.Declaration>(), value: new Set<ts.Declaration>() };
  let opaque = false;
  let tier: string | undefined;
  const refusals = new Set<string>();
  const path = (declaration: ts.Node): string => relative(root, declaration.getSourceFile().fileName).replaceAll("\\", "/");
  const site = (node: ts.Node): string => `${path(node)}:${node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const contains = (candidate: ts.Node): boolean => program.getSourceFile(candidate.getSourceFile().fileName) === candidate.getSourceFile();
  // Inside an unjudged file every server declaration is walked, because no lint run judges that file's own imports.
  let passThrough = false;
  const foreign = (declaration: ts.Node): boolean => {
    const owner = serverTypeTier(path(declaration));
    return isAugmentationMember(declaration) || (passThrough ? owner === undefined : owner !== tier);
  };
  const external = (declaration: ts.Node): boolean => {
    const source = declaration.getSourceFile();
    const owned = path(declaration);
    return (
      program.isSourceFileDefaultLibrary(source) ||
      (source.isDeclarationFile &&
        program.isSourceFileFromExternalLibrary(source) &&
        !owned.startsWith("packages/") &&
        !owned.startsWith("tests/") &&
        !owned.startsWith("tooling/"))
    );
  };
  const home = (declaration: ts.Node): boolean => {
    const owned = path(declaration);
    if (TYPE_HOME_NATIVE_CONTRACT_GLOBS.some((pattern) => matchesGlob(owned, pattern))) {
      return true;
    }
    const classified = packageTypeHome(owned);
    return (
      classified?.world !== undefined &&
      (classified.home === true || classified.category === "primitive" || classified.category === "wire" || classified.category === "db-row")
    );
  };
  const children = (parent: ts.Node): readonly ts.Node[] => (opaque ? vocabularyChildren(parent) : annotationChildren(parent));
  const symbolDeclarations = (at: ts.Node, meaning: DeclarationMeaning = "type"): readonly ts.Declaration[] => {
    const symbol = checker.getSymbolAtLocation(at);
    return symbol === undefined ? [] : (aliasTarget(symbol, checker).declarations ?? []).filter((declaration) => declarationHasMeaning(declaration, meaning));
  };
  const transparent = (declaration: ts.TypeAliasDeclaration): boolean => {
    const fact = readParserTransparentAliasOrigin(declaration, { ...parser, source: declaration.getSourceFile() });
    const targets = fact.kind === "resolved" ? (fact.value.at(-1)?.declarations ?? []) : [];
    return targets.length > 0 && targets.every((target) => home(target) || external(target));
  };
  const declaredVocabularyOwner = (declaration: ts.Declaration, meaning: DeclarationMeaning): boolean => {
    if (external(declaration) || home(declaration)) {
      return true;
    }
    const name = namedDeclaration(declaration) ? declaration.name : undefined;
    return name !== undefined && symbolDeclarations(name, meaning).some(external);
  };
  const formalVocabularyOwner = (parameter: ts.TypeParameterDeclaration, meaning: DeclarationMeaning): boolean => {
    const owner = parameter.parent;
    if (!(genericDeclaration(owner) || isPublicSignature(owner)) || owner.typeParameters?.includes(parameter) !== true || !contains(owner)) {
      return false;
    }
    return (
      visited.type.has(owner) ||
      visited.value.has(owner) ||
      opaqueVisited.type.has(owner) ||
      opaqueVisited.value.has(owner) ||
      declaredVocabularyOwner(owner, meaning)
    );
  };
  const closedVocabularyOwner = (declaration: ts.Declaration, meaning: DeclarationMeaning): boolean =>
    ts.isTypeParameterDeclaration(declaration) ? formalVocabularyOwner(declaration, meaning) : declaredVocabularyOwner(declaration, meaning);
  const accuse = (declaration: ts.Declaration): void => {
    if (!(ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) || isAugmentationMember(declaration)) {
      return;
    }
    if (
      !nativeFactoryTypeHomePopulation(path(declaration)) ||
      serverTypeTier(path(declaration)) === serverTypeTier(consumer) ||
      (ts.isTypeAliasDeclaration(declaration) && transparent(declaration))
    ) {
      return;
    }
    if (WIRE_SHAPE_SUFFIXES.some((suffix) => declaration.name.text.endsWith(suffix))) {
      refusals.add("a wire-named declaration requires its independent wire-data owner, not a factory boundary grant");
    } else {
      findings.add(declaration);
    }
  };
  const visitSymbol = (at: ts.Node, signature: boolean, meaning: DeclarationMeaning = "type"): void => {
    const declarations = symbolDeclarations(at, meaning);
    if (declarations.length === 0) {
      refusals.add(`the native public reference ${at.getText()} at ${site(at)} has no declaration`);
    }
    for (const declaration of declarations) {
      visitDeclaration(declaration, signature, meaning);
    }
  };
  // A generic declared outside the tier keeps its formals out of reach; every authored actual counts as exposed.
  const visitApplication = (
    reference: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments | ts.ImportTypeNode,
    declarations: readonly ts.Declaration[],
    signature: boolean,
  ): void => {
    const local = declarations.filter((declaration) => !foreign(declaration));
    if (local.length > 0) {
      visitArguments(reference, local, signature);
    } else {
      for (const argument of reference.typeArguments ?? []) {
        visitAnnotation(argument, signature);
      }
    }
    for (const declaration of declarations) {
      visitDeclaration(declaration, signature);
    }
  };
  const visitReference = (reference: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments, signature: boolean): void => {
    const name = ts.isTypeReferenceNode(reference) ? reference.typeName : reference.expression;
    const declarations = symbolDeclarations(name);
    if (declarations.length === 0) {
      refusals.add("the native public type reference has no declaration");
      return;
    }
    // Actual arguments precede declaration dedup: Box<A> and Box<B> are different ownership edges.
    visitApplication(reference, declarations, signature);
  };
  const visitOpaqueActual = (argument: ts.TypeNode): void => {
    const previous = opaque;
    opaque = true;
    try {
      visitAnnotation(argument, false);
    } finally {
      opaque = previous;
    }
  };
  const visitArgument = (argument: ts.TypeNode, formals: readonly GenericFormal[], signature: boolean, selectedDefault: boolean): void => {
    if (opaque) {
      visitAnnotation(argument, false);
      return;
    }
    const contributions = formals.map((formal) => formalContribution(formal.parameter, formal.owner, checker));
    if (contributions.some((contribution) => contribution !== "unused") && selectedDefault && defaultNeedsBinding(argument, checker)) {
      refusals.add("a selected generic default requires unsupported formal substitution");
    } else if (contributions.includes("direct")) {
      visitAnnotation(argument, signature);
    } else if (contributions.includes("unsupported")) {
      visitOpaqueActual(argument);
    }
  };
  const visitDefaults = (formals: readonly GenericFormal[], signature: boolean): void => {
    const defaults = new Set(formals.flatMap(({ parameter }) => (parameter.default === undefined ? [] : [parameter.default])));
    if (defaults.size === 0) {
      refusals.add("an omitted generic actual has no native default declaration");
    }
    for (const argument of defaults) {
      visitArgument(argument, formals, signature, true);
    }
  };
  const visitArguments = (
    reference: ts.TypeReferenceNode | ts.ExpressionWithTypeArguments | ts.ImportTypeNode,
    declarations: readonly ts.Declaration[],
    signature: boolean,
  ): void => {
    const supplied = reference.typeArguments ?? [];
    const count = Math.max(
      supplied.length,
      ...declarations.map((declaration) => (genericDeclaration(declaration) ? (declaration.typeParameters?.length ?? 0) : 0)),
    );
    for (let index = 0; index < count; index++) {
      const formals = genericFormals(declarations, index);
      if (formals.length === 0) {
        refusals.add("a generic application has no native formal declaration");
      }
      const actual = supplied[index];
      if (actual !== undefined) {
        visitArgument(actual, formals, signature, false);
        continue;
      }
      visitDefaults(formals, signature);
    }
  };
  const visitImportType = (annotation: ts.ImportTypeNode, signature: boolean): void => {
    if (annotation.qualifier === undefined || annotation.isTypeOf) {
      refusals.add("an unqualified or value-query import type has no explicit public declaration boundary");
      return;
    }
    const declarations = symbolDeclarations(annotation.qualifier);
    if (declarations.length === 0) {
      refusals.add("the native import-type reference has no declaration");
    }
    visitApplication(annotation, declarations, signature);
  };
  const visitComputedName = (annotation: ts.Node): void => {
    if (!opaque) {
      return;
    }
    if (!((valueDeclaration(annotation) || isPublicSignature(annotation)) && "name" in annotation)) {
      return;
    }
    const name = annotation.name;
    if (!ts.isComputedPropertyName(name) || primitiveLiteral(name.expression)) {
      return;
    }
    if (ts.isIdentifier(name.expression) || ts.isPropertyAccessExpression(name.expression)) {
      visitSymbol(name.expression, false, "value");
    } else {
      refusals.add("a computed public member name has no qualified native value declaration edge");
    }
  };
  // `typeof x` reaches x's value declaration; reflected operands are all walked, which can only add findings.
  const visitReflected = (annotation: ts.Node, signature: boolean): boolean => {
    if (ts.isTypeQueryNode(annotation) && ts.isIdentifier(annotation.exprName) && narrowed(annotation.exprName)) {
      refusals.add(`a narrowed reference at ${site(annotation)} carries a flow type its declaration does not name`);
    } else if (ts.isTypeQueryNode(annotation)) {
      visitSymbol(annotation.exprName, signature, "value");
    }
    const operands = ts.isTypeQueryNode(annotation) ? (annotation.typeArguments ?? []) : reflectedOperands(annotation);
    for (const operand of operands ?? []) {
      visitAnnotation(operand, signature);
    }
    return operands !== undefined;
  };
  const visitAnnotation = (annotation: ts.Node, signature: boolean): void => {
    visitComputedName(annotation);
    if (visitReflected(annotation, signature)) {
      return;
    }
    if (typeApplication(annotation)) {
      visitReference(annotation, signature);
      return;
    }
    if (ts.isImportTypeNode(annotation)) {
      visitImportType(annotation, signature);
      return;
    }
    if (publicAnnotationDeclaration(annotation)) {
      visitDeclaration(annotation, signature, "type", true);
      return;
    }
    for (const child of children(annotation)) {
      visitAnnotation(child, signature);
    }
  };
  // An omitted annotation is inferred from syntax the walk can still read: the returned or initializing
  // expressions, whose callees, operands and arguments carry every declaration the inferred type can name.
  // A type predicate, assertion function or conditional test can narrow a reference to a type its declaration never
  // names. Dropping null, undefined or union members, or refining to a literal, adds no declaration; anything else refuses.
  const narrowedTo = (reference: ts.Node, symbol: ts.Symbol | undefined): boolean => {
    if (symbol === undefined) {
      return false;
    }
    const declared = new Set(constituents(checker.getNonNullableType(checker.getTypeOfSymbol(aliasTarget(symbol, checker)))));
    return constituents(checker.getNonNullableType(checker.getTypeAtLocation(reference))).some((part) => !declared.has(part) && part.getSymbol() !== undefined);
  };
  const narrowed = (expression: ts.Expression): boolean => {
    let name: ts.Node | undefined;
    if (ts.isIdentifier(expression)) {
      name = expression;
    } else if (ts.isPropertyAccessExpression(expression)) {
      name = expression.name;
    } else if (ts.isElementAccessExpression(expression)) {
      name = expression.argumentExpression;
    }
    return name !== undefined && narrowedTo(expression, checker.getSymbolAtLocation(name));
  };
  const visitInferred = (expression: ts.Expression): void => {
    if (narrowed(expression)) {
      refusals.add(`a narrowed reference at ${site(expression)} carries a flow type its declaration does not name`);
      return;
    }
    if (closedExpression(expression)) {
      return;
    }
    const operands = inferredOperands(expression);
    if (operands === undefined) {
      refusals.add(`an inferred ${ts.SyntaxKind[expression.kind]} at ${site(expression)} has no qualified public boundary`);
      return;
    }
    for (const operand of operands) {
      visitOperand(operand);
    }
  };
  const visitOperand = (operand: ts.Node): void => {
    if (ts.isTypeNode(operand)) {
      visitAnnotation(operand, true);
    } else if (isPublicSignature(operand)) {
      visitDeclaration(operand, true, "value", true);
    } else if (ts.isIdentifier(operand)) {
      visitInferredReference(operand);
    } else if (ts.isShorthandPropertyAssignment(operand)) {
      visitShorthand(operand);
    } else if (ts.isExpression(operand)) {
      visitInferred(operand);
    } else {
      refusals.add(`an inferred ${ts.SyntaxKind[operand.kind]} at ${site(operand)} has no qualified public boundary`);
    }
  };
  const visitShorthand = (property: ts.ShorthandPropertyAssignment): void => {
    const value = checker.getShorthandAssignmentValueSymbol(property);
    if (narrowedTo(property.name, value)) {
      refusals.add(`a narrowed reference at ${site(property)} carries a flow type its declaration does not name`);
      return;
    }
    for (const declaration of value?.declarations ?? []) {
      visitDeclaration(declaration, true, "value");
    }
  };
  // A compiler intrinsic such as `undefined` binds a symbol with no declaration and names no authored type.
  const visitInferredReference = (identifier: ts.Identifier): void => {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (narrowed(identifier)) {
      refusals.add(`a narrowed reference at ${site(identifier)} carries a flow type its declaration does not name`);
    } else if (symbol === undefined) {
      refusals.add(`the inferred reference ${identifier.text} at ${site(identifier)} has no symbol`);
    } else if ((aliasTarget(symbol, checker).declarations ?? []).length > 0) {
      visitSymbol(identifier, true, "value");
    }
  };
  const visitReturns = (declaration: ts.SignatureDeclaration): void => {
    const body = "body" in declaration ? declaration.body : undefined;
    if (body === undefined) {
      refusals.add(`an authored callable public boundary at ${site(declaration)} has neither a result annotation nor a body`);
    } else if (ts.isBlock(body)) {
      for (const returned of returnedExpressions(body)) {
        visitInferred(returned);
      }
    } else if (ts.isExpression(body)) {
      visitInferred(body);
    }
  };
  // A parameter without an annotation or a default is contextually typed by its callee, which the walk visits.
  const visitParameter = (parameter: ts.ParameterDeclaration): void => {
    if (parameter.type !== undefined) {
      visitAnnotation(parameter.type, true);
    } else if (parameter.initializer !== undefined) {
      visitInferred(parameter.initializer);
    }
  };
  const visitCallable = (declaration: ts.SignatureDeclaration): void => {
    for (const annotation of children(declaration)) {
      visitAnnotation(annotation, true);
    }
    for (const parameter of declaration.parameters) {
      if (parameter.type === undefined && parameter.initializer !== undefined) {
        visitInferred(parameter.initializer);
      }
    }
    if (declaration.type === undefined && !ts.isConstructorDeclaration(declaration) && !ts.isSetAccessorDeclaration(declaration)) {
      visitReturns(declaration);
    }
  };
  const visitValue = (declaration: ts.VariableDeclaration | ts.PropertyDeclaration | ts.PropertySignature): void => {
    if (declaration.type !== undefined) {
      visitAnnotation(declaration.type, true);
      return;
    }
    const value = ts.isPropertySignature(declaration) ? undefined : declaration.initializer;
    if (value === undefined) {
      refusals.add(`an authored value or member public boundary at ${site(declaration)} is missing an explicit annotation`);
    } else {
      visitInferred(value);
    }
  };
  // A destructured binding takes its type from the declaration or parameter that holds the whole pattern.
  const visitBinding = (binding: ts.BindingElement): void => {
    if (binding.initializer !== undefined) {
      visitInferred(binding.initializer);
    }
    let holder: ts.Node = binding.parent;
    while (ts.isBindingElement(holder) || ts.isObjectBindingPattern(holder) || ts.isArrayBindingPattern(holder)) {
      holder = holder.parent;
    }
    if (ts.isVariableDeclaration(holder) || ts.isParameter(holder)) {
      visitDeclaration(holder, true, "value", true);
    } else {
      refusals.add(`a destructured binding at ${site(binding)} has no qualified holder`);
    }
  };
  // A namespace import used as a value exposes every export of its module.
  const visitModule = (source: ts.SourceFile): void => {
    const module = checker.getSymbolAtLocation(source);
    for (const exported of module === undefined ? [] : checker.getExportsOfModule(module)) {
      for (const declaration of aliasTarget(exported, checker).declarations ?? []) {
        visitDeclaration(declaration, true, declarationHasMeaning(declaration, "value") ? "value" : "type");
      }
    }
  };
  const visitComposite = (declaration: ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration, meaning: DeclarationMeaning): void => {
    for (const annotation of children(declaration)) {
      if (meaning === "type" && ts.isConstructorDeclaration(annotation) && annotation.parameters.some(publicParameterProperty)) {
        refusals.add("an instance parameter-property boundary requires a qualified explicit public member declaration");
      }
      if (ts.isClassDeclaration(declaration) && !publicClassMember(annotation, meaning)) {
        continue;
      }
      visitAnnotation(annotation, true);
    }
  };
  // Declarations that hold a value's type: a variable or member, a parameter, a destructuring holder or a namespace module.
  const visitValueHolder = (declaration: ts.Declaration): boolean => {
    if (valueDeclaration(declaration)) {
      visitValue(declaration);
    } else if (ts.isParameter(declaration)) {
      visitParameter(declaration);
    } else if (ts.isBindingElement(declaration)) {
      visitBinding(declaration);
    } else if (ts.isSourceFile(declaration)) {
      visitModule(declaration);
    } else {
      return false;
    }
    return true;
  };
  const visitDeclarationBody = (declaration: ts.Declaration, meaning: DeclarationMeaning): void => {
    if (isPublicSignature(declaration)) {
      visitCallable(declaration);
      return;
    }
    if (genericDeclaration(declaration)) {
      visitComposite(declaration, meaning);
      return;
    }
    if (visitValueHolder(declaration)) {
      return;
    }
    if (opaque && ts.isTypeParameterDeclaration(declaration)) {
      for (const child of children(declaration)) {
        visitAnnotation(child, false);
      }
      return;
    }
    if (!terminalDeclaration(declaration)) {
      refusals.add("the native declaration kind has no qualified public boundary");
    }
  };
  const visitDeclaration = (declaration: ts.Declaration, signature: boolean, meaning: DeclarationMeaning = "type", inherited = false): void => {
    if (!inherited && foreign(declaration)) {
      return;
    }
    if (!contains(declaration)) {
      refusals.add("a public declaration belongs to a foreign or stale native source");
      return;
    }
    if (opaque && !inherited && !closedVocabularyOwner(declaration, meaning)) {
      refusals.add(`an indirect generic actual reaches an unsanctioned or unknown authored declaration at ${site(declaration)}`);
      return;
    }
    if (signature && !opaque) {
      accuse(declaration);
    }
    const seen = opaque ? opaqueVisited[meaning] : visited[meaning];
    if (seen.has(declaration)) {
      return;
    }
    seen.add(declaration);
    visitOwnedBody(declaration, meaning);
  };
  const visitOwnedBody = (declaration: ts.Declaration, meaning: DeclarationMeaning): void => {
    const previous = passThrough;
    passThrough ||= unjudgedServerFile(path(declaration));
    try {
      visitDeclarationBody(declaration, meaning);
    } finally {
      passThrough = previous;
    }
  };
  const visitRootDeclaration = (declaration: ts.Declaration, meaning: DeclarationMeaning): void => {
    tier = serverTypeTier(path(declaration));
    const localShape = shapeDeclaration(declaration) && nativeFactoryTypeHomePopulation(path(declaration));
    const owned = localShape && signatureOwns(declaration, checker, foreign);
    if (localShape && !owned) {
      refusals.add("the directly imported local shape has no qualified explicit factory signature owner");
    }
    visitDeclaration(declaration, meaning === "type" && (!localShape || owned), meaning);
  };
  const visitRoot = (node: ts.Node): void => {
    const valueRoots = symbolDeclarations(node, "value");
    // A type-only import of a value exists for `typeof`, so its value declaration is the boundary.
    const typeRoots = typeOnlyReference(node) ? symbolDeclarations(node, "type") : [];
    const meaning = valueRoots.length > 0 && typeRoots.length === 0 ? "value" : "type";
    const roots = symbolDeclarations(node, meaning);
    if (roots.length === 0) {
      refusals.add("the native public reference has no declaration");
    }
    for (const declaration of roots) {
      visitRootDeclaration(declaration, meaning);
    }
  };
  const visitAugmentationMember = (child: ts.Node): void => {
    if (ts.isModuleBlock(child) || ts.isModuleDeclaration(child)) {
      ts.forEachChild(child, visitAugmentationMember);
    } else if (genericDeclaration(child)) {
      visitComposite(child, "type");
    } else if (publicAnnotationDeclaration(child)) {
      visitDeclaration(child, true, "type", true);
    } else if (ts.isVariableStatement(child)) {
      for (const declaration of child.declarationList.declarations) {
        visitDeclaration(declaration, true, "type", true);
      }
    }
  };
  const start = (startTier: string | undefined): void => {
    tier = startTier;
  };
  const visitAugmentation = (augmentation: ts.ModuleDeclaration): void => {
    ts.forEachChild(augmentation, visitAugmentationMember);
  };
  const refuse = (detail: string): void => {
    refusals.add(detail);
  };
  const fact = (origin: ts.Node): ReferenceFact<readonly ts.Declaration[], ts.Node> => {
    const confirmedDeclarations = [...findings];
    return refusals.size === 0
      ? { kind: "resolved", value: confirmedDeclarations, trace: { origin, declarations: confirmedDeclarations } }
      : { kind: "unresolved", reason: "unsupported", node: origin, detail: [...refusals].join("; "), trace: { origin, declarations: confirmedDeclarations } };
  };
  return { start, visitRoot, visitAugmentation, refuse, fact };
}

function staleEpoch(parser: NativeParserTypeContext, node: ts.Node): boolean {
  return (
    parser.checker !== parser.program.getTypeChecker() ||
    parser.source !== node.getSourceFile() ||
    parser.program.getSourceFile(node.getSourceFile().fileName) !== node.getSourceFile()
  );
}

const STALE_EPOCH = "the parser public boundary belongs to a foreign or stale source/checker epoch";

/** All reached edges retain the actual parser realm; partial confirmed findings survive a qualification refusal. */
export function readServerPublicBoundary(
  node: ts.Node,
  parser: NativeParserTypeContext,
  root: string,
  consumer: string,
): ReferenceFact<readonly ts.Declaration[], ts.Node> {
  const walk = boundaryWalk(parser, root, consumer);
  if (staleEpoch(parser, node)) {
    walk.refuse(STALE_EPOCH);
  } else {
    walk.visitRoot(node);
  }
  return walk.fact(node);
}

/**
 * An ambient augmentation publishes its members to every tier, so a factory shape its own tier lets it name is
 * exposed here, at the augmentation, rather than at any importer.
 */
export function readServerAugmentationBoundary(
  augmentation: ts.ModuleDeclaration,
  parser: NativeParserTypeContext,
  root: string,
): ReferenceFact<readonly ts.Declaration[], ts.Node> {
  const walk = boundaryWalk(parser, root, "");
  if (staleEpoch(parser, augmentation)) {
    walk.refuse(STALE_EPOCH);
  } else {
    walk.start(serverTypeTier(relative(root, augmentation.getSourceFile().fileName).replaceAll("\\", "/")));
    walk.visitAugmentation(augmentation);
  }
  return walk.fact(augmentation);
}
