// A signal sent after a delay must reach the incarnation whose ownership was decided, never a later process
// that reused the pid. Every delayed stop in tooling asks this one question before it signals.
import type { ProcessCompletion } from "../host/platform-parse.ts";
import type { ProcessGroup } from "./proc-contract.ts";

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
 *  is not replaced. Throws on an unreadable identity, like {@link sameIncarnation}. */
function pidReplaced(pid: number, pinned: ProcessCompletion, read: (pid: number) => ProcessCompletion, subject: string): boolean {
  const latest = read(pid);
  if (latest.kind === "unknown") {
    throw new Error(`${subject}: process identity unavailable before signal`);
  }
  return latest.kind === "live" && !((pinned.kind === "live" || pinned.kind === "zombie") && pinned.identity === latest.identity);
}

/** What one signal to a pinned group became: `sent`; `replaced` when the holder pid is a different process now;
 *  `emptied` when the group has been seen without members, so its id may already belong to a new group. */
const GROUP_SIGNALS = ["sent", "replaced", "emptied"] as const;
export type GroupSignal = (typeof GROUP_SIGNALS)[number];

/** A stop of one process group, pinned before its holder can exit. The holder may leave before its group does, so
 *  the signal targets the group and the group's membership, not the holder pid or the port, decides whether it is
 *  still ours to signal. */
export interface PinnedGroupStop {
  readonly signal: (kind: NodeJS.Signals) => GroupSignal;
  /** Whether the group still has members. Poll it between signals: once it reads empty it stays empty, because an
   *  emptied group's id is free to be reused. A group seen empty is never signalled again. */
  readonly occupied: () => boolean;
}

export function pinnedGroupStop(
  group: Pick<ProcessGroup, "signal" | "alive">,
  holder: { readonly pid: number; readonly pinned: ProcessCompletion; readonly read: (pid: number) => ProcessCompletion; readonly subject: string },
): PinnedGroupStop {
  let emptied = false;
  const occupied = (): boolean => {
    emptied ||= !group.alive();
    return !emptied;
  };
  return {
    occupied,
    signal: (kind): GroupSignal => {
      if (!occupied()) {
        return "emptied";
      }
      if (pidReplaced(holder.pid, holder.pinned, holder.read, holder.subject)) {
        return "replaced";
      }
      group.signal(kind);
      return "sent";
    },
  };
}
