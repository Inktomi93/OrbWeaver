// Invocation-local semantic identities returned by the shared bus fact reader.
import type { Node } from "ts-morph";
import type { GatePolicyContext, GatePolicyVisitor } from "./policy.ts";

export const BUS_FACT_STATUSES = ["ready", "missing", "empty", "unresolved"] as const;
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

export interface BusCoveragePolicyIdentity {
  readonly id: string;
  readonly family: string;
  readonly anchor: BusAnchor;
}

export interface BusConsumerIdentity {
  readonly bus: BusDeclarationIdentity;
  readonly kind: "client-total-map" | "server-exhaustive";
  readonly owner: BusDeclarationIdentity;
  readonly anchor: BusAnchor;
}

export interface BusRecord {
  readonly union: BusUnionIdentity;
  readonly belt: BusBeltIdentity | null;
  readonly declaredMembers: readonly BusMemberIdentity[];
  readonly emitters: readonly BusEmitterIdentity[];
  readonly consumers: readonly BusConsumerIdentity[];
  readonly coveragePolicy: BusCoveragePolicyIdentity | null;
}

export interface BusUnresolvedIdentity {
  readonly stage: "union" | "belt" | "member" | "emitter" | "consumer" | "coverage-policy";
  readonly reason: "unsupported" | "dynamic" | "write" | "cycle" | "ambiguous" | "missing";
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
  readonly consumers: number;
  readonly coveragePolicies: number;
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

export interface BusFactQuery<CoveredBus = never> {
  /** Compile-time ownership witness used by coverage policies; intentionally absent at runtime. */
  readonly coveredBusType?: CoveredBus;
  readonly visitors: readonly GatePolicyVisitor[];
  /** Idempotent: one semantic computation is retained by this policy invocation's `create` closure. */
  readonly finish: () => BusFact;
}

export function busByUnion(fact: BusFact, selector: BusDeclarationIdentity): BusRecord | undefined {
  return fact.buses.find(({ union }) => union.path === selector.path && union.exportName === selector.exportName);
}

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
