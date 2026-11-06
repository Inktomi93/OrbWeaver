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

/** True when `pid` now names a different live process than `pinned` recorded. An exited holder (gone or zombie)
 *  is not replaced: a signal addressed to its process group still reaches members that outlived it, and a group
 *  id is not reused while the group has members. Throws on an unreadable identity, like {@link sameIncarnation}. */
export function pidReplaced(pid: number, pinned: ProcessCompletion, read: (pid: number) => ProcessCompletion, subject: string): boolean {
  const latest = read(pid);
  if (latest.kind === "unknown") {
    throw new Error(`${subject}: process identity unavailable before signal`);
  }
  return latest.kind === "live" && !((pinned.kind === "live" || pinned.kind === "zombie") && pinned.identity === latest.identity);
}
