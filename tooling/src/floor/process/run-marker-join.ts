// A sweep authorizes signals; a fixture owner additionally needs observed process completion.

import process from "node:process";
import { budget } from "../host/load-budget.ts";
import type { ProcessCompletion, ProcessEntry } from "../host/platform.ts";
import { completionProcesses, processCompletion } from "../host/platform.ts";

/** One sweep's receipt. `terminated` got SIGTERM, `killed` were still alive after the grace. */
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
}

export interface RunMarkerJoinDeps extends RunMarkerDeps {
  readonly completionOf?: (pid: number) => ProcessCompletion;
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

export async function sweepAndJoin(marker: string, deps: RunMarkerJoinDeps, owner: RunMarkerJoinOwner): Promise<RunMarkerSweep> {
  const processTable = deps.processTable ?? boundCompletionTable(marker, owner.ownerPid);
  const selection = { ...deps, processTable };
  const read = deps.completionOf ?? processCompletion;
  const original = new Map<number, ProcessCompletion>();
  const signal = deps.signal ?? owner.signal;
  const sweep = await owner.sweep(marker, {
    ...selection,
    signal: (pid, kind): void => {
      const current = read(pid);
      if (current.kind === "unknown") {
        throw new Error(`run-marker ${marker}: process identity unavailable before signal`);
      }
      if (!original.has(pid)) {
        original.set(pid, current);
        if (current.kind === "live" && !owner.select(marker, selection).includes(pid)) {
          throw new Error(`run-marker ${marker}: process ownership unavailable before signal`);
        }
      }
      const previous = original.get(pid);
      const latest = read(pid);
      if (latest.kind === "unknown") {
        throw new Error(`run-marker ${marker}: process identity unavailable before signal`);
      }
      if (latest.kind === "live" && previous?.kind === "live" && latest.identity === previous.identity) {
        signal(pid, kind);
      }
    },
  });
  await joinMarkedProcesses(sweep, original, {
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
    return completionProcesses({ owner: { pid: process.pid, identity: current.identity } });
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
