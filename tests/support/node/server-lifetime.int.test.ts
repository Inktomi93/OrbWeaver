import "./composed-real.ts";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKLOAD_LANES } from "@orb/contracts/workloads";
import { closeDb } from "@orb/db";
import { sql } from "drizzle-orm";
import { vi } from "vitest";
import { createFrozenClock } from "../iso/clock.ts";
import { createControlledTimers } from "../iso/timers.ts";
import { freshDb, freshHeldDb } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import type { ServerTestHarness } from "./server.ts";
import { createServerHarness } from "./server.ts";

test("a rejected timer clear cannot strand supervised physical fetch cancellation or later root cleanup", async () => {
  const failure = new Error("controlled physical timer-clear refusal");
  const release = Promise.withResolvers<void>();
  const executing = Promise.withResolvers<AbortSignal>();
  const clearing = Promise.withResolvers<void>();
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: the root adopts this scheduler; the case observes its disposal after a raw clear failure.
  const timers = createControlledTimers(clock);
  const interval = timers.interval;
  let refused = false;
  const spy = vi.spyOn(timers, "interval").mockImplementation((callback, ms) => {
    const cancel = interval(callback, ms);
    return (): void => {
      cancel();
      if (!refused) {
        refused = true;
        clearing.resolve();
        throw failure;
      }
    };
  });
  const harness = await createServerHarness({
    clock,
    timers,
    networkExecution: {
      resolver: () => Promise.resolve(["93.184.215.14"]),
      fetch: (_input, init) => {
        const signal = init?.signal;
        if (signal === null || signal === undefined) {
          throw new Error("the real configured request omitted its cancellation signal");
        }
        executing.resolve(signal);
        return new Promise<Response>((_resolve, reject) => {
          const onAbort = (): void => reject(signal.reason);
          signal.addEventListener("abort", onAbort, { once: true });
          void release.promise.then(() => {
            signal.removeEventListener("abort", onAbort);
            reject(new Error("physical fetch released by proof cleanup"));
          }, reject);
        });
      },
    },
  });
  harness.app.supervise("owned-physical-fetch", "harness.physicalFetch", {}, async () => {
    await harness.app.egress.configuredEndpointFetch("https://lifetime.test/held");
  });
  const signal = await executing.promise;
  const disposal = harness[Symbol.asyncDispose]();
  const disposed = expect(disposal).rejects.toBe(failure);
  try {
    await clearing.promise;
    expect(signal.aborted).toBe(true);
  } finally {
    release.resolve();
    await disposed;
    spy.mockRestore();
  }
  expect(timers.pending()).toBe(0);
  expect(() => timers.timeout(() => undefined, 1)).toThrow("disposed timer scheduler");
  await expect(harness.db.all(sql`select 1`)).rejects.toThrow();
  await expect(access(harness.modelCacheDir)).rejects.toMatchObject({ code: "ENOENT" });
});

test("failed job construction removes only its owned directory and timers while retaining the borrowed database", async () => {
  await using owned = new AsyncDisposableStack();
  const parent = await mkdtemp(join(tmpdir(), "codex-compose-media-997-958-failed-"));
  owned.defer(() => rm(parent, { recursive: true, force: true }));
  const db = await freshDb();
  owned.defer(() => closeDb(db));
  const clock = createFrozenClock();
  // biome-ignore lint/nursery/useDisposables: ownership transfers to the root; failed job construction must dispose this exact scheduler.
  const timers = createControlledTimers(clock);
  const failure = new Error("controlled physical interval-arm refusal");
  const arm = vi.spyOn(timers, "interval").mockImplementation(() => {
    throw failure;
  });
  try {
    await expect(createServerHarness({ db, clock, timers, temporaryParentDir: parent })).rejects.toBe(failure);
    expect(arm).toHaveBeenCalledTimes(1);
    expect(await readdir(parent)).toEqual([]);
    expect(await db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
    expect(timers.pending()).toBe(0);
    expect(() => timers.timeout(() => undefined, 1)).toThrow("disposed timer scheduler");
  } finally {
    arm.mockRestore();
  }
});

test("a physical directory-construction failure still disposes the timer transferred at root admission", async () => {
  await using parentResources = new AsyncDisposableStack();
  const parent = await mkdtemp(join(tmpdir(), "codex-compose-media-997-958-early-failed-"));
  parentResources.defer(() => rm(parent, { recursive: true, force: true }));
  // biome-ignore lint/nursery/useDisposables: root admission owns this timer; assertions precede the proof's finally fallback for mutant cleanup.
  const timers = createControlledTimers(createFrozenClock());
  try {
    await expect(createServerHarness({ timers, temporaryParentDir: join(parent, "absent") })).rejects.toMatchObject({ code: "ENOENT" });
    expect(() => timers.timeout(() => undefined, 1)).toThrow("disposed timer scheduler");
    expect(timers.pending()).toBe(0);
    expect(await readdir(parent)).toEqual([]);
  } finally {
    timers[Symbol.dispose]();
  }
});

test("service jobs start once and root disposal waits for every actual lane read after cancellation", async () => {
  await using database = new AsyncDisposableStack();
  const held = await freshHeldDb();
  database.defer(() => closeDb(held.db));
  const gate = held.hold(/from "workloads".*"lane".*"scheduled_at"/u, WORKLOAD_LANES.length);
  let harness: ServerTestHarness | undefined;
  let disposing: Promise<void> | undefined;
  let stopObservation: (() => void) | undefined;
  try {
    harness = await createServerHarness({ db: held.db });
    await gate.reached;
    await harness.settleBackground();
    const before = harness.timers.pending();
    harness.app.startJobs();
    expect(harness.timers.pending()).toBe(before);
    const stopped = Promise.withResolvers<void>();
    // biome-ignore lint/nursery/useDisposables: this is a borrowed graph bus; root disposal stops it before joining the held worker.
    const bus = harness.app.liveBuses.chatOpen;
    const setTap = bus.setChatOpenTap;
    const observation = vi.spyOn(bus, "setChatOpenTap").mockImplementation((next) => {
      setTap.call(bus, next);
      if (next === null) {
        stopped.resolve();
      }
    });
    stopObservation = (): void => observation.mockRestore();
    let disposed = false;
    disposing = Promise.resolve(harness[Symbol.asyncDispose]()).then(() => {
      disposed = true;
    });
    await stopped.promise;
    expect(disposed).toBe(false);
    expect(await held.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
    gate.release();
    await disposing;
    expect(harness.timers.pending()).toBe(0);
    expect(() => harness?.app.startJobs()).toThrow("service jobs are disposed");
    expect(await held.db.all(sql`select 1 as retained`)).toEqual([{ retained: 1 }]);
  } finally {
    gate.release();
    await disposing;
    await harness?.[Symbol.asyncDispose]();
    stopObservation?.();
  }
});
