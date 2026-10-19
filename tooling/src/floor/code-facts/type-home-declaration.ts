// Declaration placement over delivered native nodes; consumers retain population, authority and reporting.

import { TOKEN_ARTIFACT_PATHS, TOKEN_ARTIFACT_SOURCE_PATHS, TOKEN_TYPESCRIPT_ARTIFACT_KEYS } from "@orb/ui/token-contract";
import type { Node as MorphNode, TypeAliasDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { predictedProgram } from "../compiler/project-worlds.ts";
import { canonicalCompilerPath, registeredSemanticSourceView, semanticWorkspaceOf } from "../compiler/ts-workspace.ts";
import { componentTypeHome } from "./component-type-home.ts";
import { inlineShapeNames, isPlainDataShape, WIRE_SHAPE_SUFFIXES } from "./shape-declaration.ts";
import { packageContractHome, packageTypeHome, UI_TOKEN_AUTHORING_CONTRACT_HOME } from "./type-home.ts";
import type {
  DeclarationTypeHomeOwnership,
  GeneratedTypeHomeContext,
  TypeHomeCategory,
  TypeHomeDeclarationInput,
  TypeHomeDeclarationJudgment,
  TypeHomeNativeSource,
} from "./type-home-contract.ts";

/** Judge an existing admitted claim; unqualified ownership preserves its finding rather than granting a home. */
export function judgeTypeHomeDeclaration(node: MorphNode, input: TypeHomeDeclarationInput): TypeHomeDeclarationJudgment {
  const { path, claim } = input;
  const source = node.getSourceFile().getFilePath();
  if (path.startsWith("/") || path.split("/").some((part) => part === "." || part === "..") || !source.endsWith(`/${path}`)) {
    return { kind: "refused", reason: "Type-home source identity does not match the delivered declaration." };
  }
  if (claim === "alias-or-schema" ? !(Node.isTypeAliasDeclaration(node) || Node.isVariableStatement(node)) : !Node.isInterfaceDeclaration(node)) {
    return { kind: "not-subject" };
  }
  let names = inlineShapeNames(node);
  if (claim === "wire-interface") {
    names = names.filter((name) => WIRE_SHAPE_SUFFIXES.some((suffix) => name.getText().endsWith(suffix) && name.getText().length > suffix.length));
    if (names.length > 0 && Node.isInterfaceDeclaration(node) && !isPlainDataShape(node)) {
      return { kind: "not-subject" };
    }
  }
  if (names.length === 0) {
    return { kind: "not-subject" };
  }
  const ownership = contextualDeclarationTypeHome(node, input);
  if (ownership.kind === "refused") {
    return ownership;
  }
  return { kind: "subject", names, ownership };
}

const UNQUALIFIED_HOME_REASONS = {
  primitive: "Primitive ownership requires declaration provenance, not membership in kit.",
  wire: "Wire ownership requires the canonical boundary schema and derivation, not membership in contracts.",
  "db-row": "Row ownership requires the canonical table and inferred row origin, not membership in db.",
  domain: "Domain ownership requires the owning domain and lower-owned derivation evidence.",
  "client-view": "Client views and component APIs require semantic ownership; existing placement obligations remain.",
  component: "Component ownership requires the actual component API and supporting type graph.",
  "standalone-declarations": "Standalone declarations require their native runtime and distribution ownership.",
  unqualified: "This package's declaration ownership has not been adjudicated.",
} as const satisfies Readonly<Record<Exclude<TypeHomeCategory, "package-contract" | "authoring-contract">, string>>;

function contextualDeclarationTypeHome(
  node: MorphNode,
  input: TypeHomeDeclarationInput,
): DeclarationTypeHomeOwnership | { readonly kind: "refused"; readonly reason: string } {
  if (input.generated !== undefined) {
    const generated = generatedDeclarationTypeHome(node, input);
    if (generated !== undefined) {
      return generated;
    }
  }
  const classification = packageTypeHome(input.path);
  if (classification?.category !== "component" || input.component === undefined || !(Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node))) {
    return declarationTypeHome(input.path);
  }
  const result = componentTypeHome({ declaration: node, path: input.path, ...input.component });
  if (result.kind === "refused") {
    return result;
  }
  return result.kind === "owned"
    ? { kind: "component-owned", packageName: classification.packageName, home: input.path, component: result.component, lowerData: result.lowerData }
    : { kind: "unqualified", category: "component", reason: result.reason };
}

/** Resolve only sanctioned structural ownership; package categories are never blanket declaration homes. */
function declarationTypeHome(path: string): DeclarationTypeHomeOwnership {
  const classification = packageTypeHome(path);
  if (classification === undefined) {
    return { kind: "unqualified", category: null, reason: "This source is outside package ownership; its admitted policy retains the placement obligation." };
  }
  if (classification.category === "authoring-contract") {
    return { kind: classification.home === true ? "owned" : "misplaced", packageName: classification.packageName, home: UI_TOKEN_AUTHORING_CONTRACT_HOME };
  }
  if (classification.category === "package-contract") {
    return {
      kind: classification.home === true ? "owned" : "misplaced",
      packageName: classification.packageName,
      home: packageContractHome(classification.packageName),
    };
  }
  return { kind: "unqualified", category: classification.category, reason: UNQUALIFIED_HOME_REASONS[classification.category] };
}

