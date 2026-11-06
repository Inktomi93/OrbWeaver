// A signal sent after a delay must reach the incarnation whose ownership was decided, never a later process
// that reused the pid. Every delayed stop in tooling asks this one question before it signals.
import type { ProcessCompletion } from "../host/platform-parse.ts";

/** True when `pid` is still the live incarnation `pinned` recorded. Throws when the identity cannot be read,
 *  because a signal must never rest on an unreadable identity. A gone or replaced pid answers false. */
export function sameIncarnation(pid: number, pinned: ProcessCompletion, read: (pid: number) => ProcessCompletion, subject: string): boolean {
  const latest = read(pid);
  if (latest.kind === "unknown") {
    throw new Error(`${subject}: process identity unavailable before signal`);
  }
  return latest.kind === "live" && pinned.kind === "live" && latest.identity === pinned.identity;
}
