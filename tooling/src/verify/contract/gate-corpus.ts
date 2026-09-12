// The MIXED gate corpus (docs/design/gate-runtime-standardization.md §1/§5): what one load of
// `tooling/src/verify/gates/*.ts` SAW, classified by exact contract identity — a branded `defineGate` result is a
// final `GatePolicy`, a validated `GateDescriptor` is legacy, a module exporting no `gate` is recorded as
// unregistered, and anything else refuses at load (lib/loader.ts). Every module lands in exactly one roster row;
// `files.length === legacy.length + final.length + unregistered.length` is the accounting the structure run
// manifest reconciles (contract/run-manifest.ts, #410).
//
// This is the loader/dispatcher/report compatibility boundary and nothing else: no field here adapts a policy to a
// descriptor or a descriptor to a policy — the two lists are consumed by their own dispatchers (lib/pass.ts,
// lib/policy-pass.ts) and reported side by side.
import type { GateDescriptor } from "./gate.ts";
import type { GatePolicy } from "./policy.ts";

/** The two live descriptor contracts. `unregistered` is a roster disposition, never a contract. */
export const GATE_CONTRACT_KINDS = ["legacy", "final"] as const;
export type GateContractKind = (typeof GATE_CONTRACT_KINDS)[number];

/** One corpus module, accounted for exactly once. `id` is the legacy `name` or the final `id` — both equal the
 *  module's basename by loader law — and `null` only for an unregistered module. */
export interface GateRosterEntry {
  /** Repo-relative POSIX path of the module. */
  readonly path: string;
  readonly contract: GateContractKind | "unregistered";
  readonly id: string | null;
}

export interface MixedGateCorpus {
  /** Every `.ts` module in the corpus dir the loader considered, sorted (probe fixtures and `.d.ts` excluded). */
  readonly files: readonly string[];
  readonly legacy: readonly GateDescriptor[];
  readonly final: readonly GatePolicy[];
  /** Derived from `final`; singleton families need no registry row. */
  readonly families: readonly string[];
  /** Modules that exported no `gate` and no branded descriptor — RECORDED, never swallowed (#410). */
  readonly unregistered: readonly string[];
  /** One row per entry of `files`, in the same order. */
  readonly roster: readonly GateRosterEntry[];
}

/** The final-only view (`loadPolicyCorpus`), kept for the planner CLI seam that refuses a mixed corpus by design. */
export interface GatePolicyCorpus {
  readonly gates: readonly GatePolicy[];
  readonly files: readonly string[];
  readonly families: readonly string[];
}

/** The legacy-only view (`loadGateCorpus`) — every legacy caller keeps this shape and stops throwing on final modules. */
export interface GateCorpus {
  readonly gates: readonly GateDescriptor[];
  readonly files: readonly string[];
  readonly unregistered: readonly string[];
}

/** The SELECTED view (#1964): the two contracts' slices of what ONE gate-scoped `check:structure` run was asked
 *  about. It carries no `files`/`roster`/`unregistered` deliberately — those are facts about the CORPUS, which a
 *  selection never narrows, so a reader holding this shape cannot mistake it for a corpus denominator. On the
 *  default whole-corpus run it IS the corpus's `legacy`/`final`, which is what keeps that run unchanged. */
export interface SelectedGateCorpus {
  readonly legacy: readonly GateDescriptor[];
  readonly final: readonly GatePolicy[];
}
