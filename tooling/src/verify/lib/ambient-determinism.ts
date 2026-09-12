// One reader for "does this invocation reach an AMBIENT time/entropy source" — the shared half of
// `no-raw-clock` and `no-raw-random`.
//
// Both policies stood on the SPELLING of a callee (`expr.getText() === "Date.now"` /
// `=== "Math.random"`), which a local shadow false-reds and an alias, a namespace member, a
// computed-literal member or a const chain walks straight past. The determinism law is about the
// IDENTITY of the source: the ambient `Date`/`Math` the checker resolved from TypeScript's own lib
// declarations, whatever the consumer called it. `resolveGlobalMemberOrigin` answers exactly that, and
// `classifyOriginRefusal` owns the two meanings of its refusal (a proven local binding is a DIFFERENT
// source and passes; an unreadable one is reported).
//
// A pure function over nodes the dispatcher delivered: no walk, no Project, no cache, no filesystem.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import type { AmbientInvocationVerdict, AmbientSource } from "../contract/ambient-determinism.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { resolveGlobalMemberOrigin } from "./reference-fact.ts";

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

/** The callee of a call/construct expression, or `undefined` when the node is neither. */
export function invocationCallee(node: MorphNode): MorphNode | undefined {
  return Node.isCallExpression(node) || Node.isNewExpression(node) ? node.getExpression() : undefined;
}

/** Resolve one invocation's callee against a closed set of ambient sources. */
export function readAmbientInvocation(node: MorphNode, sources: readonly AmbientSource[]): AmbientInvocationVerdict {
  const callee = invocationCallee(node);
  if (callee === undefined) {
    return { kind: "unreadable", reason: "unsupported", detail: `${node.getKindName()} is not a call or construct expression` };
  }
  const origin = resolveGlobalMemberOrigin(callee);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, callee) === "other" ? { kind: "other" } : { kind: "unreadable", reason: origin.reason, detail: origin.detail };
  }
  const match = sources.find((source) => source.globalName === origin.value.globalName && samePath(source.memberPath, origin.value.memberPath));
  return match === undefined ? { kind: "other" } : { kind: "ambient", source: match };
}
