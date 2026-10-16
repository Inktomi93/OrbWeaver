// The caller supplies an admitted native node; this producer captures finite observations, never Types or Symbols.
import type { Type, ts } from "ts-morph";
import { Node } from "ts-morph";
import { readAssignabilityChecker, readNativeTypeRelation } from "./assignability.ts";
import { runtimeUndefinedValue } from "./call-supplied.ts";
import { resolveLexicalValueDeclaration } from "./reference-fact.ts";
import type { SchemaModel } from "./schema-model-contract.ts";
import { resolveTypeIdentityOrigin } from "./type-member-origin.ts";
import { resolveTypePropertyOrigin } from "./type-member-origin-core.ts";
import { captureTypeOriginProjection } from "./type-origin-projection.ts";
import type {
  NativePrimitiveFlags,
  NativeScalarSelectedType,
  NativeScalarTypeSelections,
  NativeSelectedType,
  NativeTypeProjection,
  NativeTypeSelectionPlan,
  NativeTypeSelections,
  NativeTypeSelector,
  NativeTypeVocabulary,
  TypeProjectionPlan,
} from "./type-projection-contract.ts";
import {
  assertScalarTypeSelectionCoverage,
  assertTypeProjectionCoverage,
  assertTypeSelectionCoverage,
  canonicalTypeProjectionPlan,
} from "./type-projection-contract.ts";

// Export-list/default aliases require native membership; modifier syntax alone is incomplete.
function declarationExportPresence(node: Node): boolean {
  if (!(Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node))) {
    throw new Error("native declaration export demand requires an interface or type-alias declaration");
  }
  return node.isExported();
}

