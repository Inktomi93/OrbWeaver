// Named-member Type reads that a closure question plans and its replay reader repeats with the same selectors.
import { Node } from "ts-morph";
import type { ObservedLiteralValue, TypeObservationQuestion, TypeObservationReader } from "./type-observations-contract.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import { nodeTypeSelector } from "./type-projection-contract.ts";

function memberSelector(selector: NativeTypeSelector, name: string, at: Node): NativeTypeSelector {
  return { ...selector, steps: [...selector.steps, { kind: "property", name, at }] };
}

/** The constituents a member-presence read inspects: each union part of `node`'s Type, else that Type. */
export function memberReceivers(readers: TypeObservationReader, node: Node): readonly NativeTypeSelector[] {
  const selector = nodeTypeSelector(node);
  const unions = readers.unions(selector);
  return unions.length === 0 ? [selector] : unions;
}

export function hasMember(readers: TypeObservationReader, receiver: NativeTypeSelector, name: string, at: Node): boolean {
  return readers.select(memberSelector(receiver, name, at)) !== null;
}

/** The literal value of each union part of member `name` on `node`'s own Type; empty when the member is absent. */
export function memberLiteralValues(readers: TypeObservationReader, node: Node, name: string): readonly (ObservedLiteralValue | undefined)[] {
  const selector = memberSelector(nodeTypeSelector(node), name, node);
  if (readers.select(selector) === null) {
    return [];
  }
  const unions = readers.unions(selector);
  return (unions.length === 0 ? [selector] : unions).map((part) => readers.literalValue(part));
}

/** Plans a closure question's member reads at one closure value node, through the reads its reader repeats. */
export function observeClosureMembers(node: Node, question: TypeObservationQuestion, readers: TypeObservationReader): void {
  if (readers.select(nodeTypeSelector(node)) === null) {
    return;
  }
  if (Node.isCallExpression(node)) {
    for (const name of question.callLiteralMembers ?? []) {
      memberLiteralValues(readers, node, name);
    }
  }
  const presence = question.presenceMembers ?? [];
  for (const receiver of presence.length === 0 ? [] : memberReceivers(readers, node)) {
    for (const name of presence) {
      hasMember(readers, receiver, name, node);
    }
  }
}
