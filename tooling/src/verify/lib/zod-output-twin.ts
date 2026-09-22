// Canonical ZodType declaration identity and exact OUTPUT parity for hand-authored schema/type twins.
// Input is deliberately absent from this reader: defaults, coercions, preprocessors and transforms may
// widen or narrow accepted input while preserving the output contract a twin promises.
import type { Expression, Node as MorphNode, PropertyDeclaration, Type, TypeNode, VariableDeclaration } from "ts-morph";
import { Node } from "ts-morph";

const ZOD_PACKAGE_SEGMENT = "/node_modules/zod/";
const RUNTIME_GENERATED_SCHEMA_SOURCE = "/packages/kit/src/json-schema/lift.ts";
const RUNTIME_GENERATED_SCHEMA_BRAND = "RUNTIME_GENERATED_SCHEMA_BRAND";

export type ZodOutputTwinRead =
  | { readonly kind: "none" }
  | { readonly kind: "unresolved"; readonly carrier: MorphNode; readonly reason: string }
  | {
      readonly kind: "pair";
      readonly carrier: MorphNode;
      readonly target: Type;
      readonly output: Type;
      readonly outputToTarget: boolean;
      readonly targetToOutput: boolean;
    };

function canonicalZodType(type: Type): boolean {
  const symbol = type.getSymbol();
  return (
    symbol?.getName() === "ZodType" &&
    symbol.getDeclarations().some((declaration) => declaration.getSourceFile().getFilePath().replaceAll("\\", "/").includes(ZOD_PACKAGE_SEGMENT))
  );
}

