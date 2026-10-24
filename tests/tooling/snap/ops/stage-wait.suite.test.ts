// tooling/snap/ops/stage-wait — the `--stage-wait` queue: tickets are served oldest first, a ticket whose
// waiter died is reaped, a ticket past its deadline expires with exit 2, and the boot finishes with no caller.
// The queue, reap and waiter loop are production; only time, liveness and the boot itself are injected.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { afterEach } from "vitest";
import { EXIT } from "../../../../tooling/src/floor/cli/exit-contract.ts";
import type { EnsureStageOpts } from "../../../../tooling/src/snap/contract/stage.ts";
import type { StageWaitDeps } from "../../../../tooling/src/snap/contract/stage-wait.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/index.ts";
import { StageBusyError } from "../../../../tooling/src/snap/lib/stage-wait-plan.ts";
import {
  awaitStageWait,
  readStageWaits,
  registerStageWait,
  runStageWaiter,
  setStageWaiterPid,
  stageAskFromArgs,
  stageWaiterTurn,
} from "../../../../tooling/src/snap/ops/stage-wait.ts";

const OWNER = "/checkout#side-eye-a";
const MINUTES = 30;
const MS_PER_MINUTE = 60_000;
const TICK_MS = 1000;
const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

interface Harness {
  readonly home: string;
  readonly deps: StageWaitDeps;
  readonly booted: EnsureStageOpts[];
  readonly clock: { ms: number };
  readonly dead: Set<number>;
  failWith: (() => Error | null) | null;
}

function harness(): Harness {
  const home = mkdtempSync(join(tmpdir(), "orb-stage-wait-"));
  homes.push(home);
  const clock = { ms: Date.UTC(2026, 9, 12) };
  const dead = new Set<number>();
  const booted: EnsureStageOpts[] = [];
  const state: Harness = {
    home,
    booted,
    clock,
    dead,
    failWith: null,
    deps: {
      now: (): number => clock.ms,
      sleep: (ms): Promise<void> => {
        clock.ms += ms;
        return Promise.resolve();
      },
      alive: (pid): boolean => !dead.has(pid),
      ensure: (ask): void => {
        const failure = state.failWith?.() ?? null;
        if (failure !== null) {
          throw failure;
        }
        booted.push(ask);
      },
      pollMs: TICK_MS,
    },
  };
  return state;
}

/** Queue one ask a tick after the last, with a live waiter pid, the way `waitForStage` leaves it. */
function queue(h: Harness, ask: EnsureStageOpts, pid: number): string {
  h.clock.ms += TICK_MS;
  const { ticket } = registerStageWait(h.home, { owner: OWNER, ask, minutes: MINUTES }, h.deps);
  setStageWaiterPid(h.home, ticket.id, pid, h.deps);
  return ticket.id;
}

const ASK_A: EnsureStageOpts = { fresh: false, auth: "single-user", ref: "aaaa" };
const ASK_B: EnsureStageOpts = { fresh: false, auth: "local", ref: "bbbb" };

test("tickets are served oldest first: a younger waiter keeps its place until the older ticket settles", () => {
  const h = harness();
  const a = queue(h, ASK_A, 101);
  const b = queue(h, ASK_B, 102);

  expect(stageWaiterTurn(h.home, b, h.deps)).toEqual({ kind: "wait" });
  expect(h.booted).toEqual([]);

  expect(stageWaiterTurn(h.home, a, h.deps)).toEqual({ kind: "exit", code: EXIT.clean });
  expect(stageWaiterTurn(h.home, b, h.deps)).toEqual({ kind: "exit", code: EXIT.clean });
  expect(h.booted).toEqual([ASK_A, ASK_B]);
});

test("a busy table keeps the head ticket's place; any other boot error ends it as failed", async () => {
  const h = harness();
  const a = queue(h, ASK_A, 101);
  h.failWith = (): Error => new StageBusyError("every band is held");
  expect(stageWaiterTurn(h.home, a, h.deps)).toEqual({ kind: "wait" });
  expect(readStageWaits(h.home)[0]?.state).toBe("pending");

  h.failWith = (): Error => new Error("pnpm install failed");
  expect(stageWaiterTurn(h.home, a, h.deps)).toEqual({ kind: "exit", code: EXIT.toolError });
  const outcome = await awaitStageWait(h.home, a, h.deps);
  expect(outcome).toEqual({ kind: "refused", line: expect.stringContaining("pnpm install failed") });
  expect(readStageWaits(h.home)).toEqual([]);
});

