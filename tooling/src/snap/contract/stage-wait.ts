// The stage wait queue's shapes (`--stage-wait`): a ticket, the injected boundary, and the two answers.
import type { EnsureStageOpts } from "./stage.ts";

const STAGE_WAIT_STATES = ["pending", "ready", "failed", "expired"] as const;
export type StageWaitState = (typeof STAGE_WAIT_STATES)[number];

/** One queued ask for a stage. The detached waiter named by `waiterPid` owns it: it serves the ask in ticket
 *  order, boots through `ensureStage`, and settles the state the caller reads back. */
export interface StageWaitTicket {
  readonly id: string;
  /** The ask's identity: the same owner repeating the same ask resumes this ticket instead of queueing twice. */
  readonly key: string;
  readonly createdAt: string;
  readonly deadlineAt: string;
  readonly waiterPid: number | null;
  readonly state: StageWaitState;
  readonly detail: string | null;
  readonly ask: EnsureStageOpts;
}

/** What the queue reads and does to the box, injected so a test drives it without real processes, stacks or time. */
export interface StageWaitDeps {
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly alive: (pid: number) => boolean;
  readonly ensure: (ask: EnsureStageOpts) => void;
  readonly pollMs: number;
}

/** One waiter step: keep waiting, or end the waiter with this exit code. */
export type StageWaiterTurn = { readonly kind: "wait" } | { readonly kind: "exit"; readonly code: number };

/** What the caller learns: the stage is up, or why it will not be. */
export type StageWaitOutcome = { readonly kind: "ready" } | { readonly kind: "refused"; readonly line: string };
