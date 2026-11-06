// A sweep authorizes signals; a fixture owner additionally needs observed process completion.

import process from "node:process";
import { budget } from "../host/load-budget.ts";
import type { ProcessCompletion, ProcessEntry } from "../host/platform.ts";
import { completionProcesses, processCompletion } from "../host/platform.ts";
import { sameIncarnation } from "./incarnation.ts";

/** One sweep's receipt. `terminated` were sent SIGTERM; `killed` were the same incarnation still alive after the grace and sent SIGKILL. */
export interface RunMarkerSweep {
  readonly marker: string;
  readonly terminated: readonly number[];
  readonly killed: readonly number[];
}

/** The reads and signals a sweep performs — injected so a test drives the whole decision without a box. */
export interface RunMarkerDeps {
  readonly processTable?: () => readonly ProcessEntry[];
  readonly listPids?: () => readonly number[];
  /** Every identity one pid carries — its outer RUN marker and its LEASE, either channel, 0-2 values. */
  readonly identitiesOf?: (pid: number) => readonly string[];
  readonly parentOf?: (pid: number) => number | null;
  readonly signal?: (pid: number, signal: NodeJS.Signals) => void;
  readonly alive?: (pid: number) => boolean;
  readonly selfPid?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** One pid's incarnation identity; every signal a sweep sends is checked against it. */
  readonly completionOf?: (pid: number) => ProcessCompletion;
  /** The guard a joining caller built, so the sweep and the join share one record of what was signalled. */
  readonly guard?: IncarnationGuard;
}

/** Every signal of one sweep, checked per pid: the first sight must be an owned, identifiable process, and a
 *  later signal reaches only that same incarnation. `observed` is what the guard first saw, for the join. */
export interface IncarnationGuard {
  readonly observed: ReadonlyMap<number, ProcessCompletion>;
  /** True when the signal was sent; false when the pid is gone or a different incarnation now. */
  readonly signal: (pid: number, kind: NodeJS.Signals) => boolean;
}

export function incarnationGuard(
  marker: string,
  {
    read,
    select,
    signal,
  }: {
    readonly read: (pid: number) => ProcessCompletion;
    readonly select: () => readonly number[];
    readonly signal: (pid: number, kind: NodeJS.Signals) => void;
  },
): IncarnationGuard {
  const observed = new Map<number, ProcessCompletion>();
  return {
    observed,
    signal: (pid, kind): boolean => {
      const subject = `run-marker ${marker}`;
      let pinned = observed.get(pid);
      if (pinned === undefined) {
        pinned = read(pid);
        if (pinned.kind === "unknown") {
          throw new Error(`${subject}: process identity unavailable before signal`);
        }
        observed.set(pid, pinned);
        // Leaving the selection by exiting is a normal outcome (a pipe partner ends on this sweep's own TERM); only a pid still the same live incarnation yet unselected is a custody failure.
        if (pinned.kind === "live" && !select().includes(pid)) {
          if (sameIncarnation(pid, pinned, read, subject)) {
            throw new Error(`${subject}: process ownership unavailable before signal`);
          }
          return false;
        }
      }
      if (!sameIncarnation(pid, pinned, read, subject)) {
        return false;
      }
      signal(pid, kind);
      return true;
    },
  };
}

const JOIN_POLL_BASE_MS = 25;
const JOIN_ATTEMPTS = 80;

export interface RunMarkerJoinOwner {
  readonly ownerPid: (marker: string) => number | null;
  readonly sweep: (marker: string, deps: RunMarkerDeps) => Promise<RunMarkerSweep>;
  readonly select: (marker: string, deps: RunMarkerDeps) => readonly number[];
  readonly signal: (pid: number, signal: NodeJS.Signals) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

export async function sweepAndJoin(marker: string, deps: RunMarkerDeps, owner: RunMarkerJoinOwner): Promise<RunMarkerSweep> {
  const processTable = deps.processTable ?? boundCompletionTable(marker, owner.ownerPid);
  const selection = { ...deps, processTable };
  const read = deps.completionOf ?? processCompletion;
  const guard = incarnationGuard(marker, { read, select: () => owner.select(marker, selection), signal: deps.signal ?? owner.signal });
  const sweep = await owner.sweep(marker, { ...selection, guard });
  await joinMarkedProcesses(sweep, guard.observed, {
    read,
    sleep: deps.sleep ?? owner.sleep,
    finalOwned: () => owner.select(marker, selection),
  });
  return sweep;
}

function boundCompletionTable(marker: string, markerOwner: (marker: string) => number | null): () => ReturnType<typeof completionProcesses> {
  const current = processCompletion(process.pid);
  return () => {
    if (markerOwner(marker) !== process.pid || current.kind !== "live") {
      throw new Error("run-marker: completion requires this process's own fresh marker");
    }
    return completionProcesses({ owner: { pid: process.pid, identity: current.identity }, marker });
  };
}

function completed(original: ProcessCompletion, current: ProcessCompletion): boolean {
  return (
    current.kind === "gone" || current.kind === "zombie" || (original.kind === "live" && current.kind === "live" && original.identity !== current.identity)
  );
}

async function joinMarkedProcesses(
  sweep: RunMarkerSweep,
  original: ReadonlyMap<number, ProcessCompletion>,
  {
    read,
    sleep,
    finalOwned,
  }: {
    readonly read: (pid: number) => ProcessCompletion;
    readonly sleep: (ms: number) => Promise<void>;
    readonly finalOwned: () => readonly number[];
  },
): Promise<void> {
  for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt += 1) {
    const pending = [...original].filter(([pid, identity]) => !completed(identity, read(pid)));
    if (pending.length === 0) {
      const survivors = finalOwned().filter((pid) => {
        const state = read(pid);
        return state.kind !== "gone" && state.kind !== "zombie";
      });
      if (survivors.length === 0) {
        return;
      }
      throw new Error(`run-marker ${sweep.marker}: owned process completion not established`);
    }
    await sleep(budget(JOIN_POLL_BASE_MS));
  }
  throw new Error(`run-marker ${sweep.marker}: process completion not established`);
}