function captureTypeDeclarationProjection(node: Node, type: Type, plan: TypeProjectionPlan): NativeTypeProjection {
  const symbol = plan.facets.includes("lexical") ? node.getSymbol() : undefined;
  return {
    ...(plan.facets.includes("member-declarations")
      ? {
          "member-declarations": plan.properties.map((name) => ({
            name,
            origin: resolveTypePropertyOrigin(node, name),
            raw: type.getProperty(name)?.getDeclarations() ?? null,
            nonnullable: type.getNonNullableType().getProperty(name)?.getDeclarations() ?? null,
          })),
        }
      : {}),
    ...(plan.facets.includes("lexical")
      ? {
          lexical: {
            value: resolveLexicalValueDeclaration(node),
            declarations: symbol?.getDeclarations() ?? null,
            origins: (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? null,
          },
        }
      : {}),
  };
}

/** Observe only the closed facets requested by a native compiler owner. */
export function captureTypeProjection(node: Node, input: TypeProjectionPlan): NativeTypeProjection {
  const plan = canonicalTypeProjectionPlan(input);
  const type = node.getType();
  const facts: NativeTypeProjection = {
    ...captureTypeDeclarationProjection(node, type, plan),
    ...(plan.facets.includes("vocabulary") ? { vocabulary: captureTypeVocabulary(type) } : {}),
    ...(plan.facets.includes("declaration-export") ? { "declaration-export": declarationExportPresence(node) } : {}),
    ...(plan.facets.includes("origins") ? { origins: captureTypeOriginProjection(node) } : {}),
    ...(plan.facets.includes("runtime-undefined") ? { "runtime-undefined": runtimeUndefinedValue(node) } : {}),
    ...(plan.facets.includes("string-index") ? { "string-index": type.getStringIndexType() !== undefined } : {}),
    ...(plan.facets.includes("properties") ? { properties: plan.properties.map((name) => ({ name, present: type.getProperty(name) !== undefined })) } : {}),
    ...(plan.facets.includes("call-signatures") ? { "call-signatures": type.getCallSignatures().length > 0 } : {}),
    ...(plan.facets.includes("scalar")
      ? {
          scalar: {
            stringLiterals: [type, ...type.getUnionTypes()].flatMap((part) => {
              const literal = part.isStringLiteral() ? part.getLiteralValue() : undefined;
              return typeof literal === "string" ? [literal] : [];
            }),
            nonNullableObject: type.getNonNullableType().isObject(),
            any: type.isAny(),
            unknown: type.isUnknown(),
          },
        }
      : {}),
    ...(plan.facets.includes("type-identity") ? { "type-identity": resolveTypeIdentityOrigin(node) } : {}),
    ...(plan.facets.includes("type-symbol") ? { "type-symbol": type.getSymbol()?.getDeclarations() ?? null } : {}),
  };
  assertTypeProjectionCoverage(facts, plan);
  return facts;
}

/** Complete native property/union observations retain compiler ordering without classifying key sets. */
export function captureTypeVocabulary(type: Type): NativeTypeVocabulary {
  return {
    properties: type.getProperties().map((property) => property.getName()),
    arms: (type.isUnion() ? type.getUnionTypes() : [type]).map((arm) => ({
      string: arm.isString(),
      number: arm.isNumber(),
      boolean: arm.isBoolean(),
      literal: arm.isLiteral(),
      array: arm.isArray(),
      tuple: arm.isTuple(),
      null: arm.isNull(),
      undefined: arm.isUndefined(),
      any: arm.isAny(),
      unknown: arm.isUnknown(),
      symbolName: arm.getAliasSymbol()?.getName() ?? arm.getSymbol()?.getName() ?? null,
      stringIndex: arm.getStringIndexType() !== undefined,
      properties: arm.getProperties().map((property) => property.getName()),
    })),
  };
}

function primitiveFlags(type: Type): NativePrimitiveFlags {
  return {
    string: type.isString(),
    stringLiteral: type.isStringLiteral(),
    number: type.isNumber(),
    numberLiteral: type.isNumberLiteral(),
    boolean: type.isBoolean(),
    booleanLiteral: type.isBooleanLiteral(),
    null: type.isNull(),
    undefined: type.isUndefined(),
  };
}

/** The native owner resolves one explicit scalar selector; callers retain its Program admission. */
export function readNativeTypeSelection(selector: NativeTypeSelector, schema: SchemaModel | undefined): Type | undefined {
  let type = selectedBase(selector, schema);
  for (const step of selector.steps) {
    type = type === undefined ? undefined : readNativeTypeSelectionStep(type, step);
  }
  return type;
}

/** The one native transformation implementation also serves a capture's already-read selector prefix. */
export function readNativeTypeSelectionStep(type: Type, step: NativeTypeSelector["steps"][number]): Type | undefined {
  switch (step.kind) {
    case "property":
      return type.getProperty(step.name)?.getTypeAtLocation(step.at);
    case "signature-parameter":
      return type.getCallSignatures()[step.signature]?.getParameters()[step.index]?.getTypeAtLocation(step.at);
    case "nonnullable":
      return type.getNonNullableType();
    case "array-element-or-self":
      return type.getArrayElementType() ?? type;
    case "array-element":
      return type.getArrayElementType();
    case "string-index":
      return type.getStringIndexType();
    case "number-index":
      return type.getNumberIndexType();
    case "type-argument":
      return type.getTypeArguments()[step.index];
    case "call-return":
      return type.getCallSignatures()[step.index]?.getReturnType();
    case "tuple-member":
      return type.getTupleElements()[step.index];
    case "union-part":
      return type.getUnionTypes()[step.index];
    case "intersection-part":
      return type.getIntersectionTypes()[step.index];
  }
}

function selectedBase(selector: NativeTypeSelector, schema: SchemaModel | undefined): Type | undefined {
  const base = selector.base;
  if (base.kind === "schema-column") {
    const column = schema?.tables.flatMap((table) => table.columns).find((candidate) => candidate.identity.key === base.column);
    if (column === undefined) {
      throw new Error("native schema Type selector has no complete column owner");
    }
    return column.typeOverride?.type;
  }
  if (base.kind === "contextual") {
    if (!Node.isExpression(base.node)) {
      throw new Error("native contextual Type selector is not an expression");
    }
    return base.node.getContextualType();
  }
  if (base.kind === "return") {
    if (!Node.isFunctionLikeDeclaration(base.node)) {
      throw new Error("native return Type selector is not function-like");
    }
    return base.node.getReturnType();
  }
  if (base.kind === "resolved-parameter") {
    if (!Node.isCallExpression(base.node)) {
      throw new Error("native parameter Type selector is not a call");
    }
    return readNativeSignatureSlots(base.node)?.parameters[base.index]?.getType();
  }
  if (base.kind === "call-parameter") {
    if (!Node.isCallExpression(base.node)) {
      throw new Error("native instantiated parameter Type selector is not a call");
    }
    return base.node.getProject().getTypeChecker().getResolvedSignature(base.node)?.getParameters()[base.index]?.getTypeAtLocation(base.node);
  }
  return base.node.getType();
}

/** One actual signature question; parameter Types remain local to the supplying native capture. */
export function readNativeSignatureSlots(call: Node): { readonly declaration: Node; readonly parameters: readonly Node[] } | undefined {
  if (!Node.isCallExpression(call)) {
    throw new Error("native signature slot demand is not a call");
  }
  const declaration = call.getProject().getTypeChecker().getResolvedSignature(call)?.getDeclaration();
  return declaration === undefined ? undefined : { declaration, parameters: Node.isFunctionLikeDeclaration(declaration) ? declaration.getParameters() : [] };
}

interface NativeSelectionAnswers {
  readonly program: ts.Program;
  readonly selectors: readonly NativeTypeSelector[];
  readonly values: readonly (Type | undefined)[];
}

/** Factory-internal native answers retain their exact ordered query and owner; guards are not a semantic certificate. */
function captureSelections<Value extends NativeScalarSelectedType>(
  plan: NativeTypeSelectionPlan,
  projectValue: (type: Type, value: NativeScalarSelectedType, identityOf: (type: Type) => number | null) => Value,
  schemaOwner?: { readonly value: SchemaModel; readonly program: ts.Program },
  nativeAnswers?: NativeSelectionAnswers,
): { readonly plan: NativeTypeSelectionPlan; readonly values: readonly (Value | null)[]; readonly relations: NativeScalarTypeSelections["relations"] } {
  const schema = schemaOwner?.value;
  const schemaNodes =
    schema?.tables.flatMap((table) => [table.declaration, table.call, ...table.columns.flatMap((column) => column.typeOverride?.node ?? [])]) ?? [];
  const nodes = [
    ...schemaNodes,
    ...plan.selectors.flatMap((selector) => [
      ...(selector.base.kind === "schema-column" ? [] : [selector.base.node]),
      ...(selector.displayAt === null ? [] : [selector.displayAt]),
      ...selector.steps.flatMap((step) => (step.kind === "property" || step.kind === "signature-parameter" ? [step.at] : [])),
    ]),
  ];
  const first = nodes[0];
  if (first === undefined) {
    throw new Error("native Type selection has no captured owner");
  }
  const project = first.getProject();
  const program = project.getProgram().compilerObject;
  const captured = nodes.map((node) => ({ node, native: node.compilerNode, source: node.getSourceFile(), compilerSource: node.getSourceFile().compilerNode }));
  const assertCurrent = (): void => {
    if (
      (schemaOwner !== undefined && schemaOwner.program !== program) ||
      (nativeAnswers !== undefined &&
        (nativeAnswers.program !== program ||
          nativeAnswers.values.length !== plan.selectors.length ||
          nativeAnswers.selectors.length !== plan.selectors.length ||
          plan.selectors.some((selector, index) => nativeAnswers.selectors[index] !== selector))) ||
      project.getProgram().compilerObject !== program ||
      captured.some(
        ({ node, native, source, compilerSource }) =>
          node.wasForgotten() ||
          source.wasForgotten() ||
          node.getProject() !== project ||
          node.compilerNode !== native ||
          source.compilerNode !== compilerSource ||
          program.getSourceFile(source.getFilePath()) !== compilerSource,
      )
    ) {
      throw new Error("native Type selections belong to a foreign or changed Program/source epoch");
    }
  };
  assertCurrent();
  const types = nativeAnswers?.values ?? plan.selectors.map((selector) => readNativeTypeSelection(selector, schema));
  const checker = readAssignabilityChecker(project.getTypeChecker());
  const identities = new Map<ts.Type, number>();
  for (const [index, type] of types.entries()) {
    if (type !== undefined && !identities.has(type.compilerType)) {
      identities.set(type.compilerType, index);
    }
  }
  const identityOf = (type: Type): number | null => identities.get(type.compilerType) ?? null;
  const facts = {
    plan,
    values: types.map((type, index) => {
      if (type === undefined) {
        return null;
      }
      const selector = plan.selectors[index];
      if (selector === undefined) {
        throw new Error("native Type selector is unavailable");
      }
      const at = selector.displayAt ?? (selector.base.kind === "schema-column" ? undefined : selector.base.node);
      return projectValue(
        type,
        {
          any: type.isAny(),
          unknown: type.isUnknown(),
          identity: identities.get(type.compilerType) ?? index,
          display: selector.displayAt === null ? null : type.getText(at),
        },
        identityOf,
      );
    }),
    relations: plan.relations.map(({ left, right }): NativeScalarTypeSelections["relations"][number] => {
      const x = types[left];
      const y = types[right];
      if (x === undefined || y === undefined) {
        return { kind: "absent" };
      }
      return checker === undefined ? { kind: "unavailable", reason: "primitive-absent" } : { kind: "answer", value: readNativeTypeRelation(checker, x, y) };
    }),
  };
  assertScalarTypeSelectionCoverage(facts);
  assertCurrent();
  return facts;
}

/** Scalar identity/relations share native admission with full projections but never request vocabulary. */
export function captureScalarTypeSelections(plan: NativeTypeSelectionPlan, nativeAnswers?: NativeSelectionAnswers): NativeScalarTypeSelections {
  return captureSelections(plan, (_type, value) => value, undefined, nativeAnswers);
}

/** Every selected Type and relation belongs to one admitted Project; catalog Types never cross worlds. */
export function captureTypeSelections(
  plan: NativeTypeSelectionPlan,
  schemaOwner?: { readonly value: SchemaModel; readonly program: ts.Program },
  nativeAnswers?: NativeSelectionAnswers,
): NativeTypeSelections {
  const facts = captureSelections<NativeSelectedType>(
    plan,
    (type, value, identityOf) => ({
      ...value,
      parts: (type.isIntersection() ? [type, ...type.getIntersectionTypes()] : [type]).map((part) => ({
        identity: identityOf(part),
        aliasName: part.getAliasSymbol()?.getName() ?? null,
        aliasArguments: part.getAliasTypeArguments().map(identityOf),
      })),
      vocabulary: captureTypeVocabulary(type),
      arms: (type.isUnion() ? type.getUnionTypes() : [type]).map((arm) => {
        const element = arm.getArrayElementType();
        return { flags: primitiveFlags(arm), arrayElement: element === undefined ? null : primitiveFlags(element) };
      }),
    }),
    schemaOwner,
    nativeAnswers,
  );
  assertTypeSelectionCoverage(facts);
  return facts;
}
