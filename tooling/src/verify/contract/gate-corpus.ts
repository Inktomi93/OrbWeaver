// THE GATE CORPUS: what ONE load of `tooling/src/verify/gates/*.ts` SAW. Since #2176 Phase F
// (2026-09-14) there is exactly ONE runtime contract — a branded `defineGate` result is a `GatePolicy`;
// a module exporting no branded `gate` is recorded as unregistered; ANYTHING ELSE refuses at load,
// including the legacy `GateDescriptor` object shape, whose dispatcher (`lib/pass.ts`) was deleted with
// this file's legacy half. Every module lands in exactly one roster row;
// `files.length === gates.length + unregistered.length` is the accounting the structure run manifest
// reconciles (contract/run-manifest.ts, #410).
//
// `GateContractKind` outlives the loader's legacy arm ON PURPOSE. It is the STATIC recognizer's
// vocabulary (`lib/policy-descriptor-read.ts#gateRegistrationOf`), which reads a module's SOURCE rather
// than its loaded value — and a legacy-shaped `gate` object in `gates/**` must stay recognisable so
// `policy-legacy-imports` ARM B can name what a sibling import reached. The loader itself can now only
// produce `final` or `unregistered`.
import type { GatePolicy } from "./policy.ts";

/** The contract kinds a gate module's SOURCE can register under. `unregistered` is a roster disposition,
 *  never a contract. */
export const GATE_CONTRACT_KINDS = ["legacy", "final"] as const;
export type GateContractKind = (typeof GATE_CONTRACT_KINDS)[number];

/** One corpus module, accounted for exactly once. `id` is the policy's `id` — equal to the module's
 *  basename by loader law — and `null` only for an unregistered module. */
export interface GateRosterEntry {
  /** Repo-relative POSIX path of the module. */
  readonly path: string;
  readonly contract: "final" | "unregistered";
  readonly id: string | null;
}

export interface GateCorpus {
  /** Every `.ts` module in the corpus dir the loader considered, sorted (probe fixtures and `.d.ts` excluded). */
  readonly files: readonly string[];
  readonly gates: readonly GatePolicy[];
  /** Derived from `gates`; singleton families need no registry row. */
  readonly families: readonly string[];
  /** Modules that exported no branded descriptor — RECORDED, never swallowed (#410). */
  readonly unregistered: readonly string[];
  /** One row per entry of `files`, in the same order. */
  readonly roster: readonly GateRosterEntry[];
}

/** The planner CLI seam's narrower view (`loadPolicyCorpus`): the roster and nothing about dispositions. */
export interface GatePolicyCorpus {
  readonly gates: readonly GatePolicy[];
  readonly files: readonly string[];
  readonly families: readonly string[];
}

/** The SELECTED view (#1964): the slice of the corpus ONE gate-scoped `check:structure` run was asked
 *  about. It carries no `files`/`roster`/`unregistered` deliberately — those are facts about the CORPUS,
 *  which a selection never narrows, so a reader holding this shape cannot mistake it for a corpus
 *  denominator. On the default whole-corpus run it IS the corpus's `gates`. */
export interface SelectedGateCorpus {
  readonly gates: readonly GatePolicy[];
}
