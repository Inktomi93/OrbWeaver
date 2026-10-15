// Policy adapters consume captured facts without re-resolving syntax-carrier meaning.
import type { Node } from "ts-morph";
import type { NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import type { ModuleOriginServices } from "../contract/origin-verdict.ts";

export function requiredInvocationFact<T>(facts: ReadonlyMap<Node, T>, node: Node): T {
  const value = facts.get(node);
  if (value === undefined) {
    throw new Error("native invocation facet is unavailable for its requested value");
  }
  return value;
}
export function invocationOriginServices(evidence: NativeInvocationEvidence): ModuleOriginServices {
  return {
    declarations: evidence.declarations,
    readComputedName: evidence.computedName,
    moduleOrigin: (node) => requiredInvocationFact(evidence.modules, node),
  };
}
