// The installed `zod` package's identity — the one subject the `zod-modern-spellings` family judges from two
// sides. `zod-modern-spellings` resolves a CALL's callee through the module door to `zod`;
// `zod-error-issues-home` resolves a PROPERTY's declaration to a file the installed `zod` package declares.
// Both answers name the same package through `ZOD_PACKAGE`, so the family cannot drift into judging two
// different libraries under one name. Identity, never spelling: a project object spelled `z` is not zod.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readMemberReference, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { declaredByPackage } from "./type-member-origin.ts";

const ZOD_PACKAGE = "zod";

/** The member a candidate call names, with the node a finding anchors on — a prefilter, never the verdict. */
export interface ZodCandidateCall {
  readonly name: string;
  readonly nameNode: MorphNode;
}

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

/** Is this call `<zod>.<method>(…)` — the export resolved through the `zod` door, in any spelling? */
export function isZodCall(node: MorphNode, method: string): boolean {
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
  return terminal === method && doors.has(ZOD_PACKAGE);
}

/** Is every declaration of a resolved member declared by the installed `zod` package? */
export function declaredByZod(declarations: readonly MorphNode[]): boolean {
  return declaredByPackage(declarations, ZOD_PACKAGE);
}
