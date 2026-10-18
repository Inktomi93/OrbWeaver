// THE STAGE WAIT QUEUE — `snap --stage-wait <min>`. A full band table used to refuse at once, so a reviewer
// polled by hand, and the poll died with the agent that ran it. Now the ask is a TICKET in
// `<main>/.cache/snap-stage/waits.json` and a detached WAITER owns it, in the stage-keeper's shape
// (ops/stage-keeper.ts): the waiter serves tickets oldest first, boots through `ensureStage` when its ticket is
// the head and the table can take it, and settles the ticket. The caller only reads the ticket back, so the
// boot finishes whether or not the caller is still running, and the same command resumes the wait.
//
// A ticket whose waiter died is reaped by the next queue read; a ticket past its deadline expires cleanly with
// exit 2 (nothing was measured). The file rides the band table's mutex, so a ticket and a band claim never interleave.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { print } from "../../floor/artifacts/artifacts.ts";
import { pidAlive } from "../../floor/artifacts/run-retention.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { spawnNicedChild } from "../../floor/process/proc.ts";
import type { EnsureStageOpts } from "../contract/stage.ts";
import type { StageWaitDeps, StageWaiterTurn, StageWaitOutcome, StageWaitState, StageWaitTicket } from "../contract/stage-wait.ts";
import type { Args } from "../contract/types.ts";

import {
  reapStageWaits,
  StageBusyError,
  stageWaitHead,
  stageWaitKey,
  stageWaitLogPath,
  stageWaitPastDeadline,
  stageWaitPosition,
  WAITS_REL,
} from "../lib/stage-wait-plan.ts";
import { ensureStage } from "./stage.ts";
import { repoRoot, stageCallerOwner } from "./stage-git.ts";
import { markerRoot, withBandsLock } from "./stage-marker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --stage-wait <min>");

/** The waiter's entry is THIS tool's cli, derived from this module's location (the keeper's discipline). */
const SNAP_CLI = fileURLToPath(new URL("../cli.ts", import.meta.url));
const MS_PER_MINUTE = 60_000;
const POLL_MS = 2000;
const TICKET_ID_BYTES = 6;

const PROD_STAGE_WAIT_DEPS: StageWaitDeps = {
  now: (): number => Date.now(),
  sleep: async (ms): Promise<void> => {
    await sleep(ms);
  },
  alive: pidAlive,
  ensure: (ask): void => {
    ensureStage(ask);
  },
  pollMs: POLL_MS,
};

/** The `ensureStage` ask a run's argv makes, so the foreground and the waiter name one stage. */
export function stageAskFromArgs(opts: Pick<Args, "ref" | "fresh" | "dirty" | "stageAuth" | "stageDb">): EnsureStageOpts {
  return {
    fresh: opts.fresh,
    auth: opts.stageAuth,
    ...(opts.dirty ? { dirty: true } : {}),
    ...(opts.ref === null || opts.dirty ? {} : { ref: opts.ref }),
    ...(opts.stageDb === null ? {} : { stageDb: opts.stageDb }),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const WAIT_STATES: readonly StageWaitState[] = ["pending", "ready", "failed", "expired"];

/** A ticket we cannot reason about is not a ticket: dropped, as `readRow` drops a band row it cannot read. */
function readTicket(value: unknown): StageWaitTicket | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, key, createdAt, deadlineAt, waiterPid, detail, ask } = value;
  const state = WAIT_STATES.find((candidate) => candidate === value["state"]);
  if (!(typeof id === "string" && typeof key === "string" && typeof createdAt === "string" && typeof deadlineAt === "string" && state !== undefined)) {
    return null;
  }
  if (!(isRecord(ask) && typeof ask["fresh"] === "boolean")) {
    return null;
  }
  return {
    id,
    key,
    createdAt,
    deadlineAt,
    waiterPid: typeof waiterPid === "number" ? waiterPid : null,
    state,
    detail: typeof detail === "string" ? detail : null,
    ask: {
      fresh: ask["fresh"],
      ...(typeof ask["ref"] === "string" ? { ref: ask["ref"] } : {}),
      ...(ask["dirty"] === true ? { dirty: true } : {}),
      ...(ask["auth"] === "local" || ask["auth"] === "single-user" ? { auth: ask["auth"] } : {}),
      ...(typeof ask["stageDb"] === "string" ? { stageDb: ask["stageDb"] } : {}),
    },
  };
}

