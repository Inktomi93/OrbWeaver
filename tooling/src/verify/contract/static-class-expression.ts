import type { Node } from "ts-morph";

export interface StaticClassSegment {
  readonly node: Node;
  readonly valueStart: number;
  readonly valueEnd: number;
  /** Absolute source position corresponding to valueStart. */
  readonly sourceStart: number;
}

export interface StaticClassCandidate {
  readonly value: string;
  readonly segments: readonly StaticClassSegment[];
  /** Carrier/composer roots whose values include this producer-anchored candidate. */
  readonly consumers: readonly Node[];
}

export interface RuntimeClassPrefix {
  readonly prefix: string;
  readonly segments: readonly StaticClassSegment[];
}

interface StaticClassUnresolved {
  readonly node: Node;
  readonly reason: string;
}

interface StaticClassOpaque {
  readonly node: Node;
  readonly reason: string;
}

export interface StaticClassWalk {
  readonly roots: number;
  readonly candidates: readonly StaticClassCandidate[];
  readonly runtimePrefixes: readonly RuntimeClassPrefix[];
  readonly unresolved: readonly StaticClassUnresolved[];
  readonly opaque: readonly StaticClassOpaque[];
}

export type StaticClassEvaluation = Omit<StaticClassWalk, "roots">;

interface StaticObjectProperty {
  readonly name: string;
  readonly node: Node;
  readonly value: Node;
  readonly consumer: Node;
}

export interface StaticObjectPropertyEvaluation {
  readonly properties: readonly StaticObjectProperty[];
  readonly unresolved: readonly StaticClassUnresolved[];
  readonly opaque: readonly StaticClassOpaque[];
}

export interface StaticValue {
  readonly value: string;
  readonly segments: readonly StaticClassSegment[];
}

const COMPOSERS = ["join", "tv", "cva", "tv-factory", "join-factory"] as const;
export type Composer = (typeof COMPOSERS)[number];
