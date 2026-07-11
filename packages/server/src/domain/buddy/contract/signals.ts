// domain/buddy/contract/signals — the reaction engine's normalized event vocab (the observer maps raw
// app events → ONE `BuddySignal` the reactor consumes). DOMAIN-INTERNAL (not cross-boundary): the type
// lives here per §7.4. This file is TYPES-ONLY: the pure signal BUILDERS (`workloadSignal`/`chatSignal`/
// `traceSignal`/`presenceSignal`/`bucket5m`) live with the subsystem that uses them —
// `observer/signals.ts` — per PD-64 (RESOLVED with the observer build, PD-45).
//
// §7.5: `BuddySignalKind` is the ONE importable canonical union (12 members). The mood/stat maps in
// `substrate/mood.ts` are `Record<BuddySignalKind, …>` so a new kind fails `tsc`
// (exhaustive-dispatch). Consumed by the pure mood machine + the live reactor (`observer/react.ts`) that the
// observer subsystem emits these onto (it reacts to the chat/workload buses that land with chat, D38).

import type { UserId } from "@orb/kit/ids";

/** The buddy's event kinds — the ONE canonical tuple (the axis declared once; the type derives it, per
 *  §7.5 `no-inline-union-redecl`). The mood/stat maps in `substrate/mood.ts` are `Record<BuddySignalKind,…>`
 *  so a new member fails `tsc` (exhaustive-dispatch). */
export const BUDDY_SIGNAL_KINDS = [
  "workload:started",
  "workload:completed",
  "workload:failed",
  "chat:first-message",
  "chat:turn-completed",
  "chat:turn-aborted",
  "trace:slow-turn",
  "trace:error-spike",
  "presence:idle",
  "presence:wake",
  "presence:neglected",
  "buddy:evolved",
] as const;
export type BuddySignalKind = (typeof BUDDY_SIGNAL_KINDS)[number];

/** A normalized reaction signal — already carries everything `react()` needs, so the reactor stays
 *  oblivious to where the signal came from. */
export interface BuddySignal {
  readonly kind: BuddySignalKind;
  /** Whose buddy reacts (resolved by the observer before building the signal). */
  readonly userId: UserId;
  /** Dedup key: identical for repeats of the SAME underlying event; the reactor skips a signal whose
   *  key equals the buddy's `lastSignalKey`. */
  readonly dedupKey: string;
  /** One-line, present-tense description fed to the quip model as the user prompt. */
  readonly description: string;
}
