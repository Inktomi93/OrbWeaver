import type { Node, SourceFile } from "ts-morph";

export type StaticClassSourceIndex = ReadonlyMap<string, SourceFile>;

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
  readonly consumers: readonly Node[];
}

/** @public knip type-face false positive — a structural field (`unresolved`) of the exported `StaticClassWalk` shape,
 *  never referenced by its own name at any call site. */
export interface StaticClassUnresolved {
  readonly node: Node;
  readonly reason: string;
}

/** @public knip type-face false positive — a structural field (`opaque`) of the exported `StaticClassWalk` shape, never
 *  referenced by its own name at any call site. */
export interface StaticClassOpaque {
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

/** @public knip type-face false positive — the one-home vocabulary tuple behind the exported `StaticClassCarrierKind` union (line
 *  70) — the ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite
 *  the re-spell `no-inline-union-redecl` exists to stop. */
export const STATIC_CLASS_CARRIER_KINDS = ["jsx-class", "jsx-spread", "class-property", "composer"] as const;
/** @public knip type-face false positive — a structural field (`kind`) of the exported `StaticClassCarrierFact` shape,
 *  never referenced by its own name at any call site. */
export type StaticClassCarrierKind = (typeof STATIC_CLASS_CARRIER_KINDS)[number];

export interface StaticClassCarrierFact {
  readonly kind: StaticClassCarrierKind;
  readonly node: Node;
  readonly composer?: Extract<Composer, "join" | "tv" | "cva">;
}

export interface StaticClassTokenFact {
  readonly value: string;
  /** Every authored source slice forming this token; a concatenated token may have more than one. */
  readonly segments: readonly StaticClassSegment[];
  readonly consumers: readonly Node[];
}

export interface StaticJsxStylePropertyFact {
  readonly attribute: Node;
  readonly name: string;
  readonly nameNode: Node;
  readonly value: import("./static-authored-value.ts").StaticAuthoredValue;
}

/** Invocation-local facts produced only from nodes delivered by the shared policy walk. */
export interface StaticClassFactResult extends StaticClassEvaluation {
  readonly roots: number;
  /** Class derivation only; `unresolved` also includes supplemental JSX style/object diagnostics. */
  readonly classUnresolved: readonly StaticClassUnresolved[];
  readonly carriers: readonly StaticClassCarrierFact[];
  readonly tokens: readonly StaticClassTokenFact[];
  readonly styleProperties: readonly StaticJsxStylePropertyFact[];
}
