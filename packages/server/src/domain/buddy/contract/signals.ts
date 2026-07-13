// domain/buddy/contract/signals — the reaction engine's normalized event vocab. Types-only: the pure
// signal builders live in observer/signals.ts. BuddySignalKind is the one importable canonical union;
// the mood/stat maps in substrate/mood.ts are Record<BuddySignalKind, …> so a new kind fails tsc.

import type { UserId } from "@orb/kit/ids";

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

export interface BuddySignal {
  readonly kind: BuddySignalKind;
  readonly userId: UserId;
  /** Identical for repeats of the same underlying event; the reactor skips a match against lastSignalKey. */
  readonly dedupKey: string;
  /** One-line, present-tense description fed to the quip model as the user prompt. */
  readonly description: string;
}
