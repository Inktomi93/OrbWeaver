// Zod ownership policy; call provenance is a canonical floor fact.
import type { Node as MorphNode } from "ts-morph";
import { isFactoryCallFromPackage, ZOD_PACKAGE } from "../../floor/code-facts/zod-origin.ts";
import { declaredByPackage } from "./type-member-origin.ts";

const ZOD_POLICY_PACKAGE = ZOD_PACKAGE;

/** Whether the call resolves through the policy's package door, not a same-named local factory. */
export function isZodCall(node: MorphNode, method: string): boolean {
  return isFactoryCallFromPackage(node, method, ZOD_POLICY_PACKAGE);
}

/** Whether every member declaration belongs to the same package the call policy judges. */
export function declaredByZod(declarations: readonly MorphNode[]): boolean {
  return declaredByPackage(declarations, ZOD_POLICY_PACKAGE);
}
