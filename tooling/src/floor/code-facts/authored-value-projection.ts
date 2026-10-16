// Root provenance and complete field readability are independent native facts.
import type { Node } from "ts-morph";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { readStaticAuthoredValue, resolveAuthoredComposite } from "./static-authored-value.ts";
import type { StaticAuthoredValue } from "./static-authored-value-contract.ts";

export interface NativeAuthoredValueProjection {
  readonly value: ReferenceFact<StaticAuthoredValue>;
  readonly composite: ReferenceFact<Node>;
}

/** Capture both canonical answers on one admitted native value, without treating field refusal as root refusal. */
export function captureAuthoredValueProjection(node: Node): NativeAuthoredValueProjection {
  return { value: readStaticAuthoredValue(node), composite: resolveAuthoredComposite(node) };
}
