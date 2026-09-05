// Callable-origin normalization over the shared module and ambient-global fact readers.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { CallableOrigin, ReferenceFact, ReferenceOrigin, UnresolvedReferenceFact } from "../contract/reference-fact.ts";
import { readMemberReference, referenceResolutionServices, resolveModuleMemberOrigin } from "./reference-fact.ts";
import { resolveGlobalMemberOriginWith } from "./reference-fact-global.ts";

const INVOCATION_WRAPPERS = new Set(["apply", "bind", "call"]);

function chooseRefusal(moduleFact: UnresolvedReferenceFact, globalFact: UnresolvedReferenceFact): UnresolvedReferenceFact {
  const priority = ["write", "cycle", "ambiguous", "dynamic", "unsupported", "missing"] as const;
  return priority.indexOf(moduleFact.reason) <= priority.indexOf(globalFact.reason) ? moduleFact : globalFact;
}

function invocationWrapper(node: MorphNode): MorphNode | undefined {
  const current = referenceResolutionServices.unwrapExpression(node);
  if (!(Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current))) {
    return;
  }
  const member = readMemberReference(current);
  return member.kind === "resolved" && INVOCATION_WRAPPERS.has(member.value.name) ? member.value.nameNode : undefined;
}

function resolveReferenceOrigin(node: MorphNode): ReferenceFact<ReferenceOrigin> {
  const moduleFact = resolveModuleMemberOrigin(node);
  if (moduleFact.kind === "resolved") {
    return moduleFact;
  }
  const globalFact = resolveGlobalMemberOriginWith(node, referenceResolutionServices);
  return globalFact.kind === "resolved" ? globalFact : chooseRefusal(moduleFact, globalFact);
}

/** Resolve a direct call/new target. Function call/apply/bind spellings refuse until checker-proven. */
export function resolveCallableOrigin(node: MorphNode): ReferenceFact<CallableOrigin> {
  const expression = Node.isCallExpression(node) || Node.isNewExpression(node) ? node.getExpression() : undefined;
  if (expression === undefined) {
    const globalFact = resolveGlobalMemberOriginWith(node, referenceResolutionServices);
    return globalFact.kind === "unresolved"
      ? { ...globalFact, reason: "unsupported", detail: `${node.getKindName()} is not a call or construct expression` }
      : {
          kind: "unresolved",
          reason: "unsupported",
          detail: `${node.getKindName()} is not a call or construct expression`,
          node,
          trace: globalFact.trace,
        };
  }
  const wrapper = invocationWrapper(expression);
  if (wrapper !== undefined) {
    return {
      kind: "unresolved",
      reason: "unsupported",
      detail: `${wrapper.getText()} requires checker-proven Function wrapper identity`,
      node: wrapper,
      trace: { declarations: [], origin: wrapper },
    };
  }
  const callee = referenceResolutionServices.unwrapExpression(expression);
  const target = resolveReferenceOrigin(callee);
  return target.kind === "unresolved"
    ? target
    : {
        kind: "resolved",
        value: { invocation: Node.isNewExpression(node) ? "construct" : "call", target: target.value, callee },
        trace: target.trace,
      };
}