test("a ticket whose waiter is gone is reaped, so it cannot block the queue", () => {
  const h = harness();
  const a = queue(h, ASK_A, 101);
  const b = queue(h, ASK_B, 102);
  h.dead.add(101);

  expect(stageWaiterTurn(h.home, b, h.deps)).toEqual({ kind: "exit", code: EXIT.clean });
  expect(h.booted).toEqual([ASK_B]);
  expect(readStageWaits(h.home).map((ticket) => ticket.id)).toEqual([b]);
  expect(readStageWaits(h.home).some((ticket) => ticket.id === a)).toBe(false);
});

test("a ticket past its deadline expires with exit 2, boots nothing, and the caller is told", async () => {
  const h = harness();
  const a = queue(h, ASK_A, 101);
  h.clock.ms += (MINUTES + 1) * MS_PER_MINUTE;

  expect(stageWaiterTurn(h.home, a, h.deps)).toEqual({ kind: "exit", code: EXIT.toolError });
  expect(h.booted).toEqual([]);
  const outcome = await awaitStageWait(h.home, a, h.deps);
  expect(outcome).toEqual({ kind: "refused", line: expect.stringContaining("STAGE WAIT EXPIRED") });
  expect(readStageWaits(h.home)).toEqual([]);
});

test("the boot completes after the caller is gone, and a later call collects the ready ticket", async () => {
  const h = harness();
  const a = queue(h, ASK_A, 101);
  let busyTurns = 2;
  h.failWith = (): Error | null => {
    busyTurns -= 1;
    return busyTurns >= 0 ? new StageBusyError("held") : null;
  };

  // No awaitStageWait is running: the caller already stopped. The waiter alone drives the ticket.
  expect(await runStageWaiter(a, h.deps, h.home)).toBe(EXIT.clean);
  expect(h.booted).toEqual([ASK_A]);
  expect(readStageWaits(h.home)[0]?.state).toBe("ready");

  expect(await awaitStageWait(h.home, a, h.deps)).toEqual({ kind: "ready" });
  expect(readStageWaits(h.home)).toEqual([]);
});

test("the same owner repeating the same ask resumes its ticket; a different ask queues separately", () => {
  const h = harness();
  const first = registerStageWait(h.home, { owner: OWNER, ask: ASK_A, minutes: MINUTES }, h.deps);
  const again = registerStageWait(h.home, { owner: OWNER, ask: ASK_A, minutes: MINUTES }, h.deps);
  const other = registerStageWait(h.home, { owner: OWNER, ask: ASK_B, minutes: MINUTES }, h.deps);

  expect(first.created).toBe(true);
  expect(again).toEqual({ ticket: first.ticket, created: false });
  expect(other.created).toBe(true);
  expect(other.ticket.id).not.toBe(first.ticket.id);
});

test("--stage-wait takes whole minutes, implies an isolated stage, and the ask carries the stage flags", () => {
  const parsed = parseSnapArgs(["/", "--stage-wait", "30", "--stage-db", "/scratch/orbweaver.db", "--stage-auth", "local"]);
  expect(parsed.errors).toEqual([]);
  expect(parsed.stageWait).toBe(30);
  expect(parsed.isolated).toBe(true);
  expect(stageAskFromArgs(parsed)).toEqual({ fresh: true, auth: "local", stageDb: "/scratch/orbweaver.db" });
  // The typed --fresh is told apart from the one --stage-db implies, and both ride the ask.
  expect(stageAskFromArgs(parseSnapArgs(["/", "--fresh", "--stage-db", "/scratch/orbweaver.db"]))).toMatchObject({ fresh: true, freshExplicit: true });
  expect(parseSnapArgs(["/", "--stage-db", "/scratch/orbweaver.db"]).freshExplicit).toBe(false);
  expect(parseSnapArgs(["/", "--stage-wait", "0"]).errors).toHaveLength(1);
  expect(parseSnapArgs(["--stage-wait", "30", "--stage-down"]).errors).toHaveLength(1);
});
