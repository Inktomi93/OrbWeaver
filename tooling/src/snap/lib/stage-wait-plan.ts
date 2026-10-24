// THE STAGE WAIT QUEUE, ruled purely: which ticket is served next, which are dead, which are past their
// deadline. No I/O: ops/stage-wait.ts reads the ticket file, spawns the waiter and acts on these answers.
import { join } from "node:path";
import type { EnsureStageOpts } from "../contract/stage.ts";
import type { StageWaitTicket } from "../contract/stage-wait.ts";
import { STAGE_ROOT_REL } from "./stage-plan.ts";

/** The stage wait queue: one ticket per queued ask, shared by every checkout like the band table. */
export const WAITS_REL = join(STAGE_ROOT_REL, "waits.json");
/** Where a ticket's detached waiter writes: like the keeper, a child that outlives its launcher logs to a file. */
export function stageWaitLogPath(home: string, ticketId: string): string {
  return join(home, STAGE_ROOT_REL, `wait-${ticketId}.log`);
}

/** A stage that cannot be had right now but may be later: every band is held, or a rebuild would tear down a
 *  stage another run is reading. A waiter keeps its place on this error; any other error ends the ticket. */
export class StageBusyError extends Error {}

/** A pending ticket with no waiter pid yet is mid-spawn for this long before it counts as dead. */
const SPAWN_GRACE_MS = 10_000;
/** A settled ticket nobody collected (the caller stopped for good) is dropped this long after its deadline. */
const MS_PER_MINUTE = 60_000;
const SETTLED_KEEP_MINUTES = 60;
const SETTLED_KEEP_MS = SETTLED_KEEP_MINUTES * MS_PER_MINUTE;

export function stageWaitKey(owner: string, ask: EnsureStageOpts): string {
  return JSON.stringify([owner, ask.ref ?? null, ask.dirty ?? false, ask.fresh, ask.freshExplicit ?? false, ask.auth ?? "single-user", ask.stageDb ?? null]);
}

/** Drop what can never be served: a pending ticket whose waiter is gone, and a settled one nobody collected. */
export function reapStageWaits(
  tickets: readonly StageWaitTicket[],
  nowMs: number,
  alive: (pid: number) => boolean,
): { readonly kept: readonly StageWaitTicket[]; readonly reaped: readonly StageWaitTicket[] } {
  const kept: StageWaitTicket[] = [];
  const reaped: StageWaitTicket[] = [];
  for (const ticket of tickets) {
    let dead: boolean;
    if (ticket.state === "pending") {
      dead = ticket.waiterPid === null ? nowMs - Date.parse(ticket.createdAt) > SPAWN_GRACE_MS : !alive(ticket.waiterPid);
    } else {
      dead = nowMs - Date.parse(ticket.deadlineAt) > SETTLED_KEEP_MS;
    }
    (dead ? reaped : kept).push(ticket);
  }
  return { kept, reaped };
}

function pendingInOrder(tickets: readonly StageWaitTicket[]): StageWaitTicket[] {
  return tickets.filter((ticket) => ticket.state === "pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The ticket served next: the oldest pending one, ties broken by id. */
export function stageWaitHead(tickets: readonly StageWaitTicket[]): StageWaitTicket | null {
  return pendingInOrder(tickets)[0] ?? null;
}

/** 1 for the ticket served next; 0 when the ticket is not pending. */
export function stageWaitPosition(tickets: readonly StageWaitTicket[], id: string): number {
  return pendingInOrder(tickets).findIndex((ticket) => ticket.id === id) + 1;
}

export function stageWaitPastDeadline(ticket: StageWaitTicket, nowMs: number): boolean {
  return nowMs >= Date.parse(ticket.deadlineAt);
}
