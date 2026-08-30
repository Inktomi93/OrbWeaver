// The shape the per-bus producer-coverage reconcile speaks (lib/bus-coverage.ts): each bus's thin gate
// supplies a `BusCoverageSpec` and THIS is the one home for it. Homed in contract/ per the five-slot type
// law (docs/architecture/core/Core-Tooling-Law.md §2.5).

/** How a bus's `*_EVENT_TYPES` belt is written: an object literal
 *  (`{ delta: true } satisfies Record<X["type"], true>`) or an array literal
 *  (`[…] as const satisfies readonly X["type"][]`). */
type BusKeyShape = "object" | "array";

export interface BusCoverageSpec {
  /** Matches the contracts file that homes the `*_EVENT_TYPES` const (the one home). */
  readonly contractsFile: RegExp;
  /** The const name whose every member must have a server emit site OR a cited DEFERRED entry. */
  readonly typesConst: string;
  readonly keyShape: BusKeyShape;
  /** Repo-relative path a finding anchors on (the const's home). */
  readonly reportFile: string;
  /** Declared-not-emitted members, each with its tracked citation. Self-cleaning both directions: a
   *  gained emit on a deferred member is a stale-RED; a lost emit on a live member is a missing-RED. */
  readonly deferred: Record<string, string>;
  /** Finding-message prefixes. The gate file owns the pointer-bearing literals (diagnostic-legibility
   *  reads the gate descriptor's `message:`, never these runtime-composed finding overrides). */
  readonly missingPrefix: string;
  readonly stalePrefix: string;
  /** OPTIONAL override of the paths scanned for emit literals (default: `domain` + `transport`). Set it ONLY
   *  when the bus has a producer the default scope structurally cannot see — the CHAT bus does: the
   *  entity→room reach engine lives at `entry/compose/room-reach.ts` BY LAW (the reach lookups are SQL over
   *  another domain's roster, so a domain may not own them), so its `roomEntityChanged` emit literal exists
   *  nowhere else. Widening is per-spec, never global: the user bus's compose exclusion is a deliberate
   *  ruling and stays. */
  readonly emitScope?: RegExp;
}