function currentNativeSource(capture: TypeHomeNativeSource, path: string): boolean {
  const { view, program, source, text } = capture;
  if (view.sourceFile.wasForgotten()) {
    return false;
  }
  const workspace = semanticWorkspaceOf(view.sourceFile.getProject());
  const registered = registeredSemanticSourceView(view.sourceFile);
  return (
    workspace !== undefined &&
    registered?.program === view.program &&
    workspace.program(view.program.descriptor.config) === view.program &&
    view.program.descriptor.config === predictedProgram(path) &&
    view.canonicalPath === canonicalCompilerPath(workspace.root, path) &&
    registered.canonicalPath === view.canonicalPath &&
    view.sourceFile.getProject().getProgram().compilerObject === program &&
    view.sourceFile.compilerNode === source &&
    program.getSourceFile(view.sourceFile.getFilePath()) === source &&
    view.sourceFile.getFullText() === text
  );
}

/** Validate the complete producer/output family even when the selected output has no type declarations. */
export function generatedTypeHomeContextRefusal(context: GeneratedTypeHomeContext): string | undefined {
  const producerPath = `packages/ui/${TOKEN_ARTIFACT_SOURCE_PATHS.producer}`;
  const producer = context.sources.get(producerPath);
  if (producer === undefined || !currentNativeSource(producer, producerPath)) {
    return "Generated type ownership requires the current canonical producer native world.";
  }
  const workspace = semanticWorkspaceOf(producer.view.sourceFile.getProject());
  for (const key of TOKEN_TYPESCRIPT_ARTIFACT_KEYS) {
    const path = `packages/ui/${TOKEN_ARTIFACT_PATHS[key]}`;
    const output = context.sources.get(path);
    if (
      output === undefined ||
      !currentNativeSource(output, path) ||
      semanticWorkspaceOf(output.view.sourceFile.getProject()) !== workspace ||
      context.outputs.get(path) !== output.text
    ) {
      return "Generated type ownership requires the complete current output family.";
    }
  }
  const operation = producer.view.sourceFile.getExportedDeclarations().get("generateArtifacts");
  const [declaration] = operation ?? [];
  return operation?.length !== 1 ||
    declaration === undefined ||
    !Node.isFunctionDeclaration(declaration) ||
    declaration.getSourceFile() !== producer.view.sourceFile
    ? "Canonical token producer callable identity is unavailable."
    : undefined;
}

function generatedDeclarationTypeHome(
  node: MorphNode,
  input: TypeHomeDeclarationInput,
): DeclarationTypeHomeOwnership | { readonly kind: "refused"; readonly reason: string } | undefined {
  const prefix = "packages/ui/";
  const paths = TOKEN_TYPESCRIPT_ARTIFACT_KEYS.map((key) => `${prefix}${TOKEN_ARTIFACT_PATHS[key]}`);
  if (!paths.includes(input.path) || input.generated === undefined) {
    return;
  }
  const reason = generatedTypeHomeContextRefusal(input.generated);
  if (reason !== undefined) {
    return { kind: "refused", reason };
  }
  const producerPath = `${prefix}${TOKEN_ARTIFACT_SOURCE_PATHS.producer}`;
  const producer = input.generated.sources.get(producerPath);
  const output = input.generated.sources.get(input.path);
  if (producer === undefined || output === undefined || node.getSourceFile().getFullText() !== output.text) {
    return { kind: "refused", reason: "Generated type output differs from the admitted source." };
  }
  const [producerDeclaration] = producer.view.sourceFile.getExportedDeclarations().get("generateArtifacts") ?? [];
  if (producerDeclaration === undefined || !Node.isFunctionDeclaration(producerDeclaration)) {
    return { kind: "refused", reason: "Canonical token producer callable identity is unavailable." };
  }
  const delivered = output.view.sourceFile
    .getTypeAliases()
    .find(
      (candidate) =>
        candidate.getStart() === node.getStart() &&
        candidate.getEnd() === node.getEnd() &&
        candidate.getKind() === node.getKind() &&
        candidate.getText() === node.getText(),
    );
  const value = generatedVocabularyValue(delivered);
  if (value === undefined) {
    return { kind: "unqualified", category: "component", reason: "Generated vocabulary lacks a unique producer-owned local object value." };
  }
  return { kind: "generated-owned", packageName: "ui", home: input.path, producer: producerDeclaration, value };
}

function generatedVocabularyValue(delivered: TypeAliasDeclaration | undefined): MorphNode | undefined {
  const type = delivered?.getTypeNode();
  if (type === undefined || !Node.isTypeOperatorTypeNode(type) || type.getOperator() !== SyntaxKind.KeyOfKeyword) {
    return;
  }
  const query = type.getTypeNode();
  if (!(Node.isTypeQuery(query) && Node.isIdentifier(query.getExprName()))) {
    return;
  }
  const declarations = query.getExprName().getSymbol()?.getDeclarations();
  const [value] = declarations ?? [];
  if (
    declarations?.length !== 1 ||
    value === undefined ||
    !Node.isVariableDeclaration(value) ||
    value.getSourceFile() !== delivered?.getSourceFile() ||
    value.getVariableStatement()?.getDeclarationKind() !== "const"
  ) {
    return;
  }
  let initializer = value.getInitializer();
  if (initializer !== undefined && Node.isAsExpression(initializer) && initializer.getTypeNode()?.getText() === "const") {
    initializer = initializer.getExpression();
  }
  if (
    initializer === undefined ||
    !Node.isObjectLiteralExpression(initializer) ||
    initializer
      .getProperties()
      .some((property) => Node.isSpreadAssignment(property) || (Node.isPropertyAssignment(property) && Node.isComputedPropertyName(property.getNameNode())))
  ) {
    return;
  }
  return value;
}