export function zodTypeReferenceIdentity(node: TypeNode): "canonical" | "none" | "unresolved" {
  if (!Node.isTypeReference(node) || node.getTypeArguments().length === 0) {
    return "none";
  }
  const resolvedType = node.getType();
  if (canonicalZodType(resolvedType)) {
    return "canonical";
  }
  const symbol = node.getTypeName().getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];

  // A resolved lookalike is somebody else's type. An unresolved binding imported from `zod` is OUR
  // unreadable subject and must refuse rather than silently disappear when module resolution breaks.
  if (declarations.length > 0) {
    return "none";
  }
  const text = node.getTypeName().getText();
  const sourceFile = node.getSourceFile();
  const importedFromZod = sourceFile.getImportDeclarations().some((declaration) => {
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

function unwrapSchemaExpression(node: Expression): Expression {
  let current = node;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isTypeAssertion(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isNonNullExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

function isCanonicalRuntimeGeneratedSchemaBrand(node: MorphNode): boolean {
  return (
    Node.isVariableDeclaration(node) &&
    node.getName() === RUNTIME_GENERATED_SCHEMA_BRAND &&
    node.getTypeNode()?.getText() === "unique symbol" &&
    node.getSourceFile().getFilePath().replaceAll("\\", "/").endsWith(RUNTIME_GENERATED_SCHEMA_SOURCE)
  );
}

/** A contextual `ZodType<any | unknown>` is truthful only when the value comes through the canonical
 * runtime-generated-schema container. Resolve both the `schema` property declaration and its nominal
 * unique-symbol brand; a same-named structural wrapper, a bare member, or an authored schema stays visible. */
function isCanonicalRuntimeGeneratedSchemaMember(rawExpression: Expression): boolean {
  const expression = unwrapSchemaExpression(rawExpression);
  if (!Node.isPropertyAccessExpression(expression)) {
    return false;
  }
  const memberDeclarations = expression.getNameNode().getSymbol()?.getDeclarations() ?? [];
  return memberDeclarations.some((memberDeclaration) => {
    if (!Node.isPropertyDeclaration(memberDeclaration)) {
      return false;
    }
    const owner = memberDeclaration.getFirstAncestor(Node.isClassDeclaration);
    if (owner === undefined) {
      return false;
    }
    return owner.getProperties().some((property) => {
      const name = property.getNameNode();
      if (!Node.isComputedPropertyName(name)) {
        return false;
      }
      return name.getExpression().getSymbol()?.getDeclarations().some(isCanonicalRuntimeGeneratedSchemaBrand) === true;
    });
  });
}

function pairWithTarget(target: Type, rawSchema: Expression, carrier: MorphNode, erasedTarget: "unresolved" | "ignore"): ZodOutputTwinRead {
  const targetOutput = target.getTypeArguments()[0];
  if (targetOutput === undefined) {
    return { kind: "unresolved", carrier, reason: "the canonical ZodType target exposed no readable output argument" };
  }
  // An explicit `ZodType<any | unknown>` annotation erases the very output contract this policy must
  // compare. Keep it in the population as unreadable so a healthy sibling cannot make the owner clean.
  if (targetOutput.isAny() || targetOutput.isUnknown()) {
    return erasedTarget === "unresolved"
      ? { kind: "unresolved", carrier, reason: "the authored ZodType target erases output as any/unknown" }
      : { kind: "none" };
  }
  const schema = unwrapSchemaExpression(rawSchema);
  const schemaType = schema.getType();
  // Exhaustive dispatch tails (`return assertNever(x)`) are control-flow proofs, not schema values.
  if (schemaType.isNever()) {
    return { kind: "none" };
  }
  const output = schemaType.getProperty("_output")?.getTypeAtLocation(schema);
  if (output === undefined || output.isAny() || output.isUnknown()) {
    return {
      kind: "unresolved",
      carrier,
      reason: "the schema output or authored target collapsed to any/unknown, so exact output parity cannot be established",
    };
  }
  return {
    kind: "pair",
    carrier,
    target: targetOutput,
    output,
    outputToTarget: output.isAssignableTo(targetOutput),
    targetToOutput: targetOutput.isAssignableTo(output),
  };
}

function pair(targetNode: TypeNode, rawSchema: Expression, carrier: MorphNode): ZodOutputTwinRead {
  const identity = zodTypeReferenceIdentity(targetNode);
  if (identity === "none") {
    return { kind: "none" };
  }
  if (identity === "unresolved") {
    return { kind: "unresolved", carrier, reason: "the authored ZodType target could not be resolved to the installed zod declaration" };
  }
  return pairWithTarget(targetNode.getType(), rawSchema, carrier, "unresolved");
}

function annotationOwnsInitializer(declaration: VariableDeclaration | PropertyDeclaration): boolean {
  const annotation = declaration.getTypeNode();
  return annotation !== undefined && zodTypeReferenceIdentity(annotation) !== "none";
}

/** Read a variable or class-property `schema: z.ZodType<T> = ...` twin. A declaration with no value is
 * plumbing; any declaration that constructs or aliases a value makes an independently checkable promise. */
export function readAnnotatedZodOutputTwin(declaration: VariableDeclaration | PropertyDeclaration): ZodOutputTwinRead {
  const target = declaration.getTypeNode();
  const initializer = declaration.getInitializer();
  return target === undefined || initializer === undefined ? { kind: "none" } : pair(target, initializer, declaration.getNameNode());
}

/** Read an expression-level `satisfies` / cast twin, unless a module annotation already owns it. */
export function readExpressionZodOutputTwin(node: MorphNode): ZodOutputTwinRead {
  if (!(Node.isSatisfiesExpression(node) || Node.isAsExpression(node) || Node.isTypeAssertion(node))) {
    return { kind: "none" };
  }
  const declaration = node.getFirstAncestor((ancestor) => Node.isVariableDeclaration(ancestor) || Node.isPropertyDeclaration(ancestor));
  if (
    declaration !== undefined &&
    (Node.isVariableDeclaration(declaration) || Node.isPropertyDeclaration(declaration)) &&
    annotationOwnsInitializer(declaration)
  ) {
    return { kind: "none" };
  }
  const parent = node.getParent();
  const parentType = Node.isAsExpression(parent) || Node.isTypeAssertion(parent) || Node.isSatisfiesExpression(parent) ? parent.getTypeNode() : undefined;
  if (parentType !== undefined && zodTypeReferenceIdentity(parentType) !== "none") {
    return { kind: "none" };
  }
  const target = node.getTypeNode();
  return target === undefined
    ? { kind: "unresolved", carrier: node, reason: "the authored ZodType expression exposed no readable target node" }
    : pair(target, node.getExpression(), node);
}

function ownerTypeParameter(type: Type, owner: MorphNode): boolean {
  return (
    type
      .getSymbol()
      ?.getDeclarations()
      .some((declaration) => {
        if (!Node.isTypeParameterDeclaration(declaration)) {
          return false;
        }
        return declaration.getAncestors().includes(owner);
      }) ?? false
  );
}

function isGenericSchemaPassThrough(expression: Expression, contextual: Type): boolean {
  const schema = unwrapSchemaExpression(expression);
  if (!Node.isIdentifier(schema)) {
    return false;
  }
  const declarations = schema.getSymbol()?.getDeclarations() ?? [];
  const parameter = declarations.length === 1 && Node.isParameterDeclaration(declarations[0]) ? declarations[0] : undefined;
  if (parameter === undefined) {
    return false;
  }
  const parameterOwner = parameter.getAncestors().find(Node.isFunctionLikeDeclaration);
  const schemaOwner = schema.getAncestors().find(Node.isFunctionLikeDeclaration);
  if (parameterOwner === undefined || parameterOwner !== schemaOwner) {
    return false;
  }
  const parameterOutput = parameter.getType().getTypeArguments()[0];
  const contextualOutput = contextual.getTypeArguments()[0];
  return (
    parameterOutput !== undefined &&
    contextualOutput !== undefined &&
    ownerTypeParameter(parameterOutput, parameterOwner) &&
    ownerTypeParameter(contextualOutput, parameterOwner) &&
    parameterOutput.isAssignableTo(contextualOutput) &&
    contextualOutput.isAssignableTo(parameterOutput)
  );
}

/** Read a schema expression whose enclosing declaration supplies a contextual `ZodType<T>`: object/array
 * manifest members, return expressions, assignment RHS values and expression-bodied functions. Call
 * arguments are intentionally absent: passing a schema through a generic parameter creates no second
 * authored type owner and therefore cannot drift independently. A bare parameter returned or assigned is
 * the same pass-through case and is excluded for the same reason. */
export function readContextualZodOutputTwin(expression: Expression, carrier: MorphNode = expression): ZodOutputTwinRead {
  const expressionTarget =
    Node.isAsExpression(expression) || Node.isTypeAssertion(expression) || Node.isSatisfiesExpression(expression) ? expression.getTypeNode() : undefined;
  if (expressionTarget !== undefined && zodTypeReferenceIdentity(expressionTarget) !== "none") {
    return { kind: "none" };
  }
  if (isCanonicalRuntimeGeneratedSchemaMember(expression)) {
    return { kind: "none" };
  }
  if (unwrapSchemaExpression(expression).getType().getProperty("_output") === undefined) {
    return { kind: "none" };
  }
  const contextualReader = (expression as Expression & { readonly getContextualType?: () => Type }).getContextualType;
  if (contextualReader === undefined) {
    return { kind: "unresolved", carrier, reason: "the schema expression exposes no readable contextual type" };
  }
  const contextual = contextualReader.call(expression);
  if (contextual === undefined || !canonicalZodType(contextual) || isGenericSchemaPassThrough(expression, contextual)) {
    return { kind: "none" };
  }
  return pairWithTarget(contextual, expression, carrier, "unresolved");
}
