// Shared ambient clock/entropy classification and closed native demand for its two consumers.
// Candidate-source binding/key syntax closes the canonical name/refusal algorithms before seal.
// Native facts establish ambient identity; policy judgments remain in the verifier.

import { computedNameNeedsBindings, referenceResolutionServices, resolveGlobalMemberOrigin } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { AmbientInvocationVerdict, AmbientReferenceServices, AmbientSource } from "../contract/ambient-determinism.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

/** The callee of a call/construct expression, or `undefined` when the node is neither. */
export function invocationCallee(node: MorphNode): MorphNode | undefined {
  return Node.isCallExpression(node) || Node.isNewExpression(node) ? node.getExpression() : undefined;
}

/** A conservative preparation filter keeps binding-dependent keys without resolving syntax symbols. */
export function possibleAmbientCall(node: MorphNode, name: string): boolean {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  if (Node.isIdentifier(callee)) {
    return callee.getText() === name;
  }
  if (!(Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee))) {
    return false;
  }
  if (Node.isElementAccessExpression(callee)) {
    const key = callee.getArgumentExpression();
    if (key !== undefined && computedNameNeedsBindings(key)) {
      return true;
    }
  }
  const member = referenceResolutionServices.readMemberReference(callee);
  return member.kind === "resolved" && member.value.name === name;
}

/** Resolve one invocation's callee against a closed set of ambient sources. */
export function readAmbientInvocation(node: MorphNode, sources: readonly AmbientSource[], services?: AmbientReferenceServices): AmbientInvocationVerdict {
  const callee = invocationCallee(node);
  if (callee === undefined) {
    return { kind: "unreadable", reason: "unsupported", detail: `${node.getKindName()} is not a call or construct expression` };
  }
  const origin = services === undefined ? resolveGlobalMemberOrigin(callee) : services.globalOrigin(callee);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, callee, services?.declarations) === "other"
      ? { kind: "other" }
      : { kind: "unreadable", reason: origin.reason, detail: origin.detail };
  }
  const match = sources.find((source) => source.globalName === origin.value.globalName && samePath(source.memberPath, origin.value.memberPath));
  return match === undefined ? { kind: "other" } : { kind: "ambient", source: match };
}
