// Canonical ZodType declaration identity and exact output parity; input is not this contract.
import type { Expression, Node as MorphNode, PropertyDeclaration, SourceFile, TypeNode, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { createTypeObservationCapture } from "../../floor/code-facts/type-observations.ts";
import type { ObservedReference, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { ZOD_OUTPUT_PROPERTY } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector, typeArgumentSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { unwrapTypeExpression as unwrapSchemaExpression } from "../../floor/code-facts/type-slot-syntax.ts";
import type { ZodOutputTwinRead } from "../contract/zod-output-twin.ts";

const ZOD_PACKAGE_SEGMENT = "/node_modules/zod/";
const RUNTIME_GENERATED_SCHEMA_SOURCE = "/packages/kit/src/json-schema/lift.ts";
const RUNTIME_GENERATED_SCHEMA_BRAND = "RUNTIME_GENERATED_SCHEMA_BRAND";
const RUNTIME_GENERATED_SCHEMA_BOX = "RuntimeGeneratedSchemaBox";

/** Direct native and isolated callers keep their genuine owner; delivered readers never use this fallback. */
function nativeZodTypeReaders(node: MorphNode): TypeObservationReader {
  const project = node.getProject();
  return createTypeObservationCapture({
    anchor: node.getSourceFile(),
    admit: (subject): void => {
      if (subject.wasForgotten() || subject.getProject() !== project) {
        throw new Error("Zod native observation belongs to a foreign or forgotten source");
      }
    },
  }).reader;
}

function typeInfo(selector: NativeTypeSelector, readers: TypeObservationReader): ReturnType<TypeObservationReader["type"]> | undefined {
  const reference = readers.select(selector);
  return reference === null ? undefined : readers.type(reference);
}
function canonicalZodType(selector: NativeTypeSelector, readers: TypeObservationReader): boolean {
  const symbol = typeInfo(selector, readers)?.symbol;
  if (symbol === undefined || symbol === null) {
    return false;
  }
  const value = readers.symbolData(symbol);
  return (
    value.name === "ZodType" &&
    value.declarations.some((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes(ZOD_PACKAGE_SEGMENT))
  );
}

export function zodTypeReferenceIdentity(node: TypeNode): "canonical" | "none" | "unresolved" {
  return zodTypeReferenceIdentityWith(node, nativeZodTypeReaders(node));
}
export function zodTypeReferenceIdentityWith(node: TypeNode, readers: TypeObservationReader): "canonical" | "none" | "unresolved" {
  if (!Node.isTypeReference(node) || node.getTypeArguments().length === 0) {
    return "none";
  }
  if (canonicalZodType(nodeTypeSelector(node), readers)) {
    return "canonical";
  }
  const symbol = readers.symbol(node.getTypeName());
  if (symbol !== null && readers.symbolData(symbol).declarations.length > 0) {
    return "none";
  }
  const text = node.getTypeName().getText();
  const importedFromZod = node
    .getSourceFile()
    .getImportDeclarations()
    .some((declaration) => {
      if (declaration.getModuleSpecifierValue() !== "zod") {
        return false;
      }
      const namespace = declaration.getNamespaceImport()?.getText();
      if (namespace !== undefined && text === `${namespace}.ZodType`) {
        return true;
      }
      return declaration.getNamedImports().some((specifier) => {
        const local = specifier.getAliasNode()?.getText() ?? specifier.getName();
        return specifier.getName() === "ZodType" && text === local;
      });
    });
  return importedFromZod ? "unresolved" : "none";
}

function canonicalRuntimeGeneratedSchemaDeclarations(sourceFile: SourceFile): {
  readonly brand: VariableDeclaration;
  readonly schema: PropertyDeclaration;
} | null {
  if (!sourceFile.getFilePath().replaceAll("\\", "/").endsWith(RUNTIME_GENERATED_SCHEMA_SOURCE)) {
    return null;
  }
  const brand = sourceFile
    .getVariableStatements()
    .flatMap((statement) => statement.getDeclarations())
    .find((declaration) => declaration.getName() === RUNTIME_GENERATED_SCHEMA_BRAND && declaration.getTypeNode()?.getText() === "unique symbol");
  const schema = sourceFile.getClass(RUNTIME_GENERATED_SCHEMA_BOX)?.getProperty("schema");
  return brand === undefined || schema === undefined ? null : { brand, schema };
}

function isCanonicalRuntimeGeneratedSchemaBrand(node: MorphNode): boolean {
  if (!Node.isVariableDeclaration(node)) {
    return false;
  }
  const canonical = canonicalRuntimeGeneratedSchemaDeclarations(node.getSourceFile());
  return canonical !== null && node.compilerNode === canonical.brand.compilerNode;
}
function isCanonicalRuntimeGeneratedSchemaMember(raw: Expression, readers: TypeObservationReader): boolean {
  const expression = unwrapSchemaExpression(raw);
  if (!Node.isPropertyAccessExpression(expression)) {
    return false;
  }
  const symbol = readers.symbol(expression.getNameNode());
  const declarations = symbol === null ? [] : readers.symbolData(symbol).declarations;
  const canonical = canonicalRuntimeGeneratedSchemaDeclarations(expression.getSourceFile());
  if (
    canonical === null ||
    !declarations.some((declaration) => Node.isPropertyDeclaration(declaration) && declaration.compilerNode === canonical.schema.compilerNode)
  ) {
    return false;
  }
  return readers.computedNames(nodeTypeSelector(expression.getExpression())).some((property) => property.names.some(isCanonicalRuntimeGeneratedSchemaBrand));
}
function pairWithTarget(
  target: NativeTypeSelector,
  raw: Expression,
  carrier: MorphNode,
  context: { readonly readers: TypeObservationReader; readonly schema?: NativeTypeSelector },
): ZodOutputTwinRead {
  const { readers, schema: suppliedSchema } = context;
  const targetOutput = typeArgumentSelector(target);
  const targetInfo = typeInfo(targetOutput, readers);
  if (targetInfo === undefined) {
    return { kind: "unresolved", carrier, reason: "the canonical ZodType target exposed no readable output argument" };
  }
  if (targetInfo.any || targetInfo.unknown) {
    return { kind: "unresolved", carrier, reason: "the authored ZodType target erases output as any/unknown" };
  }
  const schema = unwrapSchemaExpression(raw);
  const schemaSelector = suppliedSchema ?? nodeTypeSelector(schema);
  if (typeInfo(schemaSelector, readers)?.never === true) {
    return { kind: "none" };
  }
  const output = { ...schemaSelector, steps: [...schemaSelector.steps, { kind: "property" as const, name: ZOD_OUTPUT_PROPERTY, at: schema }] };
  const outputInfo = typeInfo(output, readers);
  if (outputInfo === undefined || outputInfo.any || outputInfo.unknown) {
    return {
      kind: "unresolved",
      carrier,
      reason: "the schema output or authored target collapsed to any/unknown, so exact output parity cannot be established",
    };
  }
  const relation = readers.relation(output, targetOutput);
  const targetText = readers.display(targetOutput, carrier);
  const outputText = readers.display(output, carrier);
  if (relation === null || targetText === null || outputText === null) {
    throw new Error("native Zod output relation/display was not captured");
  }
  return { kind: "pair", carrier, targetText, outputText, outputToTarget: relation.leftToRight, targetToOutput: relation.rightToLeft };
}
function pair(target: TypeNode, raw: Expression, carrier: MorphNode, readers: TypeObservationReader): ZodOutputTwinRead {
  const identity = zodTypeReferenceIdentityWith(target, readers);
  if (identity === "none") {
    return { kind: "none" };
  }
  if (identity === "unresolved") {
    return { kind: "unresolved", carrier, reason: "the authored ZodType target could not be resolved to the installed zod declaration" };
  }
  return pairWithTarget(nodeTypeSelector(target), raw, carrier, { readers });
}
function annotationOwnsInitializer(declaration: VariableDeclaration | PropertyDeclaration, readers: TypeObservationReader): boolean {
  const annotation = declaration.getTypeNode();
  return annotation !== undefined && zodTypeReferenceIdentityWith(annotation, readers) !== "none";
}
/** A declaration with a value makes one independently checkable authored output promise. */
export function readAnnotatedZodOutputTwin(declaration: VariableDeclaration | PropertyDeclaration): ZodOutputTwinRead {
  return readAnnotatedZodOutputTwinWith(declaration, nativeZodTypeReaders(declaration));
}
export function readAnnotatedZodOutputTwinWith(declaration: VariableDeclaration | PropertyDeclaration, readers: TypeObservationReader): ZodOutputTwinRead {
  const target = declaration.getTypeNode();
  const initializer = declaration.getInitializer();
  return target === undefined || initializer === undefined ? { kind: "none" } : pair(target, initializer, declaration.getNameNode(), readers);
}
/** Preserve annotation ownership and nested transparent expression suppression. */
export function readExpressionZodOutputTwin(node: MorphNode): ZodOutputTwinRead {
  return readExpressionZodOutputTwinWith(node, nativeZodTypeReaders(node));
}
export function readExpressionZodOutputTwinWith(node: MorphNode, readers: TypeObservationReader): ZodOutputTwinRead {
  if (!(Node.isSatisfiesExpression(node) || Node.isAsExpression(node) || Node.isTypeAssertion(node))) {
    return { kind: "none" };
  }
  const declaration = node.getFirstAncestor((ancestor) => Node.isVariableDeclaration(ancestor) || Node.isPropertyDeclaration(ancestor));
  if (
    declaration !== undefined &&
    (Node.isVariableDeclaration(declaration) || Node.isPropertyDeclaration(declaration)) &&
    annotationOwnsInitializer(declaration, readers)
  ) {
    return { kind: "none" };
  }
  const parent = node.getParent();
  const parentType = Node.isAsExpression(parent) || Node.isTypeAssertion(parent) || Node.isSatisfiesExpression(parent) ? parent.getTypeNode() : undefined;
  if (parentType !== undefined && zodTypeReferenceIdentityWith(parentType, readers) !== "none") {
    return { kind: "none" };
  }
  const target = node.getTypeNode();
  return target === undefined
    ? { kind: "unresolved", carrier: node, reason: "the authored ZodType expression exposed no readable target node" }
    : pair(target, node.getExpression(), node, readers);
}
function ownerTypeParameter(selector: NativeTypeSelector, owner: MorphNode, readers: TypeObservationReader): boolean {
  const symbol = typeInfo(selector, readers)?.symbol;
  return (
    symbol !== undefined &&
    symbol !== null &&
    readers.symbolData(symbol).declarations.some((declaration) => Node.isTypeParameterDeclaration(declaration) && declaration.getAncestors().includes(owner))
  );
}
function isGenericSchemaPassThrough(expression: Expression, contextual: NativeTypeSelector, readers: TypeObservationReader): boolean {
  const schema = unwrapSchemaExpression(expression);
  if (!Node.isIdentifier(schema)) {
    return false;
  }
  const symbol = readers.symbol(schema);
  const declarations = symbol === null ? [] : readers.symbolData(symbol).declarations;
  const parameter = declarations.length === 1 && Node.isParameterDeclaration(declarations[0]) ? declarations[0] : undefined;
  if (parameter === undefined) {
    return false;
  }
  const parameterOwner = parameter.getAncestors().find(Node.isFunctionLikeDeclaration);
  const schemaOwner = schema.getAncestors().find(Node.isFunctionLikeDeclaration);
  if (parameterOwner === undefined || parameterOwner !== schemaOwner) {
    return false;
  }
  const parameterOutput = typeArgumentSelector(nodeTypeSelector(parameter));
  const contextualOutput = typeArgumentSelector(contextual);
  if (!(ownerTypeParameter(parameterOutput, parameterOwner, readers) && ownerTypeParameter(contextualOutput, parameterOwner, readers))) {
    return false;
  }
  const relation = readers.relation(parameterOutput, contextualOutput);
  return relation !== null && relation.leftToRight && relation.rightToLeft;
}
/** Contextual output promises exclude only canonical generated carriers and same-owner generic plumbing. */
export function readContextualZodOutputTwin(expression: Expression, carrier: MorphNode = expression): ZodOutputTwinRead {
  return readContextualZodOutputTwinWith(expression, carrier, nativeZodTypeReaders(expression));
}
export function readContextualZodOutputTwinWith(expression: Expression, carrier: MorphNode, readers: TypeObservationReader): ZodOutputTwinRead {
  const target =
    Node.isAsExpression(expression) || Node.isTypeAssertion(expression) || Node.isSatisfiesExpression(expression) ? expression.getTypeNode() : undefined;
  if (target !== undefined && zodTypeReferenceIdentityWith(target, readers) !== "none") {
    return { kind: "none" };
  }
  if (isCanonicalRuntimeGeneratedSchemaMember(expression, readers)) {
    return { kind: "none" };
  }
  const schemaSelector = nodeTypeSelector(unwrapSchemaExpression(expression));
  if (
    readers.select({
      ...schemaSelector,
      steps: [...schemaSelector.steps, { kind: "property", name: ZOD_OUTPUT_PROPERTY, at: unwrapSchemaExpression(expression) }],
    }) === null
  ) {
    return { kind: "none" };
  }
  const contextual = nodeTypeSelector(expression, "contextual");
  if (readers.select(contextual) === null || !canonicalZodType(contextual, readers) || isGenericSchemaPassThrough(expression, contextual, readers)) {
    return { kind: "none" };
  }
  return pairWithTarget(contextual, expression, carrier, { readers, schema: schemaSelector });
}

/** Raw symbol observations preserve every identifier binding in an authored type node. */
export function typeNodeIdentifierSymbols(typeNode: TypeNode, readers: TypeObservationReader): readonly ObservedReference<"symbol">[] {
  return typeNode.getDescendantsOfKind(SyntaxKind.Identifier).flatMap((identifier) => {
    const symbol = readers.symbol(identifier);
    return symbol === null ? [] : [symbol];
  });
}
