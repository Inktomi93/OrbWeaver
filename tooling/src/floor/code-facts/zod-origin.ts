// Zod factory call provenance through the canonical module-member reader. Unresolved calls are not proven origins.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readMemberReference, referenceResolutionServices, resolveModuleMemberOrigin } from "./reference-fact.ts";
import { declaredByPackage } from "./type-member-origin.ts";
import { resolveTypePropertyOrigin } from "./type-member-origin-core.ts";

/** The installed package door shared by shape and Zod ownership policies. */
export const ZOD_PACKAGE = "zod";

/** The member a candidate call names, with the node a finding anchors on — a prefilter, never the verdict. */
export interface ZodCandidateCall {
  readonly name: string;
  readonly nameNode: MorphNode;
}

/** Candidate factory name and authored anchor; resolution still decides package ownership. */
export function zodCandidateCall(node: MorphNode): ZodCandidateCall | undefined {
  const expression = referenceResolutionServices.unwrapExpression(node);
  if (!Node.isCallExpression(expression)) {
    return;
  }
  const callee = referenceResolutionServices.unwrapExpression(expression.getExpression());
  if (Node.isIdentifier(callee)) {
    return { name: callee.getText(), nameNode: callee };
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" ? { name: member.value.name, nameNode: member.value.nameNode } : undefined;
}

/** A factory's canonical terminal, not its local alias, decides membership in the caller's method set. */
export function isFactoryCallFromPackage(node: MorphNode, method: string | ReadonlySet<string>, packageName: string): boolean {
  const expression = referenceResolutionServices.unwrapExpression(node);
  if (!Node.isCallExpression(expression)) {
    return false;
  }
  const origin = resolveModuleMemberOrigin(expression.getExpression());
  if (origin.kind === "unresolved" || origin.value.canonical.kind !== "project") {
    return false;
  }
  const { memberPath, canonical } = origin.value;
  const terminal = memberPath.at(-1) ?? canonical.exportedName;
  if (!(typeof method === "string" ? terminal === method : method.has(terminal))) {
    return false;
  }
  const property = memberPath.length === 0 ? undefined : resolveTypePropertyOrigin(canonical.declaration, memberPath);
  if (property?.kind === "unresolved") {
    return false;
  }
  const declarations = property?.value ?? [canonical.declaration];
  return (
    declaredByPackage(declarations, packageName) &&
    declarations.every((declaration) => !Node.isSourceFile(declaration) && declaration.getType().getCallSignatures().length > 0)
  );
}
