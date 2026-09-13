// Member-spelling normalization for reference-fact.ts.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { MemberReference, ReferenceFact, ReferenceResolutionServices } from "../contract/reference-fact.ts";
import { isReferenceWriteTarget } from "./reference-fact-writes.ts";

type MemberResolutionServices = Pick<ReferenceResolutionServices, "readComputedName" | "unwrapExpression">;

/** Normalize dotted, optional, computed-literal, and namespace-qualified type reads into one fact. */
export function readMemberReferenceWith(node: MorphNode, services: MemberResolutionServices): ReferenceFact<MemberReference> {
  const access = services.unwrapExpression(node);
  if ((Node.isPropertyAccessExpression(access) || Node.isElementAccessExpression(access)) && isReferenceWriteTarget(access)) {
    return {
      kind: "unresolved",
      reason: "write",
      detail: `member ${access.getText()} is an assignment, update, or delete target`,
      node: access,
      trace: { declarations: [], origin: access },
    };
  }
  if (Node.isPropertyAccessExpression(access)) {
    const nameNode = access.getNameNode();
    return {
      kind: "resolved",
      value: { name: access.getName(), receiver: access.getExpression(), nameNode, access },
      trace: { declarations: [], origin: nameNode },
    };
  }
  if (Node.isQualifiedName(access)) {
    const nameNode = access.getRight();
    return {
      kind: "resolved",
      value: { name: nameNode.getText(), receiver: access.getLeft(), nameNode, access },
      trace: { declarations: [], origin: nameNode },
    };
  }
  if (!Node.isElementAccessExpression(access)) {
    return {
      kind: "unresolved",
      reason: "unsupported",
      detail: `${access.getKindName()} is not a member access`,
      node: access,
      trace: { declarations: [], origin: access },
    };
  }
  const argument = access.getArgumentExpression();
  if (argument === undefined) {
    return { kind: "unresolved", reason: "missing", detail: "element access has no key expression", node: access, trace: { declarations: [], origin: access } };
  }
  const name = services.readComputedName(argument);
  return name.kind === "unresolved"
    ? name
    : {
        kind: "resolved",
        value: { name: name.value, receiver: access.getExpression(), nameNode: argument, access },
        trace: name.trace,
      };
}
