// The shutdown-drain classifier. It reads the server's own shutdown log lines and drain deadline, so it is the one verdict
// that imports the server network adapter; it stays out of ./verdicts.ts and out of the stack index so loading the
// index's constants does not load that adapter.
import { SHUTDOWN_DRAIN_MS, SHUTDOWN_MESSAGES } from "@orb/server/infra/network";
import type { DrainOutcome } from "../contract/types.ts";
import { DRAIN_MARGIN_MS } from "./verdicts.ts";

export const DRAIN_WATCH_MS = SHUTDOWN_DRAIN_MS + DRAIN_MARGIN_MS;

/** Classify the tail of the prod log written SINCE the SIGTERM. `deadline-hit` is a real outcome, not a
 *  failure: the drain force-closed a long-lived SSE stream at 10s and said so (a warn, because a client
 *  saw a truncated stream) — expected during a deploy. */
export function classifyDrainTail(tail: string): DrainOutcome {
  if (tail.includes(SHUTDOWN_MESSAGES.complete)) {
    return "complete";
  }
  if (tail.includes(SHUTDOWN_MESSAGES.drainDeadline)) {
    return "deadline-hit";
  }
  return "pending";
}
