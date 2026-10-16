// The caller supplies an admitted native node; this producer captures finite observations, never Types or Symbols.
import { Node } from "ts-morph";
import { runtimeUndefinedValue } from "./call-supplied.ts";
import { resolveTypeIdentityOrigin } from "./type-member-origin.ts";
import { captureTypeOriginProjection } from "./type-origin-projection.ts";
import type { NativeTypeProjection, TypeProjectionPlan } from "./type-projection-contract.ts";
import { assertTypeProjectionCoverage, canonicalTypeProjectionPlan } from "./type-projection-contract.ts";

// Export-list/default aliases require native membership; modifier syntax alone is incomplete.
function declarationExportPresence(node: Node): boolean {
  if (!(Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node))) {
    throw new Error("native declaration export demand requires an interface or type-alias declaration");
  }
  return node.isExported();
}

/** Observe only the closed facets requested by a native compiler owner. */
export function captureTypeProjection(node: Node, input: TypeProjectionPlan): NativeTypeProjection {
  const plan = canonicalTypeProjectionPlan(input);
  const type = node.getType();
  const facts: NativeTypeProjection = {
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
