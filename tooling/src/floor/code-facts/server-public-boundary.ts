// Placement follows compiler-checked public declarations, never instantiated structural type graphs.
import { matchesGlob, relative } from "node:path";
import ts from "typescript";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import type { DeclarationMeaning, GenericFormal } from "./server-public-boundary-grammar.ts";
import {
  aliasTarget,
  annotationChildren,
  authoredAnnotationRefusal,
  completeSignature,
  declarationHasMeaning,
  defaultNeedsBinding,
  formalContribution,
  genericDeclaration,
  genericFormals,
  isPublicSignature,
  namedDeclaration,
  primitiveLiteral,
  publicAnnotationDeclaration,
  publicClassMember,
  publicParameterProperty,
  shapeDeclaration,
  terminalDeclaration,
  typeApplication,
  typeOnlyReference,
  valueDeclaration,
  vocabularyChildren,
} from "./server-public-boundary-grammar.ts";
import { WIRE_SHAPE_SUFFIXES } from "./shape-declaration.ts";
import { nativeFactoryTypeHomePopulation, packageTypeHome, serverTypeTier, TYPE_HOME_NATIVE_CONTRACT_GLOBS } from "./type-home.ts";
import { readParserTransparentAliasOrigin } from "./type-member-origin.ts";
import type { NativeParserTypeContext } from "./type-member-origin-contract.ts";

function isAugmentationMember(node: ts.Node): boolean {
  let parent = node.parent;
  while (!ts.isSourceFile(parent)) {
    if (ts.isModuleDeclaration(parent)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function signatureOwns(declaration: ts.Declaration, checker: ts.TypeChecker): boolean {
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
    for (const [index, argument] of (node.typeArguments ?? []).entries()) {
      if (genericFormals(declarations, index).some(({ owner, parameter }) => formalContribution(parameter, owner, checker) === "direct")) {
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

/** All reached edges retain the actual parser realm; partial confirmed findings survive a qualification refusal. */
export function readServerPublicBoundary(
  node: ts.Node,
  parser: NativeParserTypeContext,
  root: string,
  consumer: string,
): ReferenceFact<readonly ts.Declaration[], ts.Node> {
  const { program, checker } = parser;
  const findings = new Set<ts.Declaration>();
  const visited = { type: new Set<ts.Declaration>(), value: new Set<ts.Declaration>() };
  const opaqueVisited = { type: new Set<ts.Declaration>(), value: new Set<ts.Declaration>() };
  let opaque = false;
  const refusals = new Set<string>();
  const path = (declaration: ts.Node): string => relative(root, declaration.getSourceFile().fileName).replaceAll("\\", "/");
  const contains = (candidate: ts.Node): boolean => program.getSourceFile(candidate.getSourceFile().fileName) === candidate.getSourceFile();
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
      refusals.add(
        `the native public reference ${at.getText()} at ${path(at)}:${at.getSourceFile().getLineAndCharacterOfPosition(at.getStart()).line + 1} has no declaration`,
      );
    }
    for (const declaration of declarations) {
      visitDeclaration(declaration, signature, meaning);
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
    visitArguments(reference, declarations, signature);
    for (const declaration of declarations) {
      visitDeclaration(declaration, signature);
    }
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
    visitArguments(annotation, declarations, signature);
    for (const declaration of declarations) {
      visitDeclaration(declaration, signature);
    }
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
  const visitAnnotation = (annotation: ts.Node, signature: boolean): void => {
    visitComputedName(annotation);
    const refusal = external(annotation) ? undefined : authoredAnnotationRefusal(annotation);
    if (refusal !== undefined) {
      refusals.add(refusal);
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
    if (ts.isTypeQueryNode(annotation) && external(annotation)) {
      visitSymbol(annotation.exprName, signature, "value");
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
  const visitCallable = (declaration: ts.SignatureDeclaration): void => {
    if (!(completeSignature(declaration) || external(declaration))) {
      refusals.add("an authored callable public boundary is missing an explicit parameter or result annotation");
    }
    for (const annotation of children(declaration)) {
      visitAnnotation(annotation, true);
    }
  };
  const visitValue = (declaration: ts.VariableDeclaration | ts.PropertyDeclaration | ts.PropertySignature, signature: boolean): void => {
    if (declaration.type !== undefined) {
      visitAnnotation(declaration.type, true);
      return;
    }
    const value = ts.isPropertySignature(declaration) ? undefined : declaration.initializer;
    if (ts.isVariableDeclaration(declaration) && value !== undefined && ts.isIdentifier(value)) {
      visitSymbol(value, signature, "value");
    } else if (!(external(declaration) || primitiveLiteral(value))) {
      refusals.add("an authored value or member public boundary is missing an explicit annotation");
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
  const visitDeclarationBody = (declaration: ts.Declaration, signature: boolean, meaning: DeclarationMeaning): void => {
    if (isPublicSignature(declaration)) {
      visitCallable(declaration);
      return;
    }
    if (valueDeclaration(declaration)) {
      visitValue(declaration, signature);
      return;
    }
    if (genericDeclaration(declaration)) {
      visitComposite(declaration, meaning);
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
    if (!contains(declaration)) {
      refusals.add("a public declaration belongs to a foreign or stale native source");
      return;
    }
    if (opaque && !inherited && !closedVocabularyOwner(declaration, meaning)) {
      refusals.add(
        `an indirect generic actual reaches an unsanctioned or unknown authored declaration at ${path(declaration)}:${declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line + 1}`,
      );
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
    visitDeclarationBody(declaration, signature, meaning);
  };
  const visitRootDeclaration = (declaration: ts.Declaration, meaning: DeclarationMeaning): void => {
    const localShape = shapeDeclaration(declaration) && nativeFactoryTypeHomePopulation(path(declaration));
    const owned = localShape && signatureOwns(declaration, checker);
    if (localShape && !owned) {
      refusals.add("the directly imported local shape has no qualified explicit factory signature owner");
    }
    visitDeclaration(declaration, meaning === "type" && (!localShape || owned), meaning);
  };
  const visitRoot = (): void => {
    const valueRoots = symbolDeclarations(node, "value");
    const meaning = !typeOnlyReference(node) && valueRoots.length > 0 ? "value" : "type";
    const roots = symbolDeclarations(node, meaning);
    if (roots.length === 0) {
      refusals.add("the native public reference has no declaration");
    }
    for (const declaration of roots) {
      visitRootDeclaration(declaration, meaning);
    }
  };
  if (checker !== program.getTypeChecker() || parser.source !== node.getSourceFile() || !contains(node)) {
    refusals.add("the parser public boundary belongs to a foreign or stale source/checker epoch");
  } else {
    visitRoot();
  }
  const confirmedDeclarations = [...findings];
  return refusals.size === 0
    ? { kind: "resolved", value: confirmedDeclarations, trace: { origin: node, declarations: confirmedDeclarations } }
    : { kind: "unresolved", reason: "unsupported", node, detail: [...refusals].join("; "), trace: { origin: node, declarations: confirmedDeclarations } };
}
