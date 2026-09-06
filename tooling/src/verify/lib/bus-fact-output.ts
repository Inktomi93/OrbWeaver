// Deterministic immutable projection for the invocation-local bus collector.
import type { BusBeltIdentity, BusEmitterIdentity, BusFact, BusFactReceipt, BusRecord, BusUnresolvedIdentity } from "../contract/bus-fact.ts";
import { busIdentityKey } from "./bus-fact-read.ts";

export interface MutableBusRecord {
  readonly union: BusRecord["union"];
  belt: BusBeltIdentity | null;
  readonly declaredMembers: import("../contract/bus-fact.ts").BusMemberIdentity[];
  readonly emitters: BusEmitterIdentity[];
}

function statusFor(buses: readonly BusRecord[], unresolved: readonly BusUnresolvedIdentity[]): BusFact["status"] {
  if (buses.length === 0) {
    return "empty";
  }
  if (unresolved.some(({ reason }) => reason === "missing")) {
    return "missing";
  }
  return unresolved.length > 0 ? "unresolved" : "ready";
}

export function finishBusFact(records: readonly MutableBusRecord[], unresolved: readonly BusUnresolvedIdentity[]): BusFact {
  const buses: BusRecord[] = records
    .map((record) => ({
      ...record,
      declaredMembers: record.declaredMembers.toSorted((left, right) => left.name.localeCompare(right.name)),
      emitters: record.emitters.toSorted((left, right) => left.anchor.path.localeCompare(right.anchor.path) || left.anchor.line - right.anchor.line),
    }))
    .toSorted((left, right) => busIdentityKey(left.union).localeCompare(busIdentityKey(right.union)));
  const status = statusFor(buses, unresolved);
  const receipt: BusFactReceipt = {
    source: "bus-fact",
    status,
    unions: buses.length,
    belts: buses.filter(({ belt }) => belt !== null).length,
    members: buses.reduce((sum, { declaredMembers }) => sum + declaredMembers.length, 0),
    emitters: buses.reduce((sum, { emitters }) => sum + emitters.length, 0),
    unresolved: unresolved.length,
  };
  return { status, buses, unresolved, receipt } as BusFact;
}
