// Invocation-local semantic identities returned by the shared bus fact reader.
import type { Node } from "ts-morph";
import type { ReferenceUnresolvedReason } from "../../_shared/reference-fact-contract.ts";
import type { GatePolicyContext } from "./policy.ts";

/** @public knip type-face false positive — the one-home vocabulary tuple behind the exported `BusFactStatus` union — the
 *  ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite the
 *  re-spell `no-inline-union-redecl` exists to stop. */
export const BUS_FACT_STATUSES = ["ready", "missing", "empty", "unresolved"] as const;
/** @public knip type-face false positive — a structural field (`status`) of the exported `BusFactReceipt` shape, never
 *  referenced by its own name at any call site. */
export type BusFactStatus = (typeof BUS_FACT_STATUSES)[number];

export interface BusDeclarationIdentity {
  readonly path: string;
  readonly exportName: string;
}

export interface BusAnchor {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly node: Node;
}

/** @public knip type-face false positive — a structural field (`union`) of the exported `BusRecord` shape, never
 *  referenced by its own name at any call site. */
export interface BusUnionIdentity extends BusDeclarationIdentity {
  readonly anchor: BusAnchor;
}

export interface BusBeltIdentity extends BusDeclarationIdentity {
  readonly union: BusDeclarationIdentity;
  readonly anchor: BusAnchor;
}

export interface BusMemberIdentity {
  readonly bus: BusDeclarationIdentity;
  readonly name: string;
  readonly anchor: BusAnchor;
}

export type BusOperationIdentity =
  | { readonly kind: "module"; readonly module: BusDeclarationIdentity; readonly memberPath: readonly string[] }
  | { readonly kind: "injected"; readonly owner: BusDeclarationIdentity; readonly memberPath: readonly string[] }
  | { readonly kind: "yield"; readonly owner: BusDeclarationIdentity; readonly memberPath: readonly string[] };

export interface BusEmitterIdentity {
  readonly member: BusMemberIdentity;
  readonly operation: BusOperationIdentity;
  readonly anchor: BusAnchor;
}

export interface BusRecord {
  readonly union: BusUnionIdentity;
  readonly belt: BusBeltIdentity | null;
  readonly declaredMembers: readonly BusMemberIdentity[];
  readonly emitters: readonly BusEmitterIdentity[];
}

export interface BusUnresolvedIdentity {
  readonly stage: "union" | "belt" | "member" | "emitter";
  readonly reason: ReferenceUnresolvedReason;
  readonly detail: string;
  readonly expected: BusDeclarationIdentity | null;
  readonly anchor: BusAnchor | null;
}

export interface BusFactReceipt {
  readonly source: "bus-fact";
  readonly status: BusFactStatus;
  readonly unions: number;
  readonly belts: number;
  readonly members: number;
  readonly emitters: number;
  readonly unresolved: number;
}

interface BusFactBase {
  readonly buses: readonly BusRecord[];
  readonly unresolved: readonly BusUnresolvedIdentity[];
  readonly receipt: BusFactReceipt;
}

export interface BusReadyFact extends BusFactBase {
  readonly status: "ready";
}

export interface BusNonReadyFact extends BusFactBase {
  readonly status: Exclude<BusFactStatus, "ready">;
}

export type BusFact = BusReadyFact | BusNonReadyFact;

/** Ordinary/reviewed consumers refuse non-ready facts and register the complete semantic denominator. */
export function recordReadyBusFact(context: GatePolicyContext, fact: BusFact): asserts fact is BusReadyFact {
  if (fact.status !== "ready") {
    throw new Error(describeBusFactFailure(fact));
  }
  context.receipt({ kind: "population", source: fact.receipt.source, members: fact.receipt.members });
}

export function describeBusFactFailure(fact: BusNonReadyFact): string {
  const details = fact.unresolved.map(({ stage, reason, detail }) => `${stage}/${reason}: ${detail}`).join("; ");
  return `bus fact ${fact.status}: ${details || "no readable bus identities"}`;
}

/** The discriminator set one emitter argument's FLOW type carries, or the refusal that read it (#1988).
 *  Raised by `lib/bus-fact-read.ts` and consumed by the bus fact's callers, so it is a cross-boundary shape
 *  and `lib/` is not a type home. */
export type BusTypedDiscriminators =
  | { readonly kind: "resolved"; readonly values: readonly string[] }
  | { readonly kind: "refused"; readonly reason: ReferenceUnresolvedReason; readonly detail: string };

/** Which proven sink an emitter call reaches: the one bus-channel publisher, or an injected callable. */
export type EmitterSinkKind = "channel" | "injected";
