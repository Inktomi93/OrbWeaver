// Zod factory call provenance through the canonical module-member reader. Unresolved calls are not proven origins.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readMemberReference, resolveModuleMemberOrigin } from "./reference-fact.ts";

/** The installed package door shared by shape and Zod ownership policies. */
export const ZOD_PACKAGE = "zod";

/** The member a candidate call names, with the node a finding anchors on — a prefilter, never the verdict. */
export interface ZodCandidateCall {
  readonly name: string;
  readonly nameNode: MorphNode;
}

/** Candidate factory name and authored anchor; resolution still decides package ownership. */
export function zodCandidateCall(node: MorphNode): ZodCandidateCall | undefined {
  if (!Node.isCallExpression(node)) {
    return;
  }
  const callee = node.getExpression();
  if (Node.isIdentifier(callee)) {
    return { name: callee.getText(), nameNode: callee };
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" ? { name: member.value.name, nameNode: member.value.nameNode } : undefined;
}

/** Is this factory call resolved through the specified package door, in any supported spelling? */
export function isFactoryCallFromPackage(node: MorphNode, method: string, packageName: string): boolean {
  const candidate = zodCandidateCall(node);
  if (candidate?.name !== method || !Node.isCallExpression(node)) {
    return false;
  }
  const origin = resolveModuleMemberOrigin(node.getExpression());
  if (origin.kind === "unresolved") {
    return false;
  }
  const { moduleSpecifier, exportedName, memberPath, canonical } = origin.value;
  const terminal = memberPath.at(-1) ?? exportedName;
  const doors = new Set<string>([moduleSpecifier, ...(canonical.kind === "external-door" ? [canonical.moduleSpecifier] : [])]);
  return terminal === method && doors.has(packageName);
}
