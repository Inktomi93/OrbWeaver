// Legacy bus-coverage descriptor retained only while the blocked user-bus policy lacks a ruled work item.
// The final shared fact contract lives in bus-fact.ts and has no dependency on this migration residue.
type BusKeyShape = "object" | "array";

export interface BusCoverageSpec {
  readonly contractsFile: RegExp;
  readonly typesConst: string;
  readonly keyShape: BusKeyShape;
  readonly reportFile: string;
  readonly deferred: Record<string, string>;
  readonly missingPrefix: string;
  readonly stalePrefix: string;
  readonly emitScope?: RegExp;
}

export type {
  BusAnchor,
  BusBeltIdentity,
  BusDeclarationIdentity,
  BusEmitterIdentity,
  BusFact,
  BusFactQuery,
  BusFactReceipt,
  BusFactStatus,
  BusMemberIdentity,
  BusNonReadyFact,
  BusOperationIdentity,
  BusReadyFact,
  BusRecord,
  BusUnionIdentity,
  BusUnresolvedIdentity,
} from "./bus-fact.ts";
