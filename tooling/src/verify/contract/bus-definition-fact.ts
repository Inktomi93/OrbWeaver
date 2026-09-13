// Invocation-local semantic identities returned by the shared bus DEFINITION readers. Distinct from
// `bus-fact.ts` on purpose: producer coverage asks "who emits this member", definition asks "does this bus
// carry its declared belts". The producer fact deliberately dropped consumer/coverage fields once — they
// caused false `LIVE_ONLY_CHAT_EVENT_TYPES` refusals and made every producer run pay for them — so the
// definition model is its own provider with its own population, receipt and refusals.
import type { BusAnchor, BusDeclarationIdentity, BusUnresolvedIdentity } from "./bus-fact.ts";

export interface BusBeltShape {
  readonly exportName: string;
  readonly path: string;
  /** `object` = `{ … } satisfies Record<U["type"], true>`; `tuple` = `[…] as const satisfies readonly U["type"][]`. */
  readonly shape: "object" | "tuple";
  /** The AUTHORED keys/elements, in source order — not the type's normalized view. */
  readonly members: readonly string[];
  readonly anchor: BusAnchor;
}

export interface BusUnionDefinition {
  readonly union: BusDeclarationIdentity;
  readonly anchor: BusAnchor;
  /** The union's OWN discriminators, read from its resolved type: an `Exclude<>`/`Extract<>`/spliced
   *  sub-union answers here exactly like a hand-written union, which is what retires a name table. */
  readonly discriminators: readonly string[];
  readonly belt: BusBeltShape | null;
  /** Belted unions whose discriminator set CONTAINS this one's — a derived sub-union is already belted by
   *  its root, so it owes no belt of its own. Empty for a root union. */
  readonly beltedRoots: readonly BusDeclarationIdentity[];
  /** Client-side mapped-type/Record total maps keyed by this union's discriminator, by declaration home. */
  readonly clientTotalMaps: readonly string[];
  /** Server-side exhaustive consumers: a `never`-parameter guard call whose subject is THIS union. */
  readonly exhaustiveConsumers: readonly string[];
}

/** @public knip type-face false positive — a structural field (`receipt`) of the exported `BusDefinitionFact` shape,
 *  never referenced by its own name at any call site. */
export interface BusDefinitionFactReceipt {
  readonly source: "bus-definition-fact";
  readonly unions: number;
  readonly belts: number;
  readonly members: number;
  readonly clientMaps: number;
  readonly exhaustiveConsumers: number;
  readonly unresolved: number;
}

export interface BusDefinitionFact {
  readonly definitions: readonly BusUnionDefinition[];
  readonly unresolved: readonly BusUnresolvedIdentity[];
  readonly receipt: BusDefinitionFactReceipt;
}
