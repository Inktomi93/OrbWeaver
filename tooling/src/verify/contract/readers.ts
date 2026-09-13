// Legacy bus-coverage descriptor retained only while the blocked user-bus policy lacks a ruled work item.
// The final shared fact contract lives in bus-fact.ts and has no dependency on this migration residue.
//
// AND THE RE-EXPORT BLOCK IS GONE (#2228). This module used to end with `export type { BusAnchor, … } from
// "./bus-fact.ts"` — fourteen names forwarded from the final contract through the residue. Nothing imported
// one: every consumer already reaches `bus-fact.ts` directly (`lib/bus-fact-read.ts`, `lib/bus-fact-output.ts`,
// `gates/bus-producer-coverage.ts`, `tests/tooling/verify/lib/bus-fact-relay.test.ts`), which is exactly what
// the sentence above claims and what the block quietly contradicted. `BusCoverageSpec` — the one thing this
// file actually owns, and `lib/bus-coverage.ts`'s only import from here — stays.
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