export function readStageWaits(home: string): readonly StageWaitTicket[] {
  const path = join(home, WAITS_REL);
  if (!existsSync(path)) {
    return [];
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!(isRecord(parsed) && parsed["v"] === 1 && Array.isArray(parsed["tickets"]))) {
    return [];
  }
  return parsed["tickets"].map(readTicket).filter((ticket): ticket is StageWaitTicket => ticket !== null);
}

function writeStageWaits(home: string, tickets: readonly StageWaitTicket[]): void {
  const path = join(home, WAITS_REL);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify({ v: 1, tickets }, null, 2)}\n`);
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Read the queue under the table mutex, reap what can never be served, let `change` edit it, write it back. */
function inQueue<T>(
  home: string,
  deps: StageWaitDeps,
  change: (tickets: readonly StageWaitTicket[]) => { readonly tickets: readonly StageWaitTicket[]; readonly value: T },
): T {
  return withBandsLock(home, () => {
    const { kept } = reapStageWaits(readStageWaits(home), deps.now(), deps.alive);
    const next = change(kept);
    writeStageWaits(home, next.tickets);
    return next.value;
  });
}

function replaceTicket(tickets: readonly StageWaitTicket[], id: string, patch: Partial<StageWaitTicket>): readonly StageWaitTicket[] {
  return tickets.map((ticket) => (ticket.id === id ? { ...ticket, ...patch } : ticket));
}

/** Queue an ask, or resume the ticket the same owner already holds for it. A settled failure or expiry is
 *  replaced: a rerun after the deadline is a new try, not a replay of the old verdict. */
export function registerStageWait(
  home: string,
  input: { readonly owner: string; readonly ask: EnsureStageOpts; readonly minutes: number },
  deps: StageWaitDeps,
): { readonly ticket: StageWaitTicket; readonly created: boolean } {
  const key = stageWaitKey(input.owner, input.ask);
  return inQueue<{ readonly ticket: StageWaitTicket; readonly created: boolean }>(home, deps, (tickets) => {
    const existing = tickets.find((queued) => queued.key === key && (queued.state === "pending" || queued.state === "ready"));
    if (existing !== undefined) {
      return { tickets, value: { ticket: existing, created: false } };
    }
    const nowMs = deps.now();
    const ticket: StageWaitTicket = {
      id: Buffer.from(crypto.getRandomValues(new Uint8Array(TICKET_ID_BYTES))).toString("hex"),
      key,
      createdAt: new Date(nowMs).toISOString(),
      deadlineAt: new Date(nowMs + input.minutes * MS_PER_MINUTE).toISOString(),
      waiterPid: null,
      state: "pending",
      detail: null,
      ask: input.ask,
    };
    return { tickets: [...tickets.filter((old) => old.key !== key), ticket], value: { ticket, created: true } };
  });
}

export function setStageWaiterPid(home: string, id: string, pid: number, deps: StageWaitDeps): void {
  inQueue(home, deps, (tickets) => ({ tickets: replaceTicket(tickets, id, { waiterPid: pid }), value: undefined }));
}

function settleStageWait(home: string, deps: StageWaitDeps, id: string, verdict: { readonly state: StageWaitState; readonly detail: string | null }): void {
  inQueue(home, deps, (tickets) => ({ tickets: replaceTicket(tickets, id, verdict), value: undefined }));
}

function removeStageWait(home: string, id: string, deps: StageWaitDeps): void {
  inQueue(home, deps, (tickets) => ({ tickets: tickets.filter((ticket) => ticket.id !== id), value: undefined }));
  rmSync(stageWaitLogPath(home, id), { force: true });
}

/** The boot as data, so the caught failure is a value the caller reads rather than an absorbed throw. */
function bootTicket(deps: StageWaitDeps, ask: EnsureStageOpts): { readonly status: "booted" } | { readonly status: "failed"; readonly error: unknown } {
  try {
    deps.ensure(ask);
    return { status: "booted" };
  } catch (error) {
    return { status: "failed", error };
  }
}

/** One waiter step. The ticket is served only when it is the oldest pending one; the boot runs outside the
 *  queue lock (it takes a minute), and a busy table keeps the place rather than ending the ticket. */
export function stageWaiterTurn(home: string, id: string, deps: StageWaitDeps): StageWaiterTurn {
  const { mine, head } = inQueue(home, deps, (tickets) => ({
    tickets,
    value: { mine: tickets.find((ticket) => ticket.id === id) ?? null, head: stageWaitHead(tickets) },
  }));
  if (mine === null) {
    print(`[snap-stage] wait ${id}: ticket gone (reaped or collected) — waiter ends`);
    return { kind: "exit", code: EXIT.clean };
  }
  if (mine.state !== "pending") {
    return { kind: "exit", code: EXIT.clean };
  }
  if (stageWaitPastDeadline(mine, deps.now())) {
    settleStageWait(home, deps, id, { state: "expired", detail: "deadline passed before a stage could be booted" });
    return { kind: "exit", code: EXIT.toolError };
  }
  if (head?.id !== id) {
    return { kind: "wait" };
  }
  const boot = bootTicket(deps, mine.ask);
  if (boot.status === "failed") {
    // A full table keeps the head ticket's place; any other failure ends the ticket.
    if (boot.error instanceof StageBusyError) {
      return { kind: "wait" };
    }
    settleStageWait(home, deps, id, { state: "failed", detail: boot.error instanceof Error ? boot.error.message : String(boot.error) });
    return { kind: "exit", code: EXIT.toolError };
  }
  settleStageWait(home, deps, id, { state: "ready", detail: null });
  return { kind: "exit", code: EXIT.clean };
}

/** `snap --stage-waiter <ticket>` — the waiter process itself. */
export async function runStageWaiter(id: string, deps: StageWaitDeps = PROD_STAGE_WAIT_DEPS, home: string = markerRoot(repoRoot())): Promise<number> {
  for (;;) {
    const turn = stageWaiterTurn(home, id, deps);
    if (turn.kind === "exit") {
      return turn.code;
    }
    await deps.sleep(deps.pollMs);
  }
}

/** The caller's side: read the ticket until it settles. Collecting a settled ticket removes it. */
export async function awaitStageWait(home: string, id: string, deps: StageWaitDeps): Promise<StageWaitOutcome> {
  let announced = 0;
  for (;;) {
    const { mine, position } = inQueue(home, deps, (tickets) => ({
      tickets,
      value: { mine: tickets.find((ticket) => ticket.id === id) ?? null, position: stageWaitPosition(tickets, id) },
    }));
    if (mine === null) {
      return { kind: "refused", line: `STAGE WAIT LOST  ticket ${id} is gone: its waiter died before it settled. Run the same command again to queue anew.` };
    }
    if (mine.state === "ready") {
      removeStageWait(home, id, deps);
      return { kind: "ready" };
    }
    if (mine.state !== "pending") {
      removeStageWait(home, id, deps);
      const why = mine.state === "expired" ? "EXPIRED" : "FAILED";
      return { kind: "refused", line: `STAGE WAIT ${why}  ticket ${id}: ${mine.detail ?? "no detail"}` };
    }
    if (position !== announced) {
      announced = position;
      print(`[snap-stage] waiting for a stage: ticket ${id}, place ${position} in the queue, until ${mine.deadlineAt}`);
    }
    await deps.sleep(deps.pollMs);
  }
}

function spawnStageWaiter(home: string, id: string, deps: StageWaitDeps): void {
  mkdirSync(dirname(stageWaitLogPath(home, id)), { recursive: true });
  const child = spawnNicedChild(process.execPath, [SNAP_CLI, "--stage-waiter", id], { cwd: process.cwd(), logPath: stageWaitLogPath(home, id) });
  child.unref();
  if (child.pid !== undefined) {
    setStageWaiterPid(home, id, child.pid, deps);
  }
}

/** Foreground half of `--stage-wait`: queue (or resume) the ticket, start its waiter, wait for the verdict.
 *  Returns null when the stage is up (the caller's own `ensureStage` then reuses it warm), else an exit code. */
export async function waitForStage(opts: Args, deps: StageWaitDeps = PROD_STAGE_WAIT_DEPS): Promise<number | null> {
  if (opts.stageWait === null) {
    return null;
  }
  const root = repoRoot();
  const home = markerRoot(root);
  const { ticket, created } = registerStageWait(home, { owner: stageCallerOwner(root), ask: stageAskFromArgs(opts), minutes: opts.stageWait }, deps);
  if (created) {
    spawnStageWaiter(home, ticket.id, deps);
  } else {
    print(`[snap-stage] resuming stage wait ticket ${ticket.id}`);
  }
  const outcome = await awaitStageWait(home, ticket.id, deps);
  if (outcome.kind === "refused") {
    print(outcome.line);
    return EXIT.toolError;
  }
  // The waiter booted the stage; a forced rebuild here would tear it (and a --stage-db clone) down again.
  opts.fresh = false;
  return null;
}
