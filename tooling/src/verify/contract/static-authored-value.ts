// Statically authored values retain their source anchors; this is source shape, not a JavaScript evaluator.
import type { Node } from "ts-morph";

export type StaticAuthoredScalar = string | number | boolean | null;

/** @public knip type-face false positive — an arm of the exported `StaticAuthoredValue` union, reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface StaticAuthoredScalarValue {
  readonly kind: "scalar";
  readonly value: StaticAuthoredScalar;
  readonly node: Node;
}

/** @public knip type-face false positive — an arm of the exported `StaticAuthoredValue` union, reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface StaticAuthoredTupleValue {
  readonly kind: "tuple";
  readonly elements: readonly StaticAuthoredValue[];
  readonly node: Node;
}

export interface StaticAuthoredProperty {
  readonly key: string;
  readonly keyNode: Node;
  readonly value: StaticAuthoredValue;
}

export interface StaticAuthoredObjectValue {
  readonly kind: "object";
  /** Ordered authored entries. Duplicate keys stay distinct so a policy can report either source site. */
  readonly properties: readonly StaticAuthoredProperty[];
  readonly node: Node;
}

export type StaticAuthoredValue = StaticAuthoredScalarValue | StaticAuthoredTupleValue | StaticAuthoredObjectValue;
