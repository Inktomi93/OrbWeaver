// Zod factory call provenance through the canonical module-member reader. Unresolved calls are not proven origins.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readMemberReference, referenceResolutionServices, resolveModuleMemberOrigin } from "./reference-fact.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { declaredByPackage } from "./type-member-origin.ts";
import { resolved, resolveTypePropertyOrigin, unresolved } from "./type-member-origin-core.ts";

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

/** Canonical factory ownership preserves unresolved module and nested-property provenance separately from another identity. */
export function resolveFactoryCallFromPackage(node: MorphNode, method: string | ReadonlySet<string>, packageName: string): ReferenceFact<boolean> {
  const expression = referenceResolutionServices.unwrapExpression(node);
  if (!Node.isCallExpression(expression)) {
    return resolved(false, expression, []);
  }
  const origin = resolveModuleMemberOrigin(expression.getExpression());
  if (origin.kind === "unresolved") {
    return origin;
  }
  if (origin.value.canonical.kind !== "project") {
    return unresolved("missing", expression, `the checker resolved no factory declaration through package door ${origin.value.canonical.moduleSpecifier}`);
  }
  const { memberPath, canonical } = origin.value;
  const terminal = memberPath.at(-1) ?? canonical.exportedName;
  if (!(typeof method === "string" ? terminal === method : method.has(terminal))) {
    return { ...origin, value: false };
  }
  const property = memberPath.length === 0 ? undefined : resolveTypePropertyOrigin(canonical.declaration, memberPath);
  if (property?.kind === "unresolved") {
    return property;
  }
  const declarations = property?.value ?? [canonical.declaration];
  return resolved(
    declaredByPackage(declarations, packageName) &&
      declarations.every((declaration) => !Node.isSourceFile(declaration) && declaration.getType().getCallSignatures().length > 0),
    expression,
    [...origin.trace.declarations, ...declarations],
  );
}

/** Positive-only consumers require proven ownership; false is not a negative provenance fact. */
export function isFactoryCallFromPackage(node: MorphNode, method: string | ReadonlySet<string>, packageName: string): boolean {
  const fact = resolveFactoryCallFromPackage(node, method, packageName);
  return fact.kind === "resolved" && fact.value;
}
